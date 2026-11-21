<?php

namespace App\Http\Controllers\Api\V1\Storefront\Services;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\HuggingFaceSpaceChatService;
use App\Services\StorefrontChatContextService;
use Illuminate\Http\Request;
use RuntimeException;

class ChatbotController extends Controller
{
    public function __construct(
        private readonly StorefrontChatContextService $storeContext,
        private readonly HuggingFaceSpaceChatService $chatAi,
    ) {
    }

    private function defaults(): array
    {
        return [
            'enabled' => true,
            'greeting' => 'Hi there 👋',
            'welcome' => 'How can we help you today?',
            'messenger_url' => '',
            'telegram_url' => '',
            'instagram_url' => '',
            'social_links' => [],
        ];
    }

    public function settings()
    {
        $row = Setting::where('key', 'chatbot')->first();
        $value = is_array($row?->value) ? $row->value : [];

        return response()->json([
            'data' => array_merge($this->defaults(), $value),
        ]);
    }

    public function message(Request $request)
    {
        $validated = $request->validate([
            'message' => 'required|string|max:2000',
            'history' => 'sometimes|array',
            'history.*.role' => 'required_with:history|string',
            'history.*.content' => 'required_with:history|string',
            'conversation_id' => 'nullable|string|max:64',
        ]);

        if (! $this->chatAi->isConfigured()) {
            return response()->json([
                'error' => 'AI chatbot is not configured. Set CHATBOT_HF_URL in backend .env.',
            ], 503);
        }

        $current = trim($validated['message']);

        // Send the customer's words only. The Space already greets, jokes, answers
        // policy, and picks products — Laravel must not intercept or dump the catalog.
        $messages = [];

        foreach ($validated['history'] ?? [] as $item) {
            $role = ($item['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
            $content = trim((string) ($item['content'] ?? ''));
            if ($content === '' || $this->isLocalWelcome($content)) {
                continue;
            }
            $messages[] = ['role' => $role, 'content' => $content];
        }

        $last = $messages !== [] ? $messages[array_key_last($messages)] : null;
        if ($last && $last['role'] === 'user' && $last['content'] === $current) {
            array_pop($messages);
        }

        $messages[] = ['role' => 'user', 'content' => $current];

        if (count($messages) > 12) {
            $messages = array_slice($messages, -12);
        }

        try {
            $sessionHash = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($validated['conversation_id'] ?? '')) ?: null;
            $result = $this->chatAi->chat($messages, [
                'session_hash' => $sessionHash ?: \Illuminate\Support\Str::uuid()->toString(),
            ]);
        } catch (RuntimeException $e) {
            report($e);

            return response()->json([
                'error' => $e->getMessage(),
            ], str_contains(strtolower($e->getMessage()), 'not reachable')
                || str_contains(strtolower($e->getMessage()), 'timed out')
                ? 503
                : 502);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'error' => 'Chatbot request failed.',
            ], 500);
        }

        $reply = trim((string) $result['reply']);
        $products = $this->storeContext->productsFromReplyText($reply);

        return response()->json([
            'reply' => $this->polishReply($reply, $products),
            'products' => $products,
            'provider' => $result['provider'] ?? 'huggingface',
            'model' => $result['model'],
        ]);
    }

    private function isLocalWelcome(string $content): bool
    {
        return str_starts_with($content, "Hi! I'm The Man Store support")
            || str_starts_with($content, "Hi! I'm The Man Store support")
            || str_starts_with($content, 'I can help with:')
            || str_starts_with($content, 'Hey! Welcome to The Man Store')
            || str_starts_with($content, 'Hey! Welcome to The Man Store')
            || str_starts_with($content, 'សួស្តី! 😊 ស្វាគមន៍មក The Man Store')
            || str_starts_with($content, 'សួស្តី! 😊 ស្វាគមន៍មក The Man Store');
    }

    private function polishReply(string $reply, array $products): string
    {
        $clean = preg_replace('/^\|.+\|\s*\r?\n\|[-:\s|]+\|\s*\r?\n(?:\|.+\|\s*\r?\n?)+/m', '', $reply) ?? $reply;
        $clean = preg_replace('/^#{1,6}\s+.+$/m', '', $clean) ?? $clean;
        if ($products !== []) {
            $clean = preg_replace('/!\[[^\]]*]\(https?:[^)\s]+\)/', '', $clean) ?? $clean;
            $clean = preg_replace('/^«.+».*$/mu', '', $clean) ?? $clean;
        }
        $clean = preg_replace("/\n{3,}/", "\n\n", trim($clean));

        return $clean !== '' ? $clean : trim($reply);
    }
}
