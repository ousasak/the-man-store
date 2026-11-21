<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->string('picked_up_by_name', 150)->nullable()->after('delivered_by_user_id');
            $table->string('picked_up_by_phone', 40)->nullable()->after('picked_up_by_name');
            $table->timestamp('picked_up_at')->nullable()->after('picked_up_by_phone');
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropColumn(['picked_up_by_name', 'picked_up_by_phone', 'picked_up_at']);
        });
    }
};
