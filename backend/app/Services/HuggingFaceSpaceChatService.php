<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Client for the The Man Store Gradio chat Space on Hugging Face.
 *
 * Space: https://huggingface.co/spaces/Kalapak/fitandsleekAIchat
 * Host:  https://kalapak-fitandsleekaichat.hf.space
 *
 * Gradio ChatInterface (fn chat / api_name=chat):
 *   data = [message, history|null, product_focus|null]
 * Empty history MUST be JSON null. An empty array [] makes Gradio fail with
 * `event: error` / `data: null`, which Laravel used to hide behind Demo Products.
 * Protocol "call": POST /gradio_api/call/chat then GET SSE until event: complete.
 * Protocol "queue": POST /gradio_api/queue/join (fn_index) then GET /queue/data.
 */
class HuggingFaceSpaceChatService
{
    public function isConfigured(): bool
    {
        $provider = strtolower(trim((string) config('services.hf_chat.provider', 'huggingface')));

        return $provider === 'huggingface' && $this->baseUrl() !== '';
    }

    public function baseUrl(): string
    {
        return rtrim(trim((string) config('services.hf_chat.base_url', '')), '/');
    }

    public function timeout(): int
    {
        return max(30, (int) config('services.hf_chat.timeout', 120));
    }

    public function spaceId(): string
    {
        return trim((string) config('services.hf_chat.space_id', 'Kalapak/fitandsleekAIchat'));
    }

    public function protocol(): string
    {
        $protocol = strtolower(trim((string) config('services.hf_chat.protocol', 'call')));

        return in_array($protocol, ['call', 'queue'], true) ? $protocol : 'call';
    }

    public function fnIndex(): int
    {
        return max(0, (int) config('services.hf_chat.fn_index', 7));
    }

    public function apiName(): string
    {
        $name = trim((string) config('services.hf_chat.api_name', 'chat'), '/');

        return $name !== '' ? $name : 'chat';
    }

    public function sendHistory(): bool
    {
        return (bool) config('services.hf_chat.send_history', true);
    }

    public function historyTurns(): int
    {
        return max(0, (int) config('services.hf_chat.history_turns', 6));
    }

    /**
     * @param  list<array{role: string, content: string}>  $messages
     * @return array{reply: string, model: string, provider: string, raw: array<string, mixed>}
     */
    public function chat(array $messages, array $options = []): array
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException(
                'Hugging Face chat Space is not configured. Set CHATBOT_HF_URL (or HF_CHAT_BASE_URL) in backend .env.'
            );
        }

        [$message, $history] = $this->buildGradioPayload($messages);
        if ($message === '') {
            throw new RuntimeException('Empty chat message.');
        }

        $sessionHash = trim((string) ($options['session_hash'] ?? ''));
        if ($sessionHash === '') {
            $sessionHash = Str::lower(Str::random(16));
        }

        $payload = $this->protocol() === 'queue'
            ? $this->chatViaQueue($message, $history, $sessionHash)
            : $this->chatViaCall($message, $history, $sessionHash);

        $reply = $this->extractReply($payload);

        if ($reply === '') {
            throw new RuntimeException('Hugging Face Space returned an empty reply.');
        }

        return [
            'reply' => $reply,
            'model' => $this->spaceId(),
            'provider' => 'huggingface',
            'raw' => is_array($payload) ? $payload : [],
        ];
    }

    public function ping(): bool
    {
        if ($this->baseUrl() === '') {
            return false;
        }

        try {
            $request = Http::timeout(15);
            $token = $this->token();
            if ($token !== '') {
                $request = $request->withToken($token);
            }

            $response = $request->get($this->baseUrl().'/gradio_api/info');

            return $response->successful()
                && is_array($response->json('named_endpoints./'.$this->apiName()));
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Build Gradio ChatInterface inputs: [message, history, product_focus].
     * Send product_focus as null. An empty object {} makes Gradio treat State as a
     * file lookup and return SSE error "404: Not Found". Empty history must also
     * be null — [] is rejected by this ChatInterface Fake API.
     *
     * @param  list<array{role: string, content: string}>  $messages
     * @return array{0: string, 1: list<array{role: string, content: string}>}
     */
    private function buildGradioPayload(array $messages): array
    {
        $systemParts = [];
        $turns = [];

        foreach ($messages as $message) {
            $role = (string) ($message['role'] ?? '');
            $content = trim((string) ($message['content'] ?? ''));
            if ($content === '') {
                continue;
            }

            if ($role === 'system') {
                $systemParts[] = $content;
                continue;
            }

            $turns[] = [
                'role' => $role === 'assistant' ? 'assistant' : 'user',
                'content' => $content,
            ];
        }

        if ($turns === []) {
            return ['', []];
        }

        $last = array_pop($turns);
        $userMessage = $last['role'] === 'user' ? $last['content'] : '';
        if ($userMessage === '') {
            return ['', []];
        }

        if ($systemParts !== []) {
            $userMessage = "[Context — follow strictly]\n"
                .implode("\n\n", $systemParts)
                ."\n\n[Question]\n"
                .$userMessage;
        }

        $history = [];
        if ($this->sendHistory() && $turns !== []) {
            $maxMessages = $this->historyTurns() * 2;
            if ($maxMessages > 0 && count($turns) > $maxMessages) {
                $turns = array_slice($turns, -$maxMessages);
            }
            $history = array_values($turns);
        }

        return [$userMessage, $history];
    }

    /**
     * @param  list<array{role: string, content: string}>  $history
     * @return list<mixed>|array<string, mixed>
     */
    private function chatViaCall(string $message, array $history, string $sessionHash): array
    {
        $eventId = $this->enqueueCall($message, $history, $sessionHash);

        return $this->waitForCallResult($eventId);
    }

    /**
     * @param  list<array{role: string, content: string}>  $history
     */
    private function enqueueCall(string $message, array $history, string $sessionHash): string
    {
        try {
            $response = $this->http(30)
                ->acceptJson()
                ->asJson()
                ->post($this->baseUrl().'/gradio_api/call/'.$this->apiName(), [
                    // Do not send session_hash on the call protocol — Gradio looks it
                    // up as a session file and returns SSE "404: Not Found".
                    'data' => $this->gradioData($message, $history),
                ])
                ->throw();
        } catch (ConnectionException $e) {
            throw new RuntimeException(
                'Hugging Face Space is not reachable at '.$this->baseUrl()
                .'. Check that the Space is Running: https://huggingface.co/spaces/'.$this->spaceId(),
                previous: $e,
            );
        } catch (RequestException $e) {
            $body = (string) ($e->response?->body() ?? $e->getMessage());
            throw new RuntimeException(
                'Hugging Face Space queue error: '.Str::limit($body, 240),
                previous: $e,
            );
        }

        $eventId = trim((string) ($response->json('event_id') ?? ''));
        if ($eventId === '') {
            throw new RuntimeException('Hugging Face Space did not return an event_id.');
        }

        return $eventId;
    }

    /**
     * @return list<mixed>|array<string, mixed>
     */
    private function waitForCallResult(string $eventId): array
    {
        $deadline = microtime(true) + $this->timeout();
        $url = $this->baseUrl().'/gradio_api/call/'.$this->apiName().'/'.$eventId;

        while (microtime(true) < $deadline) {
            try {
                $response = $this->http(min(60, max(10, (int) ($deadline - microtime(true)))))
                    ->withHeaders(['Accept' => 'text/event-stream'])
                    ->get($url);
            } catch (ConnectionException $e) {
                throw new RuntimeException(
                    'Lost connection while waiting for Hugging Face Space reply.',
                    previous: $e,
                );
            }

            if ($response->failed()) {
                throw new RuntimeException(
                    'Hugging Face Space poll failed HTTP '.$response->status()
                );
            }

            $parsed = $this->parseSse($response->body());
            if (($parsed['event'] ?? '') === 'complete') {
                $data = $parsed['data'] ?? null;
                if (is_array($data)) {
                    return $data;
                }

                throw new RuntimeException('Hugging Face Space completed with an unexpected payload.');
            }

            if (($parsed['event'] ?? '') === 'error') {
                $detail = $parsed['data'] ?? null;
                $detailText = is_string($detail) && trim($detail) !== ''
                    ? trim($detail)
                    : (is_array($detail) ? Str::limit(json_encode($detail) ?: '', 200) : '');

                throw new RuntimeException(
                    'Hugging Face Space error while generating a reply'
                    .($detailText !== '' ? ': '.$detailText : '')
                    .'. Open the Space UI/logs and retry: '
                    .'https://huggingface.co/spaces/'.$this->spaceId()
                );
            }

            usleep(400_000);
        }

        throw new RuntimeException(
            'Hugging Face Space timed out after '.$this->timeout().'s. The Space may be cold-starting — retry in a minute.'
        );
    }

    /**
     * @param  list<array{role: string, content: string}>  $history
     * @return list<mixed>|array<string, mixed>
     */
    private function chatViaQueue(string $message, array $history, string $sessionHash): array
    {
        try {
            $response = $this->http(30)
                ->acceptJson()
                ->asJson()
                ->post($this->baseUrl().'/gradio_api/queue/join', [
                    'data' => $this->gradioData($message, $history),
                    'fn_index' => $this->fnIndex(),
                    'session_hash' => $sessionHash,
                ])
                ->throw();
        } catch (ConnectionException $e) {
            throw new RuntimeException(
                'Hugging Face Space is not reachable at '.$this->baseUrl()
                .'. Check that the Space is Running: https://huggingface.co/spaces/'.$this->spaceId(),
                previous: $e,
            );
        } catch (RequestException $e) {
            $body = (string) ($e->response?->body() ?? $e->getMessage());
            throw new RuntimeException(
                'Hugging Face Space queue join error: '.Str::limit($body, 240),
                previous: $e,
            );
        }

        if (trim((string) ($response->json('event_id') ?? '')) === '') {
            throw new RuntimeException('Hugging Face Space queue did not return an event_id.');
        }

        return $this->waitForQueueResult($sessionHash);
    }

    /**
     * @return list<mixed>|array<string, mixed>
     */
    private function waitForQueueResult(string $sessionHash): array
    {
        $deadline = microtime(true) + $this->timeout();
        $url = $this->baseUrl().'/gradio_api/queue/data?session_hash='.urlencode($sessionHash);

        while (microtime(true) < $deadline) {
            try {
                $response = $this->http(min(60, max(10, (int) ($deadline - microtime(true)))))
                    ->withHeaders(['Accept' => 'text/event-stream'])
                    ->get($url);
            } catch (ConnectionException $e) {
                throw new RuntimeException(
                    'Lost connection while waiting for Hugging Face Space reply.',
                    previous: $e,
                );
            }

            if ($response->failed()) {
                throw new RuntimeException(
                    'Hugging Face Space queue poll failed HTTP '.$response->status()
                );
            }

            foreach ($this->parseQueueSseEvents($response->body()) as $event) {
                $msg = (string) ($event['msg'] ?? '');
                if ($msg === 'process_completed') {
                    if (($event['success'] ?? true) === false) {
                        throw new RuntimeException('Hugging Face Space queue reported failure.');
                    }
                    $data = $event['output']['data'] ?? null;
                    if (is_array($data)) {
                        return $data;
                    }

                    throw new RuntimeException('Hugging Face Space queue completed with an unexpected payload.');
                }

                if ($msg === 'process_failed' || $msg === 'unexpected_error') {
                    throw new RuntimeException(
                        'Hugging Face Space queue error. Open the Space UI/logs and retry: '
                        .'https://huggingface.co/spaces/'.$this->spaceId()
                    );
                }
            }

            usleep(400_000);
        }

        throw new RuntimeException(
            'Hugging Face Space timed out after '.$this->timeout().'s. The Space may be cold-starting — retry in a minute.'
        );
    }

    private function token(): string
    {
        return trim((string) config('services.hf_chat.token', ''));
    }

    private function http(int $timeout)
    {
        $request = Http::timeout($timeout);
        $token = $this->token();
        if ($token !== '') {
            $request = $request->withToken($token);
        }

        return $request;
    }

    /**
     * @param  list<array{role: string, content: string}>  $history
     * @return list<mixed>
     */
    private function gradioData(string $message, array $history): array
    {
        return [
            $message,
            $history === [] ? null : array_values($history),
            null,
        ];
    }

    /**
     * @return array{event?: string, data?: mixed}
     */
    private function parseSse(string $body): array
    {
        $events = [];
        $event = 'message';
        $dataLines = [];

        $flush = function () use (&$events, &$event, &$dataLines): void {
            if ($dataLines === [] && $event === 'message') {
                return;
            }
            $raw = trim(implode("\n", $dataLines));
            $dataLines = [];
            $data = null;
            if ($raw !== '' && strtolower($raw) !== 'null') {
                $decoded = json_decode($raw, true);
                $data = json_last_error() === JSON_ERROR_NONE ? $decoded : $raw;
            }
            $events[] = ['event' => $event, 'data' => $data];
            $event = 'message';
        };

        foreach (preg_split("/\r\n|\n|\r/", $body) ?: [] as $line) {
            if ($line === '') {
                $flush();
                continue;
            }
            if (preg_match('/^event:\s*(\S+)\s+data:\s*(.*)$/', $line, $m)) {
                $event = $m[1];
                $dataLines[] = $m[2];
                $flush();
                continue;
            }
            if (str_starts_with($line, 'event:')) {
                $event = trim(substr($line, strlen('event:')));
                continue;
            }
            if (str_starts_with($line, 'data:')) {
                $dataLines[] = substr($line, strlen('data:'));
            }
        }
        $flush();

        foreach (array_reverse($events) as $parsed) {
            if (($parsed['event'] ?? '') === 'complete') {
                return $parsed;
            }
        }
        foreach (array_reverse($events) as $parsed) {
            if (($parsed['event'] ?? '') === 'error') {
                return $parsed;
            }
        }

        return $events !== [] ? $events[array_key_last($events)] : [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function parseQueueSseEvents(string $body): array
    {
        $events = [];
        $dataLines = [];

        $flush = function () use (&$events, &$dataLines): void {
            if ($dataLines === []) {
                return;
            }
            $raw = trim(implode("\n", $dataLines));
            $dataLines = [];
            if ($raw === '' || strtolower($raw) === 'null') {
                return;
            }
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $events[] = $decoded;
            }
        };

        foreach (preg_split("/\r\n|\n|\r/", $body) ?: [] as $line) {
            if ($line === '') {
                $flush();
                continue;
            }
            if (str_starts_with($line, 'data:')) {
                $dataLines[] = substr($line, strlen('data:'));
            }
        }
        $flush();

        return $events;
    }

    /**
     * @param  list<mixed>|array<string, mixed>  $payload
     */
    private function extractReply(array $payload): string
    {
        // Current Space returns [reply, history|null, focus|null]; older APIs returned Json/object.
        if (array_is_list($payload) && isset($payload[0])) {
            $first = $payload[0];
            if (is_string($first)) {
                return trim($first);
            }
            if (is_array($first)) {
                return $this->extractReply($first);
            }
        }

        foreach (['reply', 'response', 'message', 'text', 'content'] as $key) {
            if (isset($payload[$key]) && is_string($payload[$key])) {
                return trim($payload[$key]);
            }
        }

        return '';
    }
}
