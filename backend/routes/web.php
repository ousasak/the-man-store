<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response('The Man Store server is running', 200, [
        'Content-Type' => 'text/plain; charset=UTF-8',
    ]);
});
