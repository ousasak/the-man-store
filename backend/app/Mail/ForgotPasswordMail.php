<?php

namespace App\Mail;

use App\Mail\Concerns\AddsBrandMailHeaders;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class ForgotPasswordMail extends Mailable
{
    use AddsBrandMailHeaders;
    use Queueable, SerializesModels;

    public $token;
    public $user;

    public function __construct($user, $token)
    {
        $this->user = $user;
        $this->token = $token;
    }

    public function build()
    {
        return $this->subject('Reset Your Password')
            ->view('emails.forgot-password')
            ->withBrandMailHeaders();
    }
}
