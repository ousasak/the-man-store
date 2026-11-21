<?php

namespace App\Support;

/**
 * Cloudflare R2 rejects S3 object ACL headers. Laravel's S3 adapter always sets ACL
 * (default "private") unless it is removed before PutObject / multipart upload.
 */
final class StripR2ObjectAcl
{
    public static function beforeUpload(mixed $command): void
    {
        if (! is_object($command)) {
            return;
        }

        if (isset($command['ACL'])) {
            unset($command['ACL']);
        }
    }
}
