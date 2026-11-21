# Payments — Rielpay KHQR

The Man Store uses [Rielpay](https://api-norng-rielpay.fitandsleek.online) for Bakong KHQR payments. NBC/Bakong credentials and Cambodia egress live in Rielpay — not in this app.

## Environment

```ini
RIELPAY_API_URL=https://api-norng-rielpay.fitandsleek.online
RIELPAY_API_KEY=your_live_or_test_key
RIELPAY_CURRENCY=KHR
RIELPAY_EXPIRES_IN=300

# Optional — mobile tap-to-pay metadata (sent to Rielpay → NBC generate_deeplink_by_qr)
RIELPAY_DEEPLINK_APP_NAME=The Man Store
RIELPAY_DEEPLINK_ICON_URL=https://www.fitandsleek.online/logo-circle.png
RIELPAY_DEEPLINK_CALLBACK=themanstore://payment/callback
```

Health check: `GET {RIELPAY_API_URL}/up` → `Application up`

## Flow

1. Checkout with `bakong_khqr` → `POST /api/payments/bakong/create` creates payment via Rielpay.
2. Response includes `qr_string` — shown in checkout UI.
3. **Mobile tap-to-pay:** `POST /api/payments/bakong/deeplink/{payment}` calls Rielpay `POST /api/v1/payments/deeplink` → NBC `generate_deeplink_by_qr` → returns `short_link`.
4. Client polls `GET /api/payments/bakong/status/{payment}` every 3s until `paid` or `expired`.
5. Backend calls Rielpay `POST /api/v1/payments/check` with `md5`.

```
The Man Store → Rielpay (API key) → NBC (BAKONG_TOKEN on Rielpay host) → short_link
```

No `BAKONG_PROXY_URL` or `BAKONG_TOKEN` required on The Man Store / Render.

## Merchant settings

Bakong account and merchant display name are configured in the Rielpay merchant dashboard (`merchant-norng-rielpay.fitandsleek.online`).

Admin **Payment Settings** controls whether KHQR is enabled and optional display labels for receipts.
