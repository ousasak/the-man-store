<?php

namespace App\Mail;

use App\Mail\Concerns\AddsBrandMailHeaders;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class OtpCodeMail extends Mailable
{
    use AddsBrandMailHeaders;
    use Queueable, SerializesModels;

    public string $code;
    public string $purpose;
    public int $expiresMinutes;

    public function __construct(string $code, string $purpose, int $expiresMinutes)
    {
        $this->code = $code;
        $this->purpose = $purpose;
        $this->expiresMinutes = $expiresMinutes;
    }

    public function build()
    {
        $viewData = [
            'code' => $this->code,
            'purpose' => $this->purpose,
            'expiresMinutes' => $this->expiresMinutes,
        ];

        return $this->subject('Your verification code')
            ->view('emails.otp-code', $viewData)
            ->text('emails.otp-code-text', $viewData)
            ->withBrandMailHeaders();
    }
}
