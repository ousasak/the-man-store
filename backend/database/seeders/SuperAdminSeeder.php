<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        // Create Superadmin
        User::firstOrCreate(
            ['email' => 'superadmin@gmail.com'],
            [
                'name' => 'Super Administrator',
                'password' => Hash::make('1234567'),
                'role' => 'superadmin',
                'status' => 'active',
                'email_verified_at' => now(),
                'phone' => '+1234567890',
            ]
        );

        // Create default Admin
        User::firstOrCreate(
            ['email' => 'admin@gmail.com'],
            [
                'name' => 'Administrator',
                'password' => Hash::make('1234567'),
                'role' => 'admin',
                'status' => 'active',
                'email_verified_at' => now(),
                'phone' => '+1234567891',
            ]
        );

        // Create default Customer for testing
        User::firstOrCreate(
            ['email' => 'customer@gmail.com'],
            [
                'name' => 'Test Customer',
                'password' => Hash::make('1234567'),
                'role' => 'customer',
                'status' => 'active',
                'email_verified_at' => now(),
                'phone' => '+1234567892',
            ]
        );

        echo "Superadmin and default roles created successfully!\n";
    }
}
