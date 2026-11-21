<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;padding:20px 12px;background-color:#f3f6fb;">
        <tr>
            <td align="center" style="padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border:1px solid #dbe4f0;border-radius:12px;">
                    @include('emails.partials.logo')
                    <tr>
                        <td style="padding:0 24px 28px 24px;font-family:Arial,Helvetica,sans-serif;color:#10233f;">
    <h2>Hello, {{ $user->name ?? $user->email }}</h2>
    <p>You requested a password reset for your The Man Store account.</p>
    <p>Click the link below to reset your password:</p>
    <p>
        <a href="{{ url('/reset-password?token=' . $token . '&email=' . urlencode($user->email)) }}" style="background:#4f46e5;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">Reset Password</a>
    </p>
    <p>If you did not request this, please ignore this email.</p>
    <p>Thank you,<br>The Man Store Team</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
