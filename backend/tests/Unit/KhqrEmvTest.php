<?php

namespace Tests\Unit;

use App\Support\KhqrEmv;
use PHPUnit\Framework\TestCase;

class KhqrEmvTest extends TestCase
{
    public function test_crc_roundtrip_and_static_conversion_drops_expiry(): void
    {
        $dynamic = $this->buildQr([
            '00' => '01',
            '01' => '12',
            '52' => '5999',
            '53' => '116',
            '54' => '1000',
            '58' => 'KH',
            '99' => '1735689600000',
        ]);

        $this->assertTrue(KhqrEmv::isValid($dynamic));
        $this->assertSame('12', $this->tag($dynamic, '01'));
        $this->assertNotNull($this->tag($dynamic, '99'));

        $static = KhqrEmv::toStatic($dynamic);

        $this->assertTrue(KhqrEmv::isValid($static));
        $this->assertSame('11', $this->tag($static, '01'));
        $this->assertNull($this->tag($static, '99'));
        $this->assertSame('1000', $this->tag($static, '54'));
        $this->assertSame($static, KhqrEmv::toStatic($static));
    }

    /**
     * @param  array<string, string>  $tags
     */
    private function buildQr(array $tags): string
    {
        $out = '';
        foreach ($tags as $id => $value) {
            $out .= $id.str_pad((string) strlen($value), 2, '0', STR_PAD_LEFT).$value;
        }
        $out .= '6304';

        return $out.KhqrEmv::crc16($out);
    }

    private function tag(string $qr, string $id): ?string
    {
        foreach (KhqrEmv::parse($qr) as $tag) {
            if ($tag['tag'] === $id) {
                return $tag['value'];
            }
        }

        return null;
    }
}
