"""Text Data Analytics for The Man Store knowledge / user messages.

Pillars:
1) Data Cleaning — normalize messy Khmer/English shopping text
2) Data Quality — check FAQ / knowledge completeness & conflicts
3) Data Analytics — coverage stats to improve Ask→Answer matching
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import config
from services.store import apply_typo_corrections, load_store_info
from services.reverse_text import decode_reversed_text


# ---------------------------------------------------------------------------
# 1) Data Cleaning
# ---------------------------------------------------------------------------

_KHMER_DIGITS = str.maketrans("០១២៣៤៥៦៧៨៩", "0123456789")


def clean_text(text: str, store_info: dict | None = None) -> str:
    """Clean user / FAQ text for matching and analytics (does not scold the user)."""
    if text is None:
        return ""
    out = str(text)
    out = out.replace("\u200b", "").replace("\ufeff", "")  # zero-width / BOM
    out = out.translate(_KHMER_DIGITS)
    out = out.replace("ពណ័", "ពណ៌").replace("ពណ៍", "ពណ៌")
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = out.strip().strip("\"'`“”")
    # Collapse repeated punctuation: ??? → ?, !!! → !
    out = re.sub(r"([!?។\.])\1{2,}", r"\1\1", out)
    info = store_info if store_info is not None else load_store_info()
    out = apply_typo_corrections(out, info)
    # Reverse-letter / reverse-word-order (olleh→hello, product this love I→…)
    decoded = decode_reversed_text(out)
    if decoded != out:
        out = decoded
    return out.strip()


def clean_batch(texts: list[str], store_info: dict | None = None) -> list[str]:
    info = store_info if store_info is not None else load_store_info()
    return [clean_text(t, info) for t in texts]


# ---------------------------------------------------------------------------
# 2) Data Quality
# ---------------------------------------------------------------------------

REQUIRED_STORE_FIELDS = (
    "store_name",
    "assistant_name",
    "brand_summary",
    "payment_methods",
    "delivery_note",
    "how_to_order",
    "return_policy",
    "faq",
)


def quality_check_store(store_info: dict | None = None) -> dict[str, Any]:
    """Score and list quality issues in store_info.json (FAQ + knowledge)."""
    info = store_info if store_info is not None else load_store_info()
    issues: list[dict[str, str]] = []
    faq = list(info.get("faq") or [])
    chunks = list(info.get("knowledge_chunks") or [])

    for field in REQUIRED_STORE_FIELDS:
        val = info.get(field)
        if val in (None, "", [], {}):
            issues.append(
                {
                    "severity": "high",
                    "type": "missing_field",
                    "message": f"Required field empty: {field}",
                }
            )

    seen_ids: set[str] = set()
    keyword_owners: dict[str, list[str]] = defaultdict(list)
    missing_en = 0
    empty_kw = 0
    short_answers = 0

    for item in faq:
        faq_id = str(item.get("id") or "").strip() or "(no-id)"
        if faq_id in seen_ids:
            issues.append(
                {
                    "severity": "high",
                    "type": "duplicate_faq_id",
                    "message": f"Duplicate FAQ id: {faq_id}",
                }
            )
        seen_ids.add(faq_id)

        kws = [str(k).strip() for k in (item.get("keywords") or []) if str(k).strip()]
        if not kws:
            empty_kw += 1
            issues.append(
                {
                    "severity": "high",
                    "type": "empty_keywords",
                    "message": f"FAQ '{faq_id}' has no keywords",
                }
            )
        for kw in kws:
            keyword_owners[kw.lower()].append(faq_id)

        ans = str(item.get("answer") or "").strip()
        ans_en = str(item.get("answer_en") or "").strip()
        if not ans:
            issues.append(
                {
                    "severity": "high",
                    "type": "missing_answer",
                    "message": f"FAQ '{faq_id}' missing Khmer answer",
                }
            )
        elif len(ans) < 20:
            short_answers += 1
            issues.append(
                {
                    "severity": "low",
                    "type": "short_answer",
                    "message": f"FAQ '{faq_id}' Khmer answer is very short",
                }
            )
        if not ans_en:
            missing_en += 1
            issues.append(
                {
                    "severity": "medium",
                    "type": "missing_answer_en",
                    "message": f"FAQ '{faq_id}' missing English answer",
                }
            )

        # Broken template placeholders that won't fill
        for field_name, template in (("answer", ans), ("answer_en", ans_en)):
            for token in re.findall(r"\{([a-zA-Z0-9_]+)\}", template):
                # only flag obvious unknowns later via analytics if needed
                if token.startswith(" "):
                    issues.append(
                        {
                            "severity": "medium",
                            "type": "bad_placeholder",
                            "message": f"FAQ '{faq_id}.{field_name}' bad placeholder {{{token}}}",
                        }
                    )

    # Keyword collisions (same keyword owned by many FAQs) — matching becomes noisy
    collisions = {
        kw: ids for kw, ids in keyword_owners.items() if len(set(ids)) >= 3 and len(kw) >= 3
    }
    for kw, ids in sorted(collisions.items(), key=lambda x: -len(x[1]))[:25]:
        issues.append(
            {
                "severity": "medium",
                "type": "keyword_collision",
                "message": f"Keyword '{kw}' shared by {len(set(ids))} FAQs: {', '.join(sorted(set(ids))[:6])}",
            }
        )

    for chunk in chunks:
        cid = str(chunk.get("id") or "").strip() or "(chunk)"
        if not (chunk.get("topics") or []):
            issues.append(
                {
                    "severity": "medium",
                    "type": "chunk_no_topics",
                    "message": f"knowledge_chunk '{cid}' has no topics",
                }
            )
        if not str(chunk.get("text") or "").strip():
            issues.append(
                {
                    "severity": "high",
                    "type": "chunk_empty_text",
                    "message": f"knowledge_chunk '{cid}' has empty text",
                }
            )

    high = sum(1 for i in issues if i["severity"] == "high")
    medium = sum(1 for i in issues if i["severity"] == "medium")
    low = sum(1 for i in issues if i["severity"] == "low")
    # Simple score: start 100, subtract
    score = max(0, 100 - high * 8 - medium * 2 - low * 1)

    return {
        "score": score,
        "grade": (
            "A"
            if score >= 90
            else "B"
            if score >= 75
            else "C"
            if score >= 60
            else "D"
            if score >= 40
            else "F"
        ),
        "counts": {
            "faq": len(faq),
            "knowledge_chunks": len(chunks),
            "typo_corrections": len(info.get("typo_corrections") or {}),
            "missing_answer_en": missing_en,
            "empty_keywords": empty_kw,
            "short_answers": short_answers,
            "keyword_collisions": len(collisions),
            "issues_high": high,
            "issues_medium": medium,
            "issues_low": low,
            "issues_total": len(issues),
        },
        "issues": issues[:200],
    }


# ---------------------------------------------------------------------------
# 3) Data Analytics (text / FAQ coverage)
# ---------------------------------------------------------------------------

INTENT_BUCKETS = {
    "payment": ("បង់", "payment", "khqr", "visa", "ទូទាត់"),
    "delivery": ("ដឹក", "delivery", "shipping", "ផ្ញើ"),
    "return": ("ប្តូរ", "ត្រឡប់", "return", "refund", "exchange"),
    "sizing": ("ទំហំ", "size", "ទម្ងន់", "weight"),
    "products": ("អាវ", "ខោ", "ស្បែកជើង", "hoodie", "product", "ទំនិញ"),
    "budget": ("ថវិកា", "budget", "ត្រឹម", "ថោក", "sale", "cheap"),
    "color": ("ពណ៌", "color", "colour"),
    "order_track": ("តាមដាន", "track", "order", "កម្មង់"),
    "account": ("login", "គណនី", "password", "account"),
    "greeting": ("សួស្តី", "hello", "hi", "good morning"),
}


def analyze_store_text(store_info: dict | None = None) -> dict[str, Any]:
    """Analytics over FAQ/knowledge text for improving Ask→Answer coverage."""
    info = store_info if store_info is not None else load_store_info()
    faq = list(info.get("faq") or [])
    chunks = list(info.get("knowledge_chunks") or [])

    all_keywords: list[str] = []
    km_chars = 0
    en_chars = 0
    for item in faq:
        kws = [str(k) for k in (item.get("keywords") or [])]
        all_keywords.extend(kws)
        km_chars += len(str(item.get("answer") or ""))
        en_chars += len(str(item.get("answer_en") or ""))

    kw_counter = Counter(k.lower() for k in all_keywords)
    bilingual = sum(
        1
        for item in faq
        if str(item.get("answer") or "").strip()
        and str(item.get("answer_en") or "").strip()
    )

    coverage = {}
    blob = " ".join(all_keywords).lower()
    for name, keys in INTENT_BUCKETS.items():
        hits = sum(1 for k in keys if k.lower() in blob)
        coverage[name] = {
            "keyword_hits": hits,
            "of": len(keys),
            "ok": hits > 0,
        }

    return {
        "faq_count": len(faq),
        "chunk_count": len(chunks),
        "keyword_total": len(all_keywords),
        "keyword_unique": len(kw_counter),
        "bilingual_faq_pct": round(100.0 * bilingual / max(1, len(faq)), 1),
        "answer_chars_km": km_chars,
        "answer_chars_en": en_chars,
        "top_keywords": kw_counter.most_common(20),
        "intent_coverage": coverage,
        "typo_map_size": len(info.get("typo_corrections") or {}),
    }


def analyze_user_texts(texts: list[str], store_info: dict | None = None) -> dict[str, Any]:
    """Light analytics on a batch of user messages (after cleaning)."""
    info = store_info if store_info is not None else load_store_info()
    cleaned = clean_batch(texts, info)
    lengths = [len(t) for t in cleaned if t]
    has_khmer = sum(1 for t in cleaned if re.search(r"[\u1780-\u17FF]", t))
    has_dollar = sum(1 for t in cleaned if "$" in t or "៛" in t)
    return {
        "messages": len(texts),
        "non_empty": len(lengths),
        "avg_len": round(sum(lengths) / max(1, len(lengths)), 1),
        "khmer_messages": has_khmer,
        "budget_like": has_dollar,
        "samples_cleaned": cleaned[:10],
    }


def full_report(store_info: dict | None = None) -> dict[str, Any]:
    info = store_info if store_info is not None else load_store_info()
    return {
        "cleaning": {
            "description": "normalize digits, typos, whitespace, odd punctuation",
            "typo_rules": len(info.get("typo_corrections") or {}),
        },
        "quality": quality_check_store(info),
        "analytics": analyze_store_text(info),
    }


def print_report(report: dict[str, Any] | None = None) -> None:
    report = report or full_report()
    q = report["quality"]
    a = report["analytics"]
    print("=== The Man Store Text Data Report ===")
    print(f"Quality score: {q['score']} ({q['grade']})")
    print(
        f"FAQ={a['faq_count']}  chunks={a['chunk_count']}  "
        f"keywords={a['keyword_unique']} unique / {a['keyword_total']} total  "
        f"bilingual={a['bilingual_faq_pct']}%"
    )
    print("Intent coverage:")
    for name, meta in a["intent_coverage"].items():
        mark = "OK" if meta["ok"] else "GAP"
        print(f"  [{mark}] {name}: {meta['keyword_hits']}/{meta['of']}")
    print(
        f"Issues: high={q['counts']['issues_high']} "
        f"medium={q['counts']['issues_medium']} "
        f"low={q['counts']['issues_low']}"
    )
    print("--- Top issues ---")
    for issue in q["issues"][:15]:
        print(f"  ({issue['severity']}) {issue['type']}: {issue['message']}")


def save_report(path: str | Path | None = None) -> Path:
    out = Path(path) if path else config.BASE_DIR / "data" / "text_quality_report.json"
    report = full_report()
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


if __name__ == "__main__":
    print_report()
    saved = save_report()
    print(f"\nSaved: {saved}")
