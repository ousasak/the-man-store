<?php

namespace App\Services;

use App\Models\Setting;
use App\Support\FaqContent;

/**
 * Lightweight FAQ retrieval for chat prompts (step-4 lite — no Qdrant required).
 * Uses keyword overlap against FAQ Q&A already stored in the app.
 */
class ChatFaqContextService
{
    /**
     * Top matching FAQ snippets for a user message (Khmer + English).
     */
    public function toPromptBlock(string $message, int $limit = 4): string
    {
        $hits = $this->match($message, $limit);
        if ($hits === []) {
            return '';
        }

        $lines = ['=== RELEVANT FAQ (prefer these for policy questions) ==='];
        foreach ($hits as $i => $hit) {
            $n = $i + 1;
            $lines[] = "{$n}. Q: {$hit['question']}";
            $lines[] = "   A: {$hit['answer']}";
        }

        return implode("\n", $lines);
    }

    /**
     * @return list<array{question: string, answer: string, score: float}>
     */
    public function match(string $message, int $limit = 4): array
    {
        $needle = mb_strtolower(trim($message));
        if ($needle === '') {
            return [];
        }

        $tokens = $this->tokens($needle);
        $scored = [];

        foreach ($this->allItems() as $item) {
            $q = mb_strtolower((string) ($item['question'] ?? ''));
            $a = mb_strtolower((string) ($item['answer'] ?? ''));
            if ($q === '') {
                continue;
            }

            $score = 0.0;
            if (str_contains($q, $needle) || str_contains($needle, $q)) {
                $score += 10;
            }

            foreach ($tokens as $token) {
                if (mb_strlen($token) < 2) {
                    continue;
                }
                if (str_contains($q, $token)) {
                    $score += 2;
                } elseif (str_contains($a, $token)) {
                    $score += 0.5;
                }
            }

            if ($score <= 0) {
                continue;
            }

            $scored[] = [
                'question' => (string) $item['question'],
                'answer' => (string) $item['answer'],
                'score' => $score,
            ];
        }

        usort($scored, fn ($a, $b) => $b['score'] <=> $a['score']);

        return array_slice($scored, 0, max(1, $limit));
    }

    /**
     * @return list<array{question: string, answer: string}>
     */
    private function allItems(): array
    {
        $payload = $this->faqPayload();
        $items = [];

        foreach (['en', 'km'] as $locale) {
            $sections = data_get($payload, "locales.{$locale}.sections", []);
            if (! is_array($sections)) {
                continue;
            }
            foreach ($sections as $section) {
                foreach (($section['items'] ?? []) as $item) {
                    if (! is_array($item)) {
                        continue;
                    }
                    $q = trim((string) ($item['question'] ?? ''));
                    $a = trim((string) ($item['answer'] ?? ''));
                    if ($q === '' || $a === '') {
                        continue;
                    }
                    $items[] = ['question' => $q, 'answer' => $a];
                }
            }
        }

        return $items;
    }

    private function faqPayload(): array
    {
        $row = Setting::query()->where('key', 'faq')->first();
        $value = is_array($row?->value) ? $row->value : [];

        if ($value === []) {
            return FaqContent::defaults();
        }

        return array_replace_recursive(FaqContent::defaults(), $value);
    }

    /**
     * @return list<string>
     */
    private function tokens(string $text): array
    {
        $parts = preg_split('/[\s\p{P}\p{S}]+/u', $text) ?: [];

        return array_values(array_unique(array_filter(
            array_map('trim', $parts),
            fn ($t) => $t !== '',
        )));
    }
}
