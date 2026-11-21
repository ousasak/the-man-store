<?php

$socialiteVerify = filter_var(env('SOCIALITE_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
$socialiteVerify = $socialiteVerify ?? true;

$socialiteCaBundle = env('SOCIALITE_CA_BUNDLE', env('CURL_CA_BUNDLE'));

$socialiteGuzzle = [
    'verify' => $socialiteVerify,
];

if (is_string($socialiteCaBundle) && $socialiteCaBundle !== '' && is_readable($socialiteCaBundle)) {
    $socialiteGuzzle['curl'] = [
        CURLOPT_CAINFO => $socialiteCaBundle,
    ];
}

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('APP_ENV') === 'local' && ($local = env('GOOGLE_REDIRECT_URI_LOCAL'))
            ? $local
            : env('GOOGLE_REDIRECT_URI'),
        'guzzle' => $socialiteGuzzle,
    ],

    'google_vision' => [
        'api_key' => env('GOOGLE_VISION_API_KEY'),
        'project_id' => 'fitandsleekpro',
        'credentials_path' => storage_path('credentials/google-vision-sa.json'),
    ],

    'facebook' => [
        'client_id' => env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
        'redirect' => env('APP_ENV') === 'local' && ($local = env('FACEBOOK_REDIRECT_URI_LOCAL'))
            ? $local
            : env('FACEBOOK_REDIRECT_URI'),
        'guzzle' => $socialiteGuzzle,
    ],

    'twilio' => [
        'sid' => env('TWILIO_SID'),
        'token' => env('TWILIO_TOKEN'),
        'from' => env('TWILIO_FROM'),
    ],

    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'bot_name' => env('TELEGRAM_BOT_NAME'),
        'login_client_id' => env('TELEGRAM_LOGIN_CLIENT_ID'),
        'webhook_secret' => env('TELEGRAM_WEBHOOK_SECRET'),
        'webhook_url' => env('TELEGRAM_WEBHOOK_URL'),
        'admin_chat_id' => env('TELEGRAM_ADMIN_CHAT_ID'),
        'admin_group_invite_url' => env('TELEGRAM_ADMIN_GROUP_INVITE_URL'),
        'broadcast_messages_per_second' => (int) env('TELEGRAM_BROADCAST_MESSAGES_PER_SECOND', 25),
        'broadcast_chunk_size' => (int) env('TELEGRAM_BROADCAST_CHUNK_SIZE', 100),
        'broadcast_retry_attempts' => (int) env('TELEGRAM_BROADCAST_RETRY_ATTEMPTS', 3),
        'broadcast_estimated_workers' => (int) env('TELEGRAM_BROADCAST_ESTIMATED_WORKERS', 1),
        'broadcast_retention_days' => (int) env('TELEGRAM_BROADCAST_RETENTION_DAYS', 30),
    ],

    'rielpay' => [
        'api_url' => env('RIELPAY_API_URL', 'https://api-norng-rielpay.fitandsleek.online'),
        'api_key' => env('RIELPAY_API_KEY'),
        'currency' => env('RIELPAY_CURRENCY', 'KHR'),
        'expires_in' => (int) env('RIELPAY_EXPIRES_IN', 300),
        'deeplink_app_name' => env('RIELPAY_DEEPLINK_APP_NAME', env('BAKONG_DEEPLINK_APP_NAME', 'The Man Store')),
        'deeplink_icon_url' => env('RIELPAY_DEEPLINK_ICON_URL', env('BAKONG_DEEPLINK_ICON_URL')),
        'deeplink_callback' => env(
            'RIELPAY_DEEPLINK_CALLBACK',
            env('BAKONG_DEEPLINK_CALLBACK', 'themanstore://payment/callback')
        ),
    ],

    'bakong' => [
        'proxy_url' => env('BAKONG_PROXY_URL'),
        'proxy_secret' => env('BAKONG_PROXY_SECRET'),
        'token' => env('BAKONG_TOKEN'),
        'base_url' => env('BAKONG_BASE_URL', 'https://api-bakong.nbc.gov.kh'),
        'webhook_secret' => env('BAKONG_WEBHOOK_SECRET'),
    ],

    'aba_payway' => [
        'merchant_id' => env('ABA_PAYWAY_MERCHANT_ID'),
        'api_key' => env('ABA_PAYWAY_API_KEY'),
        'api_secret' => env('ABA_PAYWAY_API_SECRET'),
        'return_url' => env('ABA_PAYWAY_RETURN_URL'),
        'callback_url' => env('ABA_PAYWAY_CALLBACK_URL'),
        'payment_link' => env('ABA_PAYWAY_PAYMENT_LINK'),
    ],

    'image_search' => (static function () {
        // Own Fitandsleek Vector Space (Qdrant-compatible + /embed/image)
        // https://huggingface.co/spaces/Kalapak/fitandsleek-vector
        $defaultHost = 'https://kalapak-fitandsleek-vector.hf.space';
        $vectorBase = rtrim((string) (env('FITANDSLEEK_VECTOR_URL') ?: $defaultHost), '/');
        $apiKey = env('FITANDSLEEK_VECTOR_API_KEY') ?: env('QDRANT_API_KEY') ?: env('AI_SERVICE_KEY');

        // Prefer Vector Space host over legacy QDRANT_URL (e.g. host.docker.internal).
        // Use QDRANT_URL_OVERRIDE only for a different Qdrant host while keeping embed on the Space.
        $qdrantUrl = rtrim((string) (
            env('QDRANT_URL_OVERRIDE')
            ?: env('FITANDSLEEK_VECTOR_URL')
            ?: env('QDRANT_URL')
            ?: $defaultHost
        ), '/');

        return [
            'vector_base_url' => $vectorBase,
            'clip_endpoint' => env('FITANDSLEEK_CLIP_ENDPOINT', $vectorBase.'/embed/image'),
            'clip_vector_size' => (int) env('FITANDSLEEK_CLIP_VECTOR_SIZE', env('QDRANT_VECTOR_SIZE', 512)),
            'ai_service_key' => $apiKey,
            'vector_provider' => env('VECTOR_PROVIDER', 'fitandsleek_vector'),
            'qdrant_url' => $qdrantUrl,
            'qdrant_api_key' => $apiKey,
            'qdrant_collection' => env('QDRANT_COLLECTION', 'products_fitandsleek_512'),
            'vector_size' => (int) env('QDRANT_VECTOR_SIZE', 512),
            'timeout' => (int) env('IMAGE_SEARCH_TIMEOUT', 90),
        ];
    })(),

    /*
    | Chat AI — trained Gradio Space
    | https://huggingface.co/spaces/Kalapak/fitandsleekAIchat
    | Docs: docs/ai/huggingface-chat-space.md
    |
    | Prefer CHATBOT_* keys. HF_CHAT_* / HF_TOKEN remain as fallbacks.
    */
    'hf_chat' => [
        'provider' => env('CHATBOT_PROVIDER', 'huggingface'),
        'base_url' => env('CHATBOT_HF_URL', env('HF_CHAT_BASE_URL', 'https://kalapak-fitandsleekaichat.hf.space')),
        'space_id' => env('HF_CHAT_SPACE_ID', 'Kalapak/fitandsleekAIchat'),
        'token' => env('CHATBOT_HF_TOKEN', env('HF_TOKEN', env('HUGGING_FACE_HUB_TOKEN'))),
        'protocol' => strtolower((string) env('CHATBOT_HF_PROTOCOL', 'queue')),
        'fn_index' => (int) env('CHATBOT_HF_FN_INDEX', 7),
        'api_name' => trim((string) env('CHATBOT_HF_API_NAME', 'chat'), '/'),
        'send_history' => filter_var(env('CHATBOT_HF_SEND_HISTORY', true), FILTER_VALIDATE_BOOLEAN),
        'history_turns' => max(0, (int) env('CHATBOT_HF_HISTORY_TURNS', 6)),
        'timeout' => (int) env('CHATBOT_HF_TIMEOUT', env('HF_CHAT_TIMEOUT', 120)),
    ],

];
