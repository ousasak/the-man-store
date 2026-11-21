<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Collection extends Model
{
    protected $fillable = [
        'name',
        'subtitle',
        'gender',
        'placement',
        'slug',
        'description',
        'image_url',
        'text_position',
        'link',
        'category_ids',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'category_ids' => 'array',
    ];
}
