<?php

namespace App\Mail\Concerns;

use App\Support\BrandLogo;
use Symfony\Component\Mime\Email;

/** BIMI selector header so inbox clients can use the circle mark as sender branding. */
trait AddsBrandMailHeaders
{
    protected function withBrandMailHeaders(): static
    {
        if (BrandLogo::bimiLogoUrl() === null) {
            return $this;
        }

        return $this->withSymfonyMessage(function (Email $message) {
            $message->getHeaders()->addTextHeader('BIMI-Selector', 'v=BIMI1; s=default;');
        });
    }
}
