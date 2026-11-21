import React, { useEffect, useMemo, useState } from "react";
import api from "../../lib/api.js";
import { useLanguage } from "../../lib/i18n.jsx";
import { faqToPageSections, normalizeFaqPayload, resolveFaqLocale } from "../../lib/faqContent.js";
import { fetchWithPageCache, readPageCache } from "../../lib/pageContentCache.js";
import {
  DEFAULT_PRIVACY_BILINGUAL,
  getPrivacyLocaleView,
  normalizePrivacyPagePayload,
  orderPrivacySectionEntries,
} from "../../lib/privacyPageContent.js";
import {
  DEFAULT_TERMS_BILINGUAL,
  getTermsLocaleView,
  normalizeTermsPagePayload,
  orderTermsSectionEntries,
} from "../../lib/termsPageContent.js";
import {
  DEFAULT_COOKIES_BILINGUAL,
  getCookiesLocaleView,
  normalizeCookiesPagePayload,
  orderCookiesSectionEntries,
} from "../../lib/cookiesPageContent.js";
import {
  DEFAULT_CONTACT_BILINGUAL,
  getContactLocaleView,
  normalizeContactPagePayload,
  orderContactInfoCards,
  orderContactSubjects,
} from "../../lib/contactPageContent.js";

const proseH2 = "mt-8 mb-3 text-lg font-bold text-slate-900 first:mt-0";
const proseP = "text-[15px] leading-relaxed text-slate-700";
const proseUl = "mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-700";
const fieldLabel = "mb-1.5 block text-sm font-semibold text-slate-800";
const fieldInput =
  "block w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900";

function ModalTitle({ children, subtitle }) {
  return (
    <header className="mb-8 pr-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{children}</h1>
      {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
    </header>
  );
}

function PrivacyBody() {
  const { t, language } = useLanguage();
  const [pageContent, setPageContent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/privacy-page");
        if (!cancelled && data?.privacy_page) {
          setPageContent(normalizePrivacyPagePayload(data.privacy_page));
        }
      } catch {
        if (!cancelled) setPageContent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(
    () => getPrivacyLocaleView(pageContent || DEFAULT_PRIVACY_BILINGUAL, language),
    [pageContent, language]
  );
  const orderedSections = useMemo(
    () => orderPrivacySectionEntries(content.sections, content.section_order),
    [content.sections, content.section_order]
  );

  return (
    <article>
      <ModalTitle subtitle={content.last_updated || t("privacyLastUpdated")}>
        {content.title || t("privacyPolicyTitle")}
      </ModalTitle>
      {orderedSections.map(([sectionKey, section]) => (
        <section key={sectionKey}>
          <h2 className={proseH2}>{section.title}</h2>
          {section.intro ? <p className={`${proseP} mb-3`}>{section.intro}</p> : null}
          {section.body ? <p className={proseP}>{section.body}</p> : null}
          {section.items?.length > 0 ? (
            <ul className={proseUl}>
              {section.items.map((item, index) => (
                <li key={`${sectionKey}-${index}`}>
                  {item.label ? (
                    <>
                      <strong>{item.label}</strong> {item.text}
                    </>
                  ) : (
                    item.text
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {section.footer ? <p className={`${proseP} mt-3`}>{section.footer}</p> : null}
          {section.contact_box ? (
            <div className="mt-4 border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {section.contact_box.company ? (
                <p className="font-semibold text-slate-900">{section.contact_box.company}</p>
              ) : null}
              {section.contact_box.email ? (
                <p>
                  {section.contact_box.email_label || t("privacyEmailLabel")}{" "}
                  <a className="underline" href={`mailto:${section.contact_box.email}`}>
                    {section.contact_box.email}
                  </a>
                </p>
              ) : null}
              {section.contact_box.location ? <p>{section.contact_box.location}</p> : null}
            </div>
          ) : null}
        </section>
      ))}
    </article>
  );
}

function TermsBody() {
  const { t, language } = useLanguage();
  const [pageContent, setPageContent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/terms-page");
        if (!cancelled && data?.terms_page) {
          setPageContent(normalizeTermsPagePayload(data.terms_page));
        }
      } catch {
        if (!cancelled) setPageContent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(
    () => getTermsLocaleView(pageContent || DEFAULT_TERMS_BILINGUAL, language),
    [pageContent, language]
  );
  const orderedSections = useMemo(
    () => orderTermsSectionEntries(content.sections, content.section_order),
    [content.sections, content.section_order]
  );

  return (
    <article>
      <ModalTitle subtitle={content.last_updated || t("termsLastUpdated")}>
        {content.title || t("termsTitle")}
      </ModalTitle>
      {orderedSections.map(([sectionKey, section]) => (
        <section key={sectionKey}>
          <h2 className={proseH2}>{section.title}</h2>
          <p className={proseP}>{section.body}</p>
        </section>
      ))}
    </article>
  );
}

function CookiesBody() {
  const { t, language } = useLanguage();
  const [pageContent, setPageContent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/cookies-page");
        if (!cancelled && data?.cookies_page) {
          setPageContent(normalizeCookiesPagePayload(data.cookies_page));
        }
      } catch {
        if (!cancelled) setPageContent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(
    () => getCookiesLocaleView(pageContent || DEFAULT_COOKIES_BILINGUAL, language),
    [pageContent, language]
  );
  const orderedSections = useMemo(
    () => orderCookiesSectionEntries(content.sections, content.section_order),
    [content.sections, content.section_order]
  );

  return (
    <article>
      <ModalTitle subtitle={content.last_updated || t("cookiesLastUpdated")}>
        {content.title || t("cookiesTitle")}
      </ModalTitle>
      {orderedSections.map(([sectionKey, section]) => (
        <section key={sectionKey}>
          <h2 className={proseH2}>{section.title}</h2>
          {section.body ? <p className={proseP}>{section.body}</p> : null}
          {section.items?.length > 0 ? (
            <ul className={proseUl}>
              {section.items.map((item, index) => (
                <li key={`${sectionKey}-${index}`}>
                  {item.label ? (
                    <>
                      <strong>{item.label}</strong> {item.text}
                    </>
                  ) : (
                    item.text
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}

function buildFaqFallback(t) {
  return [
    {
      title: t("faqPageOrdersShipping"),
      items: [
        { q: t("faqPageTrackOrderQ"), a: t("faqPageTrackOrderA") },
        { q: t("faqPageShippingTimeQ"), a: t("faqPageShippingTimeA") },
        { q: t("faqPageInternationalShippingQ"), a: t("faqPageInternationalShippingA") },
      ],
    },
    {
      title: t("faqPageReturnsRefunds"),
      items: [
        { q: t("faqPageReturnPolicyQ"), a: t("faqPageReturnPolicyA") },
        { q: t("faqPageReturnStartQ"), a: t("faqPageReturnStartA") },
        { q: t("faqPageRefundTimeQ"), a: t("faqPageRefundTimeA") },
      ],
    },
    {
      title: t("faqPagePayments"),
      items: [
        { q: t("faqPagePaymentMethodsQ"), a: t("faqPagePaymentMethodsA") },
        { q: t("faqPagePaymentSecureQ"), a: t("faqPagePaymentSecureA") },
      ],
    },
    {
      title: t("faqPageAccountSupport"),
      items: [
        { q: t("faqPageCreateAccountQ"), a: t("faqPageCreateAccountA") },
        { q: t("faqPageForgotPasswordQ"), a: t("faqPageForgotPasswordA") },
        { q: t("faqPageContactSupportQ"), a: t("faqPageContactSupportA") },
      ],
    },
  ];
}

function FaqBody() {
  const { t, language } = useLanguage();
  const [faqData, setFaqData] = useState(() => readPageCache("faq"));

  useEffect(() => {
    let cancelled = false;
    fetchWithPageCache("faq", async () => {
      const { data } = await api.get("/faq");
      return data?.faq ? normalizeFaqPayload(data.faq) : null;
    })
      .then((payload) => {
        if (!cancelled && payload) setFaqData(payload);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedFaq = useMemo(
    () => (faqData ? resolveFaqLocale(faqData, language) : null),
    [faqData, language]
  );

  const sections = useMemo(() => {
    const managed = faqData ? faqToPageSections(faqData, language) : [];
    if (managed.length) return managed;
    return buildFaqFallback(t);
  }, [faqData, language, t]);

  return (
    <article>
      <ModalTitle subtitle={resolvedFaq?.subtitle || t("faqPageSubtitle")}>
        {resolvedFaq?.title || t("faqPageTitle")}
      </ModalTitle>
      <div className="space-y-6">
        {sections.map((section, idx) => (
          <section key={`${section.title}-${idx}`}>
            <h2 className={proseH2}>{section.title}</h2>
            <div className="divide-y divide-slate-200 border-t border-slate-200">
              {section.items.map((item, i) => (
                <details key={`${section.title}-${i}`} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium text-slate-900">
                    <span>{item.q}</span>
                    <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                  </summary>
                  <p className={`mt-2 ${proseP} whitespace-pre-wrap`}>{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function ContactBody() {
  const { t, language } = useLanguage();
  const [pageContent, setPageContent] = useState(() => readPageCache("contact"));
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchWithPageCache("contact", async () => {
      const { data } = await api.get("/contact-page");
      return data?.contact_page ? normalizeContactPagePayload(data.contact_page) : null;
    })
      .then((payload) => {
        if (!cancelled && payload) setPageContent(payload);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(
    () => getContactLocaleView(pageContent || DEFAULT_CONTACT_BILINGUAL, language),
    [pageContent, language]
  );
  const subjects = useMemo(() => orderContactSubjects(content.form), [content.form]);
  const infoCards = useMemo(() => orderContactInfoCards(content), [content]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      await api.post("/contact", form);
      setSuccess(true);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err) {
      setError(err.response?.data?.message || t("contactSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <article>
      <ModalTitle subtitle={content.subtitle || t("contactSubtitle")}>
        {content.title || t("contactUsTitle")}
      </ModalTitle>

      {success ? (
        <div className="mb-6 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t("messageSentDesc")}
        </div>
      ) : null}
      {error ? (
        <div className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>{content.form.name_label} *</label>
            <input
              className={fieldInput}
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={content.form.name_placeholder}
            />
          </div>
          <div>
            <label className={fieldLabel}>{content.form.email_label} *</label>
            <input
              className={fieldInput}
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder={content.form.email_placeholder}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>{content.form.phone_label}</label>
            <input
              className={fieldInput}
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder={content.form.phone_placeholder}
            />
          </div>
          <div>
            <label className={fieldLabel}>{content.form.subject_label} *</label>
            <select
              className={fieldInput}
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            >
              <option value="">{content.form.select_subject_label}</option>
              {subjects.map((subject) => (
                <option key={subject.value} value={subject.value}>
                  {subject.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={fieldLabel}>{content.form.message_label} *</label>
          <textarea
            className={`${fieldInput} min-h-[8rem] resize-y`}
            required
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder={content.form.message_placeholder}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? t("sending") : content.form.submit_label}
        </button>
      </form>

      {infoCards.length > 0 ? (
        <div className="mt-10 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-3">
          {infoCards.map(([cardKey, card]) => (
            <div key={cardKey}>
              <h3 className="text-sm font-bold text-slate-900">{card.title}</h3>
              {card.href ? (
                <a href={card.href} className="mt-1 block text-sm text-slate-600 underline">
                  {card.line1}
                </a>
              ) : (
                <p className="mt-1 text-sm text-slate-600">{card.line1}</p>
              )}
              {card.line2 ? <p className="text-sm text-slate-600">{card.line2}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SupportBody({ onOpenPage }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      await api.post("/contact", form);
      setSuccess(true);
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setError(err.response?.data?.message || t("contactSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <article>
      <ModalTitle subtitle={t("supportSubtitle")}>{t("helpSupport")}</ModalTitle>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onOpenPage?.("contact")}
          className="border border-slate-200 px-4 py-4 text-left transition hover:border-slate-400"
        >
          <div className="text-sm font-bold text-slate-900">{t("contactUsTitle")}</div>
          <p className="mt-1 text-sm text-slate-600">{t("contactTeamDesc")}</p>
        </button>
        <a
          href="mailto:kalapakgpt@gmail.com"
          className="border border-slate-200 px-4 py-4 text-left transition hover:border-slate-400"
        >
          <div className="text-sm font-bold text-slate-900">{t("emailUs")}</div>
          <p className="mt-1 text-sm text-slate-600">{t("supportCtaSubtitle")}</p>
        </a>
      </div>

      <h2 className={proseH2}>{t("sendUsMessage")}</h2>
      <p className={`${proseP} mb-4`}>{t("sendMessageSubtitle")}</p>

      {success ? (
        <div className="mb-4 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t("messageSentSuccess")}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={fieldLabel}>{t("yourName")}</label>
          <input
            className={fieldInput}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t("namePlaceholder")}
          />
        </div>
        <div>
          <label className={fieldLabel}>{t("emailAddress")}</label>
          <input
            className={fieldInput}
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder={t("emailPlaceholder")}
          />
        </div>
        <div>
          <label className={fieldLabel}>{t("subject")}</label>
          <input
            className={fieldInput}
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder={t("subjectPlaceholder")}
          />
        </div>
        <div>
          <label className={fieldLabel}>{t("message")}</label>
          <textarea
            className={`${fieldInput} min-h-[7rem] resize-y`}
            required
            rows={4}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder={t("messagePlaceholderShort")}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? t("sending") : t("sendMessage")}
        </button>
      </form>
    </article>
  );
}

export default function InfoPageBody({ pageKey, onOpenPage }) {
  switch (pageKey) {
    case "privacy":
      return <PrivacyBody />;
    case "terms":
      return <TermsBody />;
    case "cookies":
      return <CookiesBody />;
    case "faq":
      return <FaqBody />;
    case "contact":
      return <ContactBody />;
    case "support":
      return <SupportBody onOpenPage={onOpenPage} />;
    default:
      return null;
  }
}
