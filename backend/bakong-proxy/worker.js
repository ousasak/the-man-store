/**
 * Cloudflare Worker — Bakong NBC API proxy (Cambodia edge egress).
 *
 * POST {"md5":"..."}  → check_transaction_by_md5
 * POST {"qr":"...", "sourceInfo":{...}}  → generate_deeplink_by_qr
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (request.method !== 'POST') {
      return json(405, { message: 'Method not allowed' });
    }

    const proxySecret = (env.BAKONG_PROXY_SECRET || '').trim();
    if (proxySecret !== '') {
      const provided = request.headers.get('X-Bakong-Proxy-Secret') || '';
      if (provided !== proxySecret) {
        return json(401, { message: 'Unauthorized' });
      }
    }

    const token = (env.BAKONG_TOKEN || '').trim();
    if (token === '') {
      return json(500, { message: 'BAKONG_TOKEN not configured on worker' });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(400, { message: 'Invalid JSON body' });
    }

    const baseUrl = (env.BAKONG_BASE_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/$/, '');
    const qr = String(payload?.qr || '').trim();

    let targetUrl;
    let nbcBody;
    if (qr !== '') {
      targetUrl = `${baseUrl}/v1/generate_deeplink_by_qr`;
      nbcBody = { qr };
      if (payload?.sourceInfo && typeof payload.sourceInfo === 'object') {
        nbcBody.sourceInfo = payload.sourceInfo;
      }
    } else {
      const md5 = String(payload?.md5 || '').trim().toLowerCase();
      if (md5 === '') {
        return json(422, { message: 'md5 or qr is required' });
      }
      targetUrl = `${baseUrl}/v1/check_transaction_by_md5`;
      nbcBody = { md5 };
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(nbcBody),
      });

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: JSON_HEADERS,
      });
    } catch (error) {
      return json(502, {
        message: 'Proxy fetch failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}
