<?php

namespace App\Support;

final class MailDiagnostics
{
    /**
     * @return array<string, mixed>
     */
    public static function summary(): array
    {
        $mailer = (string) config('mail.default', 'log');
        $from = (string) config('mail.from.address', '');
        $fromName = (string) config('mail.from.name', '');
        $issues = self::issues($mailer, $from);

        return [
            'mailer' => $mailer,
            'from_address' => $from,
            'from_name' => $fromName,
            'configured' => $issues === [],
            'issues' => $issues,
        ];
    }

    /**
     * @return list<string>
     */
    public static function issues(?string $mailer = null, ?string $from = null): array
    {
        $mailer = $mailer ?? (string) config('mail.default', 'log');
        $from = $from ?? (string) config('mail.from.address', '');
        $issues = [];

        if ($mailer === 'log' || $mailer === 'array') {
            $issues[] = 'MAIL_MAILER is set to '.$mailer.'; OTP emails are not delivered to real inboxes.';
        }

        if ($mailer === 'resend') {
            $key = trim((string) env('RESEND_API_KEY', ''));
            if ($key === '') {
                $issues[] = 'RESEND_API_KEY is missing on the server.';
            }

            if (self::isResendSandboxFrom($from) && app()->environment('production')) {
                $issues[] = 'MAIL_FROM_ADDRESS uses Resend test sender ('.$from.'). Verify themanstore.online in Resend and use e.g. no-reply@themanstore.online.';
            }
        }

        if ($mailer === 'smtp') {
            if (trim((string) env('MAIL_HOST', '')) === '') {
                $issues[] = 'MAIL_HOST is missing.';
            }

            $username = trim((string) env('MAIL_USERNAME', ''));
            if ($username === '') {
                $issues[] = 'MAIL_USERNAME is missing.';
            } elseif (! str_contains($username, '@')) {
                $issues[] = 'MAIL_USERNAME must be a full email address (e.g. you@gmail.com), not "'.$username.'".';
            }

            if (trim((string) env('MAIL_PASSWORD', '')) === '') {
                $issues[] = 'MAIL_PASSWORD is missing.';
            }
        }

        if ($from === '' || $from === 'hello@example.com') {
            $issues[] = 'MAIL_FROM_ADDRESS is not set.';
        }

        return $issues;
    }

    public static function isResendSandboxFrom(?string $from = null): bool
    {
        $from = strtolower(trim((string) ($from ?? config('mail.from.address', ''))));

        return $from !== '' && str_ends_with($from, '@resend.dev');
    }

    public static function otpDeliveryFailureMessage(): string
    {
        $issues = self::issues();
        if ($issues !== []) {
            return $issues[0];
        }

        if (self::isResendSandboxFrom()) {
            return 'Email could not be sent. Resend test sender onboarding@resend.dev only delivers to verified inboxes. Verify themanstore.online in Resend and set MAIL_FROM_ADDRESS=no-reply@themanstore.online on Render.';
        }

        return 'We could not send the verification email. Please try again in a few minutes.';
    }
}
