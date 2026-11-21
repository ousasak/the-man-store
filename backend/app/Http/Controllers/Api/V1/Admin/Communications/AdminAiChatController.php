<?php

namespace App\Http\Controllers\Api\V1\Admin\Communications;

use App\Http\Controllers\Controller;
use App\Services\AdminDashboardContextService;
use App\Services\AiConversationStore;
use App\Services\ChatFaqContextService;
use App\Services\HuggingFaceSpaceChatService;
use Illuminate\Http\Request;
use RuntimeException;

class AdminAiChatController extends Controller
{
    public function __construct(
        private readonly AdminDashboardContextService $dashboardContext,
        private readonly HuggingFaceSpaceChatService $chatAi,
        private readonly AiConversationStore $conversations,
        private readonly ChatFaqContextService $faqContext,
    ) {
    }

    public function chat(Request $request)
    {
        $validated = $request->validate([
            'message' => 'required|string|max:4000',
            'conversation_id' => 'nullable|string|max:128',
        ]);

        if (! $this->chatAi->isConfigured()) {
            return response()->json([
                'error' => 'ai_not_configured',
                'message' => 'Admin AI is not configured. Set CHATBOT_HF_URL in your backend .env (Hugging Face Space).',
            ], 503);
        }

        $conversation = $this->conversations->loadOrCreate(
            $validated['conversation_id'] ?? null,
            'admin',
        );
        $current = trim($validated['message']);
        $casual = $this->isCasualChat($current);
        $history = $conversation['messages'];

        // Casual talk goes to the Space as the admin typed it. Wrapping KPI dumps
        // + "answer ONLY from database facts" makes "hi bro" look like a report bot
        // and can stall Hugging Face until the browser shows Network Error.
        $messages = [];
        if (! $casual) {
            $messages[] = ['role' => 'system', 'content' => $this->buildSystemPrompt($current, $history !== [])];
        }
        foreach ($history as $item) {
            $role = ($item['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
            $content = trim((string) ($item['content'] ?? ''));
            if ($content === '') {
                continue;
            }
            $messages[] = ['role' => $role, 'content' => $content];
        }
        $messages[] = ['role' => 'user', 'content' => $current];

        if (count($messages) > 14) {
            $hasSystem = ($messages[0]['role'] ?? '') === 'system';
            $tail = array_slice($messages, $hasSystem ? 1 : 0);
            $tail = array_slice($tail, -12);
            $messages = $hasSystem ? array_merge([$messages[0]], $tail) : $tail;
        }

        try {
            $sessionHash = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $conversation['id']) ?: null;
            $result = $this->chatAi->chat($messages, [
                'session_hash' => $sessionHash ?: \Illuminate\Support\Str::uuid()->toString(),
            ]);
        } catch (RuntimeException $e) {
            report($e);

            $unreachable = str_contains(strtolower($e->getMessage()), 'not reachable')
                || str_contains(strtolower($e->getMessage()), 'not configured')
                || str_contains(strtolower($e->getMessage()), 'timed out');

            return response()->json([
                'error' => $unreachable ? 'ai_unreachable' : 'ai_upstream_error',
                'message' => $e->getMessage(),
            ], $unreachable ? 503 : 502);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'error' => 'ai_error',
                'message' => 'Could not reach the AI service. Please try again shortly.',
            ], 500);
        }

        $reply = $this->substituteUnresolvedPlaceholders(
            $result['reply'],
            array_merge(
                $this->dashboardContext->toFlatInputs(),
                $this->dashboardContext->enrichInputsForMessage($validated['message']),
            ),
        );

        $tables = $casual ? [] : $this->dashboardContext->buildRichTablesForMessage($current);
        $reply = $this->polishReplyForRichTables($reply, $tables);

        $history[] = ['role' => 'user', 'content' => $current];
        $history[] = ['role' => 'assistant', 'content' => $reply];
        $this->conversations->save('admin', $conversation['id'], $history);

        return response()->json([
            'reply' => $reply,
            'tables' => $tables,
            'conversation_id' => $conversation['id'],
            'message_id' => null,
            'provider' => $result['provider'] ?? 'huggingface',
            'model' => $result['model'],
        ]);
    }

    private function isCasualChat(string $message): bool
    {
        $hay = mb_strtolower(trim($message));
        $hay = trim($hay, " \t\n\r\0\x0B?!.,");
        if ($hay === '') {
            return false;
        }

        if (preg_match('/\b(hi|hello|hey|yo|sup|hiya|howdy)\b/u', $hay)) {
            return true;
        }
        if (preg_match('/how are you|how\'s it going|what\'s up|whats up|good morning|good afternoon|good evening|thanks|thank you/u', $hay)) {
            return true;
        }

        return str_contains($hay, 'សួស្តី')
            || str_contains($hay, 'សួស្ដី')
            || str_contains($hay, 'ជំរាបសួរ')
            || str_contains($hay, 'សុខសប្បាយ')
            || str_contains($hay, 'អរគុណ');
    }

    private function buildSystemPrompt(string $message, bool $isFollowUp): string
    {
        $style = $isFollowUp
            ? "You are a friendly The Man Store Admin Console colleague. Answer what was asked in the admin's language (Khmer or English). "
                . "You may chat naturally. For numbers, use the live facts below — never invent them. "
                . "NEVER use markdown tables (| pipe syntax) or ### headings — the app renders rich tables automatically."
            : "You are a friendly The Man Store Admin Console colleague. Match the admin's language (Khmer or English). "
                . "Chat naturally; when they ask for metrics, use the live facts below. "
                . "NEVER use markdown tables (| pipe syntax) or ### headings — product/inventory data appears as UI tables automatically.";

        $facts = $this->dashboardContext->toCompactQueryContext($message);
        $enrichment = $this->dashboardContext->enrichInputsForMessage($message);
        $extra = '';
        foreach (['user_lookup_text', 'order_lookup_text', 'product_lookup_text'] as $key) {
            if (! empty($enrichment[$key])) {
                $extra .= "\n" . $enrichment[$key];
            }
        }

        $faq = $this->faqContext->toPromptBlock($message, 3);

        return $style
            . "\n\n[Live The Man Store Admin Console data — authoritative source; never invent data]\n"
            . $facts
            . ($extra !== '' ? "\n\n[Lookups for this question]\n" . trim($extra) : '')
            . ($faq !== '' ? "\n\n" . $faq : '');
    }

    private function substituteUnresolvedPlaceholders(string $reply, array $inputs): string
    {
        return (string) preg_replace_callback(
            '/\{\{\s*([a-z0-9_]+)\s*\}\}/i',
            function (array $m) use ($inputs) {
                $key = $m[1];
                if (isset($inputs[$key]) && is_scalar($inputs[$key])) {
                    return (string) $inputs[$key];
                }

                return $m[0];
            },
            $reply,
        );
    }

    /**
     * @param  list<array<string, mixed>>  $tables
     */
    private function polishReplyForRichTables(string $reply, array $tables): string
    {
        if ($tables === []) {
            return $reply;
        }

        $clean = preg_replace('/^\|.+\|\s*\r?\n\|[-:\s|]+\|\s*\r?\n(?:\|.+\|\s*\r?\n?)+/m', '', $reply) ?? $reply;
        $clean = preg_replace('/^#{1,6}\s+.+$/m', '', $clean) ?? $clean;
        $clean = preg_replace("/\n{3,}/", "\n\n", trim($clean));

        if ($clean === '') {
            foreach ($tables as $table) {
                if (($table['variant'] ?? '') === 'discount') {
                    return 'ខាងក្រោមជាផលិតផលដែលលក់យឺត — គួរពិចារណាបញ្ចុះតម្លៃ៖';
                }
            }

            return 'នេះជាទិន្នន័យពី database៖';
        }

        $paragraphs = preg_split('/\n\s*\n/', $clean) ?: [$clean];
        $first = trim((string) ($paragraphs[0] ?? $clean));

        if (strlen($first) > 220) {
            $sentences = preg_split('/(?<=[.!?។])\s+/u', $first) ?: [$first];

            return trim(implode(' ', array_slice($sentences, 0, 2)));
        }

        return $first;
    }
}
