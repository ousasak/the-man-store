<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->timestamp('courier_job_unlocked_at')->nullable()->after('picked_up_at');
            $table->foreignId('courier_job_unlocked_by')
                ->nullable()
                ->after('courier_job_unlocked_at')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('courier_job_unlocked_by');
            $table->dropColumn('courier_job_unlocked_at');
        });
    }
};
