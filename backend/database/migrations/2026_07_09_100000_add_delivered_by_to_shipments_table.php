<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->string('delivered_by_name', 150)->nullable()->after('delivered_at');
            $table->foreignId('delivered_by_user_id')->nullable()->after('delivered_by_name')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('delivered_by_user_id');
            $table->dropColumn('delivered_by_name');
        });
    }
};
