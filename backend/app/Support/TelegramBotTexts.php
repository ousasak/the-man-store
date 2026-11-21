<?php

namespace App\Support;

use App\Models\TelegramUser;

class TelegramBotTexts
{
    public const LOCALE_KM = 'km';

    public const LOCALE_EN = 'en';

    /**
     * @var array<string, array<string, string>>
     */
    private const STRINGS = [
        self::LOCALE_EN => [
            'welcome' => "👋 Welcome to *The Man Store* order updates.\n\n"
                ."• Open a tracking link from your order page to subscribe\n"
                ."• `/track ORDER_NUMBER` — check order status\n"
                ."• `/orders` — recent orders (linked account)\n"
                ."• `/language` — choose Khmer or English\n"
                ."• `/help` — show commands",
            'welcome_customer' => "👋 Welcome to *The Man Store*.\n\nUse the menu to view products, track *My Orders*, search, or open *My Profile*.",
            'welcome_admin' => "👋 *Staff menu · បុគ្គលិក*\n\nThis chat is linked to your staff account. You get an alert for every shop order — placed, paid, failed, or cancelled.\n\nUse *Orders*, *Shipments*, and *Customers*. Shop-owner reports are not in this menu.",
            'welcome_superadmin' => "👋 *Shop owner · ម្ចាស់ហាង*\n\nThis chat is linked to the owner account. You get every order alert (success and failed).\n\nUse *Report* for today / other days / months / years — income, money received, and purchase spend.",
            'help_admin' => "*Staff menu · បុគ្គលិក*\n\n"
                ."📦 Orders — shop orders (alerts land here)\n"
                ."🚚 Shipments — deliveries\n"
                ."👥 Customers — customer list\n"
                ."👤 Account — your staff profile\n"
                ."You cannot open owner reports from this chat.",
            'help_superadmin' => "*Shop owner · ម្ចាស់ហាង*\n\n"
                ."📦 Orders — every shop order\n"
                ."💳 Payments — latest payments\n"
                ."📊 Report — income, spend, today / month / year\n"
                ."📅 Today — today’s orders and money received\n"
                ."💾 Backup — database backup\n"
                ."/report — same as Report",
            'staff_linked' => "✅ Telegram linked as *:role*\n\nName: :name\n\nThis chat now receives shop order alerts. Your website role is unchanged.",
            'help' => "*Commands*\n\n"
                ."/track ORDER\\_NUMBER — order status\n"
                ."/orders — your recent orders\n"
                ."/language — choose Khmer or English\n"
                ."/help — this message\n\n"
                ."Tip: tap *Invoice* on order updates — details appear right here in chat.",
            'help_customer' => "*Customer menu*\n\n"
                ."🛍 Collection — shop\n"
                ."🛒 Cart — bag and checkout\n"
                ."📦 My Orders — your orders\n"
                ."👤 Account — profile\n"
                ."/track ORDER\\_NUMBER — order status\n"
                ."/language — Khmer or English",
            'help_guest' => "*Guest menu*\n\n"
                ."🛍 Collection — browse and add to cart\n"
                ."🛒 Cart — your bag (no account needed)\n"
                ."🧾 Checkout — login, share delivery location, then pay\n"
                ."🔐 Login / Register — share your phone\n"
                ."/login — same as Login / Register\n"
                ."/language — Khmer or English",
            'help_admin' => "*Staff menu · បុគ្គលិក*\n\n"
                ."📦 Orders — shop orders (alerts land here)\n"
                ."🚚 Shipments — deliveries\n"
                ."👥 Customers — customer list\n"
                ."👤 Account — your staff profile\n"
                ."Owner reports are not available in this chat.",
            'help_superadmin' => "*Shop owner · ម្ចាស់ហាង*\n\n"
                ."📦 Orders — every shop order\n"
                ."💳 Payments — latest payments\n"
                ."📊 Report — income, spend, today / month / year\n"
                ."📅 Today — today’s orders and money received\n"
                ."💾 Backup — database backup\n"
                ."/report — same as Report",
            'menu_denied' => '⛔ That button is not available for your role. Tap Help to see your menu.',
            'shop_orders_title' => '📋 *Latest shop orders*',
            'no_shop_orders' => 'No shop orders yet.',
            'language_prompt' => "🌐 *Choose your language*\n\nSelect Khmer or English for bot messages.",
            'language_set_km' => '✅ ភាសាខ្មែរត្រូវបានកំណត់។',
            'language_set_en' => '✅ English is now set.',
            'btn_language' => '🌐 Language / ភាសា',
            'btn_invoice' => '🧾 Invoice',
            'btn_payment_qr' => '💳 Payment QR',
            'btn_payment_qr_cod' => '💳 Scan KHQR (COD)',
            'btn_pay_in_app' => '💳 Pay with KHQR in app',
            'btn_i_paid' => "✅ I've paid",
            'btn_confirm_shop_received' => '✅ Shop received money',
            'payment_still_pending' => '⏳ Payment is not confirmed yet. If you just scanned, wait a few seconds and tap again.',
            'payment_still_pending_cod' => "⏳ The bank has not confirmed this KHQR yet.\n\nIf you already scanned the shop QR in ABA / ACLEDA, tap *Shop received money*. The order will complete and alerts will be sent.",
            'payment_check_failed' => '⚠️ Could not confirm payment with the bank right now. If you already paid, wait a moment and tap I’ve paid again.',
            'shop_khqr_confirmed' => "✅ Recorded: the shop received this KHQR payment.\n\nAlerts were sent. This order is complete.",
            'btn_track_on' => 'Track on :provider',
            'btn_open_admin_group' => '👥 Open seller group',
            'track_usage' => "Usage: `/track FS-123456`\n\nOr open the tracking link from your order confirmation.",
            'order_not_found' => '❌ Order `:key` was not found.',
            'order_subscribed' => "✅ You are now subscribed to order `:label`.\n\nWe will notify you when it ships and delivers.",
            'invalid_account_link' => '❌ Invalid account link. Please open a fresh link from your profile or order page.',
            'account_link_invalid' => '❌ This account link has expired or is invalid.',
            'account_linked' => "✅ Telegram is now linked to your *:role* account (:name).\n\nThe bot recognized you. You will receive shop alerts here automatically.",
            'staff_linked' => "✅ Telegram linked as *:role*\n\nName: :name\n\nThe bot recognized your shop login. This chat now receives order alerts. Your website role is unchanged.",
            'customer_linked' => "✅ Telegram linked to your *customer* account: :name\n\nYour role is unchanged. You will receive order updates here.",
            'driver_linked' => "✅ Telegram linked as *driver*: :name\n\nScan an order QR to open that delivery job.",
            'staff_link_failed' => '❌ Staff link failed (:reason). Ask the shop owner for a fresh code.',
            'customer_link_failed' => '❌ Customer link failed (:reason). Open a fresh Connect Telegram link from your profile.',
            'driver_link_failed' => '❌ Driver link failed (:reason). Ask the shop for a fresh code.',
            'driver_link_required' => "⛔ Link your driver account first.\n\nAsk the shop for a Telegram link QR / code, then scan the order QR again.",
            'courier_job_locked' => "⛔ This delivery job is not unlocked yet.\n\nShop staff must confirm pickup with the courier first (Admin / Superadmin).",
            'status_already_set' => "⛔ This status is already set.\n\nChoose a different status — the same button cannot be applied twice.",
            'status_already_set_short' => 'Already this status',
            'order_closed' => "✅ This order is already complete.\n\nNo further status, payment, or delivery actions can be taken — by anyone.",
            'order_closed_short' => 'Order already complete',
            'courier_job_done_locked' => '✅ Job finished. Status buttons are closed for this order.',
            'driver_job_title' => "🚚 *Delivery job*\n\nOrder: `:label`\nTotal: $:total\nPayment: :payment\nStatus: :status",
            'driver_complete_need_pay' => "⛔ COD is still unpaid.\n\nTap Generate shop KHQR in this chat, then scan it with ABA / ACLEDA. You do not go back to the shop.",
            'staff_action_denied' => '⛔ Your Telegram is not linked as staff, or you lack order permission.',
            'backup_superadmin_only' => '⛔ Backup is only for a linked Superadmin account.',
            'order_not_yours' => '❌ This order does not belong to your linked account.',
            'link_account_first' => 'Link your account first using the *Connect Telegram* button in The Man Store profile or order page.',
            'no_orders' => 'You have no orders yet.',
            'recent_orders_title' => '📋 *Your recent orders*',
            'track_hint' => 'Use `/track ORDER_NUMBER` for details.',
            'order_confirmed' => "✅ <b>Payment received</b>\n\n"
                ."KHQR scan successful.\n"
                ."Order: <code>:label</code>\n"
                ."Total: $:total\n"
                ."Status: Preparing for shipment\n\n"
                ."You will receive updates when your order ships.",
            'order_paid_completed' => "✅ <b>Payment received — order complete</b>\n\n"
                ."You paid the shop successfully.\n"
                ."Order: <code>:label</code>\n"
                ."Total: $:total\n"
                ."Status: Completed\n\n"
                ."Thank you for shopping with The Man Store.",
            'order_completed_paid' => "✅ <b>Order complete</b>\n\n"
                ."Payment was received by the shop.\n"
                ."Order: <code>:label</code>\n"
                ."Total: $:total\n"
                ."Status: Completed\n\n"
                ."Thank you for shopping with The Man Store.",
            'order_placed_cod' => "🧾 <b>COD order placed</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Total: $:total\n"
                ."Payment: Pay on delivery\n"
                ."Status: Processing\n\n"
                ."We are preparing your order. You will get updates until it arrives.",
            'order_processing' => "⏳ <b>Order is being prepared</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Status: Processing / Preparing\n\n"
                ."Our team is packing your items.",
            'order_shipped' => "📦 <b>Order shipped</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Courier: :provider\n"
                ."Tracking: <code>:tracking</code>",
            'order_in_transit' => "🚚 <b>Order in transit</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Courier: :provider\n"
                ."Tracking: <code>:tracking</code>\n\n"
                ."Your package is on the way.",
            'order_arrived' => "📍 <b>Driver has arrived</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Courier: :provider\n\n"
                ."Please come out to collect your order.",
            'order_delivered' => "🎉 <b>Order received</b>\n\n"
                ."Order: <code>:label</code>\n"
                .":cod_note"
                ."Thank you for shopping with The Man Store!",
            'order_delivered_cod_note' => "Pay on delivery — cash or scan the QR the driver shows you.\n\n",
            'order_cancelled' => "❌ <b>Order cancelled</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Status: Cancelled\n\n"
                ."Contact The Man Store if you need help.",
            'order_failed' => "⚠️ <b>Delivery issue</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Status: Failed\n\n"
                ."Please contact The Man Store for support.",
            'order_returned' => "↩️ <b>Order returned</b>\n\n"
                ."Order: <code>:label</code>\n"
                ."Status: Returned\n\n"
                ."Please contact The Man Store for support.",
            'admin_new_cod_order' => "🔔 *New COD order*\n\n"
                ."Order: `:label`\n"
                ."Customer: :customer\n"
                ."Phone: :phone\n"
                ."Items: :items\n"
                ."Total: \$:total\n"
                ."Address: :address",
            'order_status_title' => '📋 Order status',
            'order_label' => 'Order',
            'status_label' => 'Status',
            'shipment_label' => 'Shipment',
            'tracking_label' => 'Tracking',
            'payment_pending' => 'Payment: Pending',
            'already_paid' => '✅ This order is already paid.',
            'payment_qr_failed' => '❌ Could not generate payment QR. Please try again later.',
            'payment_qr_failed_gen' => '❌ Failed to generate payment QR. Please try again.',
            'payment_qr_gateway_down' => "⚠️ Payment gateway is busy right now.\n\nWait about 1 minute, then tap 🔄 Generate shop KHQR again. The QR appears in this Telegram chat — scan it with ABA / ACLEDA. Do not open a camera link.",
            'payment_qr_customer_denied' => "Payment QR is not available in the customer chat.\n\nCOD: pay the driver, or scan the QR the driver shows you.\nKHQR: tap Pay in app.",
            'payment_qr_customer_denied_short' => 'QR is with the driver',
            'payment_qr_title' => '💳 Payment QR',
            'payment_qr_cod_note' => "\n\nShop QR — driver scans with ABA / ACLEDA / Wing.\nThe shop does not scan. After you scan, tap ✅ I've paid. If the bank does not confirm, tap Shop received money.",
            'payment_qr_cod_customer_note' => "\n\nShow this shop QR to the customer. They scan it in ABA / ACLEDA / Wing.\nDo not mention shipping splits.",
            'payment_qr_scan_note' => "\n\nScan with your banking app to pay.\nAfter a successful scan, tap ✅ I've paid.",
            'payment_qr_expires' => "\n\n⏱ Valid :minutes minutes · until :time",
            'amount_label' => 'Amount',
            'generating_qr' => 'Generating payment QR…',
            'loading_invoice' => 'Loading invoice…',
            'invoice_failed' => '❌ Failed to load invoice. Please try again.',
            'invalid_order' => 'Invalid order.',
            'order_not_found_short' => 'Order not found.',
            'not_subscribed' => 'You are not subscribed to this order.',
            'invoice_title' => 'Invoice',
            'invoice_number' => 'Invoice',
            'invoice_date' => 'Date',
            'invoice_status' => 'Status',
            'customer' => 'Customer',
            'items' => 'Items',
            'qty_label' => 'Qty',
            'subtotal' => 'Subtotal',
            'discount' => 'Discount',
            'shipping' => 'Shipping',
            'grand_total' => 'Grand Total',
            'courier' => 'Courier',
            'payment_cod' => 'Payment: COD — collect on delivery',
            'more_items' => '…and :count more item:plural',
            'guest' => 'Guest',
            'courier_fallback' => 'Courier',
            'driver_cod_choose' => "💵 *COD — Driver options*\n\nOrder: `:label`\nTotal: $:total\n\n1) Pay the shop now — shop shows QR, you scan\n2) Collect from the customer (customer pays *your* QR), then you scan the shop QR to remit *goods only* (shipping stays with you)\n3) Shop already paid shipping — generate the shop QR for the customer to scan the *full* total",
            'driver_cod_pay_how' => "How will you pay the shop now?\n\nOrder: `:label`\nTotal: $:total\n\nShop shows the QR — you scan it. The shop does not scan.",
            'driver_cod_wait_saved' => "✅ Plan saved: collect from the customer.\n\nCustomer pays *your* QR: $:total\nThen tap *Generate shop KHQR* in this chat — you remit $:remit (goods). Shipping $:shipping stays with you. The customer must not see this remittance.",
            'driver_cod_shop_prepaid_saved' => "✅ Plan saved: shop already paid shipping.\n\nAt delivery, generate the shop QR. Customer scans the *full* $:total to the shop.",
            'driver_cod_customer_qr' => "Customer paid your QR. Now scan the *shop* QR to remit goods only.\n\nOrder: `:label`\nCustomer paid: $:total\nRemit to shop: $:remit (shipping $:shipping stays with you)",
            'driver_cod_send_qr' => "Shop KHQR will appear *in this Telegram chat*. Open ABA / ACLEDA / Wing and scan the image below. You do not go back to the shop.\n\nOrder: `:label`\nAmount: $:total",
            'driver_cod_send_customer_qr' => "Customer paid your QR ($:total).\n\n*Shop KHQR is generated in this Telegram chat* — open ABA / ACLEDA and scan the image below to remit $:remit (goods). Shipping $:shipping stays with you.\n\nDo not go back to the shop. Do not open a camera link. Do not show this QR to the customer.",
            'driver_cod_send_customer_shop_qr' => "Show this *shop QR in Telegram* to the customer. They scan it and pay the shop $:total in full (shop already covered shipping).",
            'driver_cod_scan_nudge' => "📷 Shop KHQR will be generated in this Telegram chat. Open your banking app and scan the image here — you do not go back to the shop.",
            'driver_cod_recorded' => "✅ Recorded: :label",
            'btn_driver_pay_now' => '💵 បង់ឥឡូវ',
            'btn_driver_wait' => '⏳ ប្រមូលពី Customer',
            'btn_driver_shop_prepaid' => '🧾 ហាងចេញថ្លៃដឹក — QR Customer',
            'btn_driver_cash' => '💵 លុយសុទ្ធ',
            'btn_customer_paid_my_qr' => '📷 Generate shop KHQR $:remit',
            'btn_generate_shop_khqr' => '📷 Generate shop KHQR',
            'btn_generate_shop_khqr_amount' => '📷 Generate shop KHQR $:remit',
            'btn_retry_shop_khqr' => '🔄 Generate shop KHQR again',
            'btn_generate_customer_shop_qr' => '📷 QR ហាងអោយ Customer $:total',
            'btn_driver_scan_bank_qr' => '📷 Generate shop KHQR',
            'driver_paid_on_behalf' => "✅ <b>You paid on behalf of the customer</b>\n\n"
                ."Shop KHQR scan successful.\n"
                ."Order: <code>:label</code>\n"
                ."Amount: :amount\n"
                ."Status: Completed\n\n"
                ."The shop has received your payment. This order is finished.",
            'driver_customer_paid_shop' => "✅ <b>Customer paid the shop</b>\n\n"
                ."The customer scanned shop KHQR.\n"
                ."Order: <code>:label</code>\n"
                ."Total: $:total\n"
                ."Status: Completed\n\n"
                ."The shop has received the payment. This order is finished.",
        ],
        self::LOCALE_KM => [
            'welcome' => "👋 *សូមស្វាគមន៍មកកាន់ The Man Store* សម្រាប់ធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញ។\n\n"
                ."• បើកតំណតាមដានពីទំព័រការបញ្ជាទិញរបស់អ្នក\n"
                ."• `/track ORDER_NUMBER` — ពិនិត្យស្ថានភាពការបញ្ជាទិញ\n"
                ."• `/orders` — ការបញ្ជាទិញថ្មីៗ (គណនីភ្ជាប់រួច)\n"
                ."• `/language` — ជ្រើសភាសាខ្មែរ ឬ English\n"
                ."• `/help` — បង្ហាញពាក្យបញ្ជា",
            'welcome_customer' => "👋 សូមស្វាគមន៍មកកាន់ *The Man Store*។\n\nប្រើម៉ឺនុយដើម្បីមើលផលិតផល តាមដាន *My Orders* ស្វែងរក ឬបើក *My Profile*។",
            'welcome_admin' => "👋 *ម៉ឺនុយបុគ្គលិក*\n\nChat នេះភ្ជាប់នឹងគណនីបុគ្គលិក។ អ្នកនឹងទទួលការជូនដំណឹងគ្រប់ការបញ្ជាទិញ — ទើបដាក់ បង់បាន បរាជ័យ ឬបោះបង់។\n\nប្រើ *Orders*, *Shipments*, *Customers*។ របាយការណ៍ម្ចាស់ហាងមិនមានក្នុងម៉ឺនុយនេះទេ។",
            'welcome_superadmin' => "👋 *ម្ចាស់ហាង*\n\nChat នេះភ្ជាប់នឹងគណនីម្ចាស់ហាង។ អ្នកទទួលការជូនដំណឹងគ្រប់ការបញ្ជាទិញ (ជោគជ័យ និងបរាជ័យ)។\n\nប្រើ *Report* សម្រាប់ថ្ងៃនេះ / ថ្ងៃផ្សេង / ខែ / ឆ្នាំ — ចំណូល លុយទទួលបាន និងចំណាយទិញទំនិញ។",
            'help' => "*ពាក្យបញ្ជា*\n\n"
                ."/track ORDER\\_NUMBER — ស្ថានភាពការបញ្ជាទិញ\n"
                ."/orders — ការបញ្ជាទិញថ្មីៗរបស់អ្នក\n"
                ."/language — ជ្រើសភាសាខ្មែរ ឬ English\n"
                ."/help — សារនេះ\n\n"
                ."ព័ត៌មាន: ចុច *វិក័យបត្រ* លើការធ្វើបច្ចុប្បន្នភាព — ព័ត៌មានបង្ហាញភ្លាមនៅក្នុង chat។",
            'help_customer' => "*ម៉ឺនុយអតិថិជន*\n\n"
                ."🛍 Collection — ហាង\n"
                ."🛒 Cart — កន្ត្រក និង checkout\n"
                ."📦 My Orders — ការបញ្ជាទិញរបស់អ្នក\n"
                ."👤 Account — គណនី\n"
                ."/track ORDER\\_NUMBER — ស្ថានភាពការបញ្ជាទិញ\n"
                ."/language — ខ្មែរ ឬ English",
            'help_guest' => "*ម៉ឺនុយភ្ញៀវ*\n\n"
                ."🛍 Collection — មើលផលិតផល និងបន្ថែមកន្ត្រក\n"
                ."🛒 Cart — កន្ត្រក (មិនត្រូវការគណនី)\n"
                ."🧾 Checkout — ចូល ចែករំលែកទីតាំងដឹក សិនទើបទូទាត់\n"
                ."🔐 Login / Register — ចែករំលែកលេខទូរស័ព្ទ\n"
                ."/login — ដូច Login / Register\n"
                ."/language — ខ្មែរ ឬ English",
            'help_admin' => "*ម៉ឺនុយបុគ្គលិក*\n\n"
                ."📦 Orders — ការបញ្ជាទិញហាង (ការជូនដំណឹងមកទីនេះ)\n"
                ."🚚 Shipments — ការដឹក\n"
                ."👥 Customers — បញ្ជីអតិថិជន\n"
                ."👤 Account — គណនីបុគ្គលិក\n"
                ."របាយការណ៍ម្ចាស់ហាងមិនមានក្នុង chat នេះទេ។",
            'help_superadmin' => "*ម្ចាស់ហាង*\n\n"
                ."📦 Orders — គ្រប់ការបញ្ជាទិញ\n"
                ."💳 Payments — ការបង់ប្រាក់\n"
                ."📊 Report — ចំណូល ចំណាយ ថ្ងៃនេះ / ខែ / ឆ្នាំ\n"
                ."📅 Today — ការបញ្ជាទិញ និងលុយទទួលបានថ្ងៃនេះ\n"
                ."💾 Backup — backup មូលដ្ឋានទិន្នន័យ\n"
                ."/report — ដូច Report",
            'menu_denied' => '⛔ ប៊ូតុងនេះមិនមានសម្រាប់ role របស់អ្នកទេ។ ចុច Help ដើម្បីមើលម៉ឺនុយ។',
            'shop_orders_title' => '📋 *ការបញ្ជាទិញហាងថ្មីៗ*',
            'no_shop_orders' => 'មិនទាន់មានការបញ្ជាទិញហាងទេ។',
            'language_prompt' => "🌐 *ជ្រើសរើសភាសា*\n\nជ្រើសភាសាខ្មែរ ឬ English សម្រាប់សារពី bot។",
            'language_set_km' => '✅ ភាសាខ្មែរត្រូវបានកំណត់។',
            'language_set_en' => '✅ English is now set.',
            'btn_language' => '🌐 ភាសា / Language',
            'btn_invoice' => '🧾 វិក័យបត្រ',
            'btn_payment_qr' => '💳 បង់តាម KHQR',
            'btn_payment_qr_cod' => '💳 Scan KHQR (COD)',
            'btn_pay_in_app' => '💳 បង់ KHQR ក្នុង App',
            'btn_i_paid' => '✅ ខ្ញុំបានបង់រួច',
            'btn_confirm_shop_received' => '✅ ហាងបានទទួលលុយ',
            'payment_still_pending' => '⏳ មិនទាន់ទទួលការបង់ប្រាក់ទេ។ បើស្កេនរួចហើយ សូមរង់ចាំបន្តិច រួចចុចម្ដងទៀត។',
            'payment_still_pending_cod' => "⏳ ធនាគារមិនទាន់បញ្ជាក់ KHQR នេះទេ។\n\nបើអ្នកស្កេន QR ហាងក្នុង ABA / ACLEDA រួចហើយ ចុច *ហាងបានទទួលលុយ*។ ការបញ្ជាទិញនឹងបញ្ចប់ ហើយប្រព័ន្ធនឹងផ្ញើការជូនដំណឹង។",
            'payment_check_failed' => '⚠️ មិនអាចបញ្ជាក់ការបង់ប្រាក់ពីធនាគារឥឡូវនេះទេ។ បើបានបង់រួច សូមរង់ចាំបន្តិច រួចចុច «ខ្ញុំបានបង់រួច» ម្ដងទៀត។',
            'shop_khqr_confirmed' => "✅ បានកត់ត្រា: ហាងបានទទួលប្រាក់ KHQR នេះ។\n\nបានផ្ញើការជូនដំណឹង។ ការបញ្ជាទិញនេះបានបញ្ចប់។",
            'btn_track_on' => 'តាមដាន :provider',
            'btn_open_admin_group' => '👥 ចូលក្រុមអ្នកលក់',
            'track_usage' => "របៀបប្រើ: `/track FS-123456`\n\nឬបើកតំណតាមដានពីការបញ្ជាក់ការបញ្ជាទិញរបស់អ្នក។",
            'order_not_found' => '❌ រកមិនឃើញការបញ្ជាទិញ `:key`។',
            'order_subscribed' => "✅ អ្នកបានជាវទទួលធ្វើបច្ចុប្បន្នភាពសម្រាប់ការបញ្ជាទិញ `:label`។\n\nយើងនឹងជូនដំណឹងពេលដឹកចេញ និងដឹកដល់។",
            'invalid_account_link' => '❌ តំណភ្ជាប់គណនីមិនត្រឹមត្រូវ។ សូមបើកតំណថ្មីពីទំព័រប្រវត្តិរូប ឬការបញ្ជាទិញ។',
            'account_link_invalid' => '❌ តំណភ្ជាប់គណនីនេះផុតកំណត់ ឬមិនត្រឹមត្រូវ។',
            'account_linked' => "✅ Telegram ត្រូវបានភ្ជាប់ទៅគណនី *:role* (:name)។\n\nBot ស្គាល់អ្នកហើយ។ អ្នកនឹងទទួលការជូនដំណឹងហាងនៅទីនេះ។",
            'staff_linked' => "✅ ភ្ជាប់ Telegram ជា *:role*\n\nឈ្មោះ: :name\n\nBot ស្គាល់ការចូលប្រព័ន្ធរបស់អ្នក។ Chat នេះនឹងទទួលការជូនដំណឹងការបញ្ជាទិញ។ Role នៅវេបមិនប្តូរទេ។",
            'customer_linked' => "✅ ភ្ជាប់ Telegram ទៅគណនី *customer*: :name\n\nRole មិនប្តូរទេ។ អ្នកនឹងទទួលធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញនៅទីនេះ។",
            'driver_linked' => "✅ ភ្ជាប់ Telegram ជា *អ្នកដឹក*: :name\n\nស្កេន QR លើ order ដើម្បីបើកការដឹកនោះ។",
            'staff_link_failed' => '❌ ភ្ជាប់បុគ្គលិកបរាជ័យ (:reason)។ សុំកូដថ្មីពីម្ចាស់ហាង។',
            'customer_link_failed' => '❌ ភ្ជាប់អតិថិជនបរាជ័យ (:reason)។ បើកតំណ Connect Telegram ថ្មីពីប្រវត្តិរូប។',
            'driver_link_failed' => '❌ ភ្ជាប់អ្នកដឹកបរាជ័យ (:reason)។ សុំកូដថ្មីពីហាង។',
            'driver_link_required' => "⛔ សូមភ្ជាប់គណនីអ្នកដឹកជាមុន។\n\nសុំ QR/កូដភ្ជាប់ពីហាង រួចស្កេន QR order ម្ដងទៀត។",
            'courier_job_locked' => "⛔ ការដឹកនេះមិនទាន់បើកទេ។\n\nបុគ្គលិកហាងត្រូវ confirm ជាមួយអ្នកដឹកជាមុន (Admin / Superadmin)។",
            'status_already_set' => "⛔ ស្ថានភាពនេះបានកំណត់រួចហើយ។\n\nសូមជ្រើសស្ថានភាពផ្សេង — មិនអាចចុចប៊ូតុងដដែលម្ដងទៀតបានទេ។",
            'status_already_set_short' => 'ស្ថានភាពនេះមានរួចហើយ',
            'order_closed' => "✅ ការបញ្ជាទិញនេះបានបញ្ចប់ជោគជ័យហើយ។\n\nមិនអាចផ្លាស់ប្ដូរ Status បង់ប្រាក់ ឬដឹកអ្វីទៀតបានទេ — ទោះនរណាក៏ដោយ។",
            'order_closed_short' => 'ការបញ្ជាទិញបានបញ្ចប់ហើយ',
            'courier_job_done_locked' => '✅ បញ្ចប់ហើយ។ ប៊ូតុង status បិទសម្រាប់ order នេះ។',
            'driver_job_title' => "🚚 *ការដឹក*\n\nOrder: `:label`\nសរុប: $:total\nបង់ប្រាក់: :payment\nស្ថានភាព: :status",
            'driver_complete_need_pay' => "⛔ COD មិនទាន់បង់។\n\nចុច បង្កើត KHQR ហាងក្នុង Telegram នេះ រួចស្កេនតាម ABA / ACLEDA។ មិនចាំបាច់ត្រលប់ទៅហាងទេ។",
            'staff_action_denied' => '⛔ Telegram របស់អ្នកមិនបានភ្ជាប់ជាបុគ្គលិក ឬគ្មានសិទ្ធិ order។',
            'backup_superadmin_only' => '⛔ Backup សម្រាប់តែ Superadmin ដែលបានភ្ជាប់។',
            'order_not_yours' => '❌ ការបញ្ជាទិញនេះមិនមែនរបស់គណនីភ្ជាប់របស់អ្នកទេ។',
            'link_account_first' => 'សូមភ្ជាប់គណនីជាមុនសិន ដោយចុច *Connect Telegram* នៅទំព័រប្រវត្តិរូប ឬការបញ្ជាទិញ The Man Store។',
            'no_orders' => 'អ្នកមិនទាន់មានការបញ្ជាទិញទេ។',
            'recent_orders_title' => '📋 *ការបញ្ជាទិញថ្មីៗរបស់អ្នក*',
            'track_hint' => 'ប្រើ `/track ORDER_NUMBER` សម្រាប់ព័ត៌មានលម្អិត។',
            'order_confirmed' => "✅ <b>បានទទួលការបង់ប្រាក់</b>\n\n"
                ."Scan KHQR ជោគជ័យ។\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."សរុប: $:total\n"
                ."ស្ថានភាព: កំពុងរៀបចំដឹកជញ្ជូន\n\n"
                ."អ្នកនឹងទទួលធ្វើបច្ចុប្បន្នភាពពេលដឹកចេញ។",
            'order_paid_completed' => "✅ <b>បានទទួលការបង់ប្រាក់ — បញ្ចប់ការបញ្ជាទិញ</b>\n\n"
                ."អ្នកបានបង់មកហាងជោគជ័យ។\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."សរុប: $:total\n"
                ."ស្ថានភាព: បានបញ្ចប់\n\n"
                ."សូមអរគុណដែលទិញជាមួយ The Man Store។",
            'order_completed_paid' => "✅ <b>ការបញ្ជាទិញបានបញ្ចប់</b>\n\n"
                ."ហាងបានទទួលការបង់ប្រាក់ហើយ។\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."សរុប: $:total\n"
                ."ស្ថានភាព: បានបញ្ចប់\n\n"
                ."សូមអរគុណដែលទិញជាមួយ The Man Store។",
            'order_placed_cod' => "🧾 <b>ការបញ្ជាទិញ COD</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."សរុប: $:total\n"
                ."ការបង់ប្រាក់: បង់ពេលដឹកដល់\n"
                ."ស្ថានភាព: កំពុងដំណើរការ\n\n"
                ."យើងកំពុងរៀបចំទំនិញ។ អ្នកនឹងទទួលធ្វើបច្ចុប្បន្នភាពរហូតដល់ដឹកដល់។",
            'order_processing' => "⏳ <b>កំពុងរៀបចំការបញ្ជាទិញ</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."ស្ថានភាព: កំពុងរៀបចំ\n\n"
                ."ក្រុមការងារកំពុងវេចខ្ចប់ទំនិញរបស់អ្នក។",
            'order_shipped' => "📦 <b>ការបញ្ជាទិញដឹកចេញហើយ</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."អ្នកដឹក: :provider\n"
                ."លេខតាមដាន: <code>:tracking</code>",
            'order_in_transit' => "🚚 <b>ទំនិញកំពុងដឹក</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."អ្នកដឹក: :provider\n"
                ."លេខតាមដាន: <code>:tracking</code>\n\n"
                ."កញ្ចប់របស់អ្នកកំពុងធ្វើដំណើរ។",
            'order_arrived' => "📍 <b>អ្នកដឹកមកដល់ទីតាំងហើយ</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."អ្នកដឹក: :provider\n\n"
                ."សូមចេញមកទទួលទំនិញ។",
            'order_delivered' => "🎉 <b>បានទទួលអីវ៉ាន់ហើយ</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                .":cod_note"
                ."សូមអរគុណដែលបានទិញពី The Man Store!",
            'order_delivered_cod_note' => "បង់ពេលដឹកដល់ — បង់សាច់ប្រាក់ ឬស្កេន QR ដែលអ្នកដឹកបង្ហាញ។\n\n",
            'order_cancelled' => "❌ <b>ការបញ្ជាទិញត្រូវបានលុបចោល</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."ស្ថានភាព: លុបចោល\n\n"
                ."ទាក់ទង The Man Store បើត្រូវការជំនួយ។",
            'order_failed' => "⚠️ <b>មានបញ្ហាការដឹក</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."ស្ថានភាព: បរាជ័យ\n\n"
                ."សូមទាក់ទង The Man Store សម្រាប់ជំនួយ។",
            'order_returned' => "↩️ <b>ការបញ្ជាទិញត្រូវបានត្រឡប់</b>\n\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."ស្ថានភាព: ត្រឡប់\n\n"
                ."សូមទាក់ទង The Man Store សម្រាប់ជំនួយ។",
            'admin_new_cod_order' => "🔔 *ការបញ្ជាទិញ COD ថ្មី*\n\n"
                ."ការបញ្ជាទិញ: `:label`\n"
                ."អតិថិជន: :customer\n"
                ."ទូរស័ព្ទ: :phone\n"
                ."មុខទំនិញ: :items\n"
                ."សរុប: \$:total\n"
                ."អាសយដ្ឋាន: :address",
            'order_status_title' => '📋 ស្ថានភាពការបញ្ជាទិញ',
            'order_label' => 'ការបញ្ជាទិញ',
            'status_label' => 'ស្ថានភាព',
            'shipment_label' => 'ការដឹកជញ្ជូន',
            'tracking_label' => 'លេខតាមដាន',
            'payment_pending' => 'ការបង់ប្រាក់: កំពុងរង់ចាំ',
            'already_paid' => '✅ ការបញ្ជាទិញនេះបានបង់រួចហើយ។',
            'payment_qr_failed' => '❌ មិនអាចបង្កើត Payment QR។ សូមព្យាយាមម្តងទៀត។',
            'payment_qr_failed_gen' => '❌ បរាជ័យក្នុងការបង្កើត Payment QR។ សូមព្យាយាមម្តងទៀត។',
            'payment_qr_gateway_down' => "⚠️ ប្រព័ន្ធបង់ប្រាក់កំពុងរអាក់រអួល។\n\nរង់ចាំប្រហែល ១ នាទី រួចចុច 🔄 បង្កើត KHQR ហាងម្ដងទៀត។ QR បង្ហាញក្នុង Telegram នេះ — ស្កេនតាម ABA / ACLEDA។ កុំបើកតំណកាមេរ៉ា។",
            'payment_qr_customer_denied' => "Customer chat មិនមាន Payment QR ទេ។\n\nCOD: បង់អ្នកដឹក ឬស្កេន QR ដែលអ្នកដឹកបង្ហាញ។\nKHQR: ចុច បង់ក្នុង App។",
            'payment_qr_customer_denied_short' => 'QR នៅអ្នកដឹក',
            'payment_qr_title' => '💳 Payment QR',
            'payment_qr_cod_note' => "\n\nQR ហាង — អ្នកដឹកស្កេនជាមួយ ABA / ACLEDA / Wing។\nហាងមិនស្កេនទេ។ ស្កេនរួចចុច ✅ ខ្ញុំបានបង់រួច។ បើធនាគារមិនបញ្ជាក់ ចុច ហាងបានទទួលលុយ។",
            'payment_qr_cod_customer_note' => "\n\nបង្ហាញ QR ហាងនេះអោយ Customer ស្កេនតាម ABA / ACLEDA / Wing។\nកុំនិយាយពីការកាត់ថ្លៃដឹក។",
            'payment_qr_scan_note' => "\n\nScan ជាមួយកម្មវិធីធនាគាររបស់អ្នកដើម្បីបង់។\nបន្ទាប់ពីស្កេនជោគជ័យ ចុច ✅ ខ្ញុំបានបង់រួច។",
            'payment_qr_expires' => "\n\n⏱ សុពលភាព :minutes នាទី · ដល់ម៉ោង :time",
            'amount_label' => 'ចំនួនទឹកប្រាក់',
            'generating_qr' => 'កំពុងបង្កើត Payment QR…',
            'loading_invoice' => 'កំពុងផ្ទុកវិក័យបត្រ…',
            'invoice_failed' => '❌ មិនអាចផ្ទុកវិក័យបត្រ។ សូមព្យាយាមម្តងទៀត។',
            'invalid_order' => 'ការបញ្ជាទិញមិនត្រឹមត្រូវ។',
            'order_not_found_short' => 'រកមិនឃើញការបញ្ជាទិញ។',
            'not_subscribed' => 'អ្នកមិនទាន់ជាវទទួលធ្វើបច្ចុប្បន្នភាពការបញ្ជាទិញនេះទេ។',
            'invoice_title' => 'វិក័យបត្រ',
            'invoice_number' => 'លេខវិក័យបត្រ',
            'invoice_date' => 'កាលបរិច្ឆេទ',
            'invoice_status' => 'ស្ថានភាព',
            'customer' => 'អតិថិជន',
            'items' => 'ផលិតផល',
            'qty_label' => 'ចំនួន',
            'subtotal' => 'សរុបរង',
            'discount' => 'បញ្ចុះតម្លៃ',
            'shipping' => 'ថ្លៃដឹក',
            'grand_total' => 'សរុបទាំងអស់',
            'courier' => 'អ្នកដឹក',
            'payment_cod' => 'ការបង់ប្រាក់: COD — ប្រមូលពេលដឹកដល់',
            'more_items' => '…និងផលិតផល :count ទៀត',
            'guest' => 'ភ្ញៀវ',
            'courier_fallback' => 'អ្នកដឹក',
            'driver_cod_choose' => "💵 *COD — ជម្រើសអ្នកដឹក*\n\nOrder: `:label`\nសរុប: $:total\n\n១) បង់ហាងឥឡូវ — ហាងមាន QR អ្នកដឹកស្កេន\n២) ប្រមូលពី Customer (Customer បង់ QR អ្នកដឹក) រួចអ្នកដឹកស្កេន QR ហាងបង់ *តែថ្លៃទំនិញ* (ថ្លៃដឹកនៅនឹងអ្នកដឹក)\n៣) ហាងចេញថ្លៃដឹករួច — បង្កើត QR ហាងអោយ Customer ស្កេន *ពេញចំនួន*",
            'driver_cod_pay_how' => "Driver បង់ហាងតាមមួយណា?\n\nOrder: `:label`\nសរុប: $:total\n\nហាងមាន QR — អ្នកដឹកជាអ្នកស្កេន។ ហាងមិនស្កេនទេ។",
            'driver_cod_wait_saved' => "✅ បានកត់ផែនការ: ប្រមូលពី Customer។\n\nCustomer បង់ *QR របស់អ្នកដឹក*: $:total\nបន្ទាប់មកចុច *បង្កើត KHQR ហាង* ក្នុង Telegram នេះ — បង់មកហាង $:remit (ថ្លៃទំនិញ)។ ថ្លៃដឹក $:shipping នៅនឹងអ្នកដឹក។ Customer មិនត្រូវឃើញការបង់នេះទេ។",
            'driver_cod_shop_prepaid_saved' => "✅ បានកត់ផែនការ: ហាងចេញថ្លៃដឹករួចហើយ។\n\nពេលដឹកដល់ បង្កើត QR ហាង។ Customer ស្កេនបង់ *ពេញ* $:total មកហាង។",
            'driver_cod_customer_qr' => "Customer បានបង់ QR អ្នកដឹក។ ឥឡូវស្កេន *QR ហាង* ដើម្បីបង់ថ្លៃទំនិញ។\n\nOrder: `:label`\nCustomer បង់: $:total\nបង់មកហាង: $:remit (ថ្លៃដឹក $:shipping នៅនឹងអ្នកដឹក)",
            'driver_cod_send_qr' => "KHQR ហាងនឹងបង្ហាញ *ក្នុង Telegram នេះ*។ បើក ABA / ACLEDA / Wing រួចស្កេនរូបខាងក្រោម។ មិនចាំបាច់ត្រលប់ទៅហាងទេ។\n\nOrder: `:label`\nចំនួន: $:total",
            'driver_cod_send_customer_qr' => "Customer បានបង់ QR អ្នកដឹក ($:total)។\n\n*បង្កើត KHQR ហាងក្នុង Telegram នេះ* — បើក ABA / ACLEDA ស្កេនរូបខាងក្រោម ដើម្បីផ្ទេរ $:remit (ថ្លៃទំនិញ)។ ថ្លៃដឹក $:shipping នៅនឹងអ្នកដឹក។\n\nមិនចាំបាច់ត្រលប់ទៅហាង ឬបើកតំណកាមេរ៉ាទេ។ កុំបង្ហាញ QR នេះអោយ Customer។",
            'driver_cod_send_customer_shop_qr' => "បង្ហាញ *QR ហាងក្នុង Telegram នេះ* អោយ Customer ស្កេន។ គាត់បង់មកហាង $:total ពេញចំនួន (ហាងចេញថ្លៃដឹករួចហើយ)។",
            'driver_cod_scan_nudge' => "📷 KHQR ហាងនឹងបង្កើតក្នុង Telegram នេះ។ បើកកម្មវិធីធនាគារ រួចស្កេនរូបក្នុង chat — មិនចាំបាច់ត្រលប់ទៅហាងទេ។",
            'driver_cod_recorded' => "✅ បានកត់ត្រា: :label",
            'btn_driver_pay_now' => '💵 បង់ឥឡូវ',
            'btn_driver_wait' => '⏳ ប្រមូលពី Customer',
            'btn_driver_shop_prepaid' => '🧾 ហាងចេញថ្លៃដឹក — QR Customer',
            'btn_driver_cash' => '💵 លុយសុទ្ធ',
            'btn_customer_paid_my_qr' => '📷 បង្កើត KHQR ហាង $:remit',
            'btn_generate_shop_khqr' => '📷 បង្កើត KHQR ហាង',
            'btn_generate_shop_khqr_amount' => '📷 បង្កើត KHQR ហាង $:remit',
            'btn_retry_shop_khqr' => '🔄 បង្កើត KHQR ហាងម្ដងទៀត',
            'btn_generate_customer_shop_qr' => '📷 QR ហាងអោយ Customer $:total',
            'btn_driver_scan_bank_qr' => '📷 បង្កើត KHQR ហាង',
            'driver_paid_on_behalf' => "✅ <b>អ្នកបានបង់លុយជំនួសបានជោគជ័យ</b>\n\n"
                ."Scan KHQR ហាងជោគជ័យ។\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."ចំនួន: :amount\n"
                ."ស្ថានភាព: បានបញ្ចប់\n\n"
                ."ហាងបានទទួលប្រាក់ហើយ។ ការបញ្ជាទិញនេះបានបញ្ចប់។",
            'driver_customer_paid_shop' => "✅ <b>Customer បានបង់មកហាង</b>\n\n"
                ."Customer ស្កេន KHQR ហាងជោគជ័យ។\n"
                ."ការបញ្ជាទិញ: <code>:label</code>\n"
                ."សរុប: $:total\n"
                ."ស្ថានភាព: បានបញ្ចប់\n\n"
                ."ហាងបានទទួលប្រាក់ហើយ។ ការបញ្ជាទិញនេះបានបញ្ចប់។",
        ],
    ];

    public static function resolveLocale(?TelegramUser $user): string
    {
        $preferred = strtolower(trim((string) ($user?->preferred_locale ?? '')));
        if (in_array($preferred, [self::LOCALE_KM, self::LOCALE_EN], true)) {
            return $preferred;
        }

        $telegramLang = strtolower(trim((string) ($user?->language_code ?? '')));
        if ($telegramLang !== '' && (str_starts_with($telegramLang, 'en'))) {
            return self::LOCALE_EN;
        }

        // The Man Store default: Khmer (Cambodia storefront).
        return self::LOCALE_KM;
    }

    /**
     * @param  array<string, string|int|float>  $replace
     */
    public static function get(string $locale, string $key, array $replace = []): string
    {
        $locale = in_array($locale, [self::LOCALE_KM, self::LOCALE_EN], true)
            ? $locale
            : self::LOCALE_EN;

        $text = self::STRINGS[$locale][$key] ?? self::STRINGS[self::LOCALE_EN][$key] ?? $key;

        foreach ($replace as $name => $value) {
            if ($name === 'plural' && str_contains($text, ':plural')) {
                $count = (int) ($replace['count'] ?? 0);
                $plural = $count === 1 ? '' : 's';
                if ($locale === self::LOCALE_KM) {
                    $plural = '';
                }
                $text = str_replace(':plural', $plural, $text);
            }
            $text = str_replace(':'.$name, (string) $value, $text);
        }

        return $text;
    }
}
