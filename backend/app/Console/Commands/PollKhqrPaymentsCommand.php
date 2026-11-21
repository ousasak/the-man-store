<?php

namespace App\Console\Commands;

use App\Services\RielpayPaymentService;
use Illuminate\Console\Command;

class PollKhqrPaymentsCommand extends Command
{
    protected $signature = 'payments:poll-khqr';

    protected $description = 'Check pending KHQR payments and mark paid when the scan succeeds';

    public function handle(RielpayPaymentService $rielpay): int
    {
        $paid = $rielpay->pollPendingKhqr();

        if ($this->output->isVerbose()) {
            $this->info('KHQR poll marked '.$paid.' payment(s) paid.');
        }

        return self::SUCCESS;
    }
}
