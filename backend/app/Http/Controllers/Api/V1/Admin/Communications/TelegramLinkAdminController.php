<?php

namespace App\Http\Controllers\Api\V1\Admin\Communications;

use App\Http\Controllers\Api\V1\Admin\BaseAdminController;

use App\Models\Order;
use App\Models\User;
use App\Services\TelegramBotAuthService;
use App\Services\TelegramService;
use Endroid\QrCode\Color\Color;
use Endroid\QrCode\Encoding\Encoding;
use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use RuntimeException;
use Throwable;

class TelegramLinkAdminController extends BaseAdminController
{
    public function __construct(
        private TelegramBotAuthService $auth,
        private TelegramService $telegram,
    ) {
    }

    public function status(Request $request, User $user): JsonResponse
    {
        if (! $this->canSeeTelegramLink($request->user(), $user)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return response()->json([
            'message' => 'Telegram link status',
            'data' => $this->auth->telegramLinkStatus($user),
        ]);
    }

    public function createCode(Request $request, User $user): JsonResponse
    {
        /** @var User $viewer */
        $viewer = $request->user();

        if (! $this->canManageTelegramLink($viewer, $user)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        if (! $this->telegram->isEnabled() || ! $this->telegram->botUsername()) {
            return response()->json([
                'message' => 'Telegram bot is not configured (token / bot name).',
            ], 422);
        }

        try {
            $payload = $this->auth->createLinkCode($user, $viewer);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Failed to create link code.'], 500);
        }

        return response()->json([
            'message' => 'Telegram link code created',
            'data' => $payload,
        ]);
    }

    public function unlink(Request $request, User $user): JsonResponse
    {
        if (! $this->canManageTelegramLink($request->user(), $user)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $this->auth->unlinkUser($user);

        return response()->json([
            'message' => 'Telegram unlinked',
            'data' => $this->auth->telegramLinkStatus($user),
        ]);
    }

    /**
     * Deep link + QR for external couriers (works after admin unlock).
     */
    public function driverJobQr(Request $request, Order $order): JsonResponse|Response
    {
        /** @var User $viewer */
        $viewer = $request->user();

        if (! $viewer->isSuperAdmin() && ! $viewer->hasAdminPermission('orders', 'view')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        if (! $this->telegram->isEnabled() || ! $this->telegram->botUsername()) {
            return response()->json([
                'message' => 'Telegram bot is not configured (token / bot name).',
            ], 422);
        }

        $deepLink = $this->auth->buildDriverJobDeepLink($order);
        if (! $deepLink) {
            return response()->json(['message' => 'Could not build Telegram deep link.'], 422);
        }

        $job = $this->auth->courierJobStatus($order);

        if ($request->query('format') === 'json') {
            return response()->json([
                'message' => 'Courier Telegram job link',
                'data' => array_merge($job, [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                ]),
            ]);
        }

        $writer = new PngWriter();
        $qrCode = QrCode::create($deepLink)
            ->setEncoding(new Encoding('UTF-8'))
            ->setSize(320)
            ->setMargin(12)
            ->setForegroundColor(new Color(0, 0, 0))
            ->setBackgroundColor(new Color(255, 255, 255));

        $result = $writer->write($qrCode);

        return response($result->getString(), 200)
            ->header('Content-Type', $result->getMimeType())
            ->header('Cache-Control', 'no-store');
    }

    public function unlockCourierJob(Request $request, Order $order): JsonResponse
    {
        /** @var User $viewer */
        $viewer = $request->user();

        $validated = $request->validate([
            'picked_up_by_name' => ['nullable', 'string', 'max:150'],
            'picked_up_by_phone' => ['nullable', 'string', 'max:40'],
        ]);

        try {
            $order = $this->auth->unlockCourierJob(
                $order,
                $viewer,
                $validated['picked_up_by_name'] ?? null,
                $validated['picked_up_by_phone'] ?? null,
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }

        return response()->json([
            'message' => 'Courier Telegram job unlocked. Courier can scan the QR now.',
            'data' => [
                'order' => $order,
                'courier_job' => $this->auth->courierJobStatus($order),
            ],
        ]);
    }

    public function lockCourierJob(Request $request, Order $order): JsonResponse
    {
        /** @var User $viewer */
        $viewer = $request->user();

        try {
            $order = $this->auth->lockCourierJob($order, $viewer);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }

        return response()->json([
            'message' => 'Courier Telegram job locked.',
            'data' => [
                'order' => $order,
                'courier_job' => $this->auth->courierJobStatus($order),
            ],
        ]);
    }

    private function canSeeTelegramLink(?User $viewer, User $target): bool
    {
        return $this->canReachTelegramLink($viewer, $target, 'view');
    }

    private function canManageTelegramLink(?User $viewer, User $target): bool
    {
        return $this->canReachTelegramLink($viewer, $target, 'edit');
    }

    private function canReachTelegramLink(?User $viewer, User $target, string $action): bool
    {
        if (! $viewer) {
            return false;
        }

        // Staff, customer, and driver Telegram linking. Role is never changed by this flow.
        if (! $target->isAdmin() && ! $target->isCustomer() && ! $target->isDriver()) {
            return false;
        }

        // Superadmin manages every staff link, and can revoke the telegram toggle at any time.
        if ($viewer->isSuperAdmin()) {
            return true;
        }

        // Own My Profile, as long as Superadmin left the telegram permission on.
        return (int) $viewer->id === (int) $target->id
            && $viewer->hasAdminPermission('telegram', $action);
    }
}
