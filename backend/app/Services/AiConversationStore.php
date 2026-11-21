<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Server-side chat history for Ollama (replaces Dify conversation_id memory).
 */
class AiConversationStore
{
    private const TTL_SECONDS = 60 * 60 * 12;

    private const MAX_MESSAGES = 24;

    /**
     * @return array{id: string, messages: list<array{role: string, content: string}>}
     */
    public function loadOrCreate(?string $conversationId, string $namespace = 'admin'): array
    {
        $id = trim((string) $conversationId);
        if ($id === '' || ! $this->isValidId($id)) {
            $id = $this->newId($namespace);
        }

        $messages = Cache::get($this->cacheKey($namespace, $id), []);
        if (! is_array($messages)) {
            $messages = [];
        }

        return [
            'id' => $id,
            'messages' => array_values(array_filter(
                $messages,
                fn ($m) => is_array($m)
                    && isset($m['role'], $m['content'])
                    && is_string($m['role'])
                    && is_string($m['content']),
            )),
        ];
    }

    /**
     * @param  list<array{role: string, content: string}>  $messages
     */
    public function save(string $namespace, string $conversationId, array $messages): void
    {
        $trimmed = array_slice(array_values($messages), -self::MAX_MESSAGES);
        Cache::put($this->cacheKey($namespace, $conversationId), $trimmed, self::TTL_SECONDS);
    }

    public function newId(string $namespace = 'admin'): string
    {
        return $namespace . '-' . Str::lower(Str::ulid()->toBase32());
    }

    private function cacheKey(string $namespace, string $id): string
    {
        return 'ai_conversation:' . $namespace . ':' . $id;
    }

    private function isValidId(string $id): bool
    {
        return (bool) preg_match('/^[a-z0-9_-]{8,128}$/i', $id);
    }
}
