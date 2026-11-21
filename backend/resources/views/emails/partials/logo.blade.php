@php
    $brandLogoUrl = $brandLogoUrl ?? \App\Support\BrandLogo::emailUrl();
    $emailHeaderBg = $emailHeaderBg ?? (string) config('app.email_header_bg', '#6e8b7e');
@endphp
<tr>
    <td align="center" style="padding:32px 24px;background-color:{{ $emailHeaderBg }};border-radius:12px 12px 0 0;">
        <img
            src="{{ $brandLogoUrl }}"
            alt="The Man Store"
            width="320"
            style="display:block;width:100%;max-width:320px;height:auto;border:0;outline:none;text-decoration:none;"
        />
    </td>
</tr>
