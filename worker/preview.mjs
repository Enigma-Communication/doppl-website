const COOKIE = '__Host-doppl-preview';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const noCache = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive', 'x-content-type-options': 'nosniff' };

const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const hex = (bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function equal(a, b) {
  const [left, right] = await Promise.all([a, b].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const first = new Uint8Array(left), second = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < first.length; index++) difference |= first[index] ^ second[index];
  return difference === 0;
}

async function signature(payload, env) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(`${env.DOPPL_PREVIEW_SECRET}:${env.DOPPL_PREVIEW_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

async function authorized(request, env) {
  const cookie = (request.headers.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie) return false;
  const [expires, nonce, mac, extra] = cookie.split('.');
  if (extra || !/^\d{10}$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(mac || '')) return false;
  const remaining = Number(expires) - Math.floor(Date.now() / 1000);
  if (remaining <= 0 || remaining > SESSION_SECONDS) return false;
  return equal(mac, await signature(`${expires}.${nonce}`, env));
}

function safeReturn(value) {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const parsed = new URL(value, 'https://preview.invalid');
  return parsed.origin === 'https://preview.invalid' && !parsed.pathname.startsWith('/_preview/') ? parsed.pathname + parsed.search + parsed.hash : '/';
}

function gate(wordmark, gateFonts, returnTo, error = false) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Doppl — Studio preview</title><style>
@font-face{font-family:DopplDisplay;src:url(data:font/otf;base64,${gateFonts.display || ''}) format('opentype');font-weight:400;font-display:swap}@font-face{font-family:DopplBody;src:url(data:font/otf;base64,${gateFonts.body || ''}) format('opentype');font-weight:300;font-display:swap}
*{box-sizing:border-box}body{margin:0;background:#000;color:#ecece3;font-family:DopplBody,monospace;font-weight:300;letter-spacing:-.015em;min-height:100svh;padding:clamp(24px,4vw,40px);display:flex;flex-direction:column}header,footer{width:100%;max-width:1280px;margin-inline:auto}header svg{display:block;width:100%;height:auto}main{width:100%;max-width:430px;margin:auto;padding:65px 0}small{font-size:12px;line-height:1.5;letter-spacing:0;color:#ecece3b3;text-transform:uppercase}h1{font-family:DopplDisplay,Georgia,serif;font-size:clamp(48px,6vw,72px);font-weight:400;letter-spacing:-.025em;line-height:1.05;margin:20px 0 36px}label{display:block;font-size:15px;line-height:1.5;margin-bottom:10px}input{width:100%;border:1px solid #ecece380;background:transparent;color:#ecece3;border-radius:0;padding:16px;font:300 18px DopplBody,monospace}button{width:100%;margin-top:14px;padding:17px 20px;border:1px solid #ecece3;background:#ecece3;color:#000;font:300 16px DopplBody,monospace;cursor:pointer}input:focus-visible,button:focus-visible{outline:2px solid #ecece3;outline-offset:4px}.error{font-size:15px;line-height:1.6;color:#ecece3;margin:12px 0 0}footer{border-top:1px solid #ecece345;padding-top:18px;font-size:12px;line-height:1.5;letter-spacing:0;color:#ecece3b3;text-transform:uppercase}
</style></head><body><header aria-label="Doppl studio">${wordmark}</header><main><small>Private preview</small><h1>Come on in.</h1><form action="/_preview/login" method="post"><input type="hidden" name="returnTo" value="${escape(safeReturn(returnTo))}"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128" ${error ? 'aria-invalid="true" aria-describedby="error"' : ''}>${error ? '<p class="error" id="error" role="alert">That password didn’t match. Please try again.</p>' : ''}<button type="submit">Enter studio</button></form></main><footer>Possibility, multiplied</footer></body></html>`, {
    status: error ? 401 : 200,
    headers: { ...noCache, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'referrer-policy': 'same-origin' },
  });
}

function assetPath(pathname, assets) {
  const candidates = [pathname, `${pathname.endsWith('/') ? pathname : pathname + '/'}index.html`];
  return candidates.find((path) => Object.hasOwn(assets, path));
}

function rangeFor(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return false;
  const offset = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(offset) && Number.isSafeInteger(end) && offset >= 0 && end >= offset && offset < size ? { offset, length: end - offset + 1 } : false;
}

export function createPreviewWorker({ assets, buildId, wordmark, gateFonts = {} }) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (!env.DOPPL_PREVIEW_PASSWORD || !env.DOPPL_PREVIEW_SECRET || !env.DOPPL_ASSETS) return new Response('The preview is being prepared. Please try again shortly.', { status: 503, headers: noCache });

      // Only deployment tooling may write the exact files in this build manifest.
      if (url.pathname === '/_preview/upload') {
        if (request.method !== 'PUT' || !env.DOPPL_ASSET_UPLOAD_TOKEN || !await equal(request.headers.get('x-doppl-upload-token') || '', env.DOPPL_ASSET_UPLOAD_TOKEN)) return new Response('Not found', { status: 404, headers: noCache });
        const uploadHeaders = { ...noCache, 'x-doppl-build-id': buildId };
        if (url.searchParams.has('build') && url.searchParams.get('build') !== buildId) return new Response('Deployment is still updating.', { status: 409, headers: uploadHeaders });
        const path = url.searchParams.get('path');
        const asset = Object.hasOwn(assets, path) ? assets[path] : null;
        if (!asset || Number(request.headers.get('content-length')) !== asset.size) return new Response('Invalid asset', { status: 400, headers: noCache });
        await env.DOPPL_ASSETS.put(`${buildId}${path}`, request.body, { sha256: asset.sha256, httpMetadata: { contentType: asset.type }, customMetadata: { sha256: asset.sha256 } });
        return new Response('Stored', { status: 201, headers: uploadHeaders });
      }

      if (url.pathname === '/_preview/login') {
        if (request.method !== 'POST') return gate(wordmark, gateFonts, '/');
        const origin = request.headers.get('origin');
        if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', { status: 403, headers: noCache });
        if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') || Number(request.headers.get('content-length')) > 2048) return new Response('Invalid request', { status: 400, headers: noCache });
        const body = await request.text();
        if (body.length > 2048) return new Response('Invalid request', { status: 400, headers: noCache });
        const form = new URLSearchParams(body);
        const returnTo = safeReturn(form.get('returnTo'));
        if (!await equal(form.get('password') || '', env.DOPPL_PREVIEW_PASSWORD)) return gate(wordmark, gateFonts, returnTo, true);
        const payload = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
        return new Response(null, { status: 303, headers: { ...noCache, location: returnTo, 'set-cookie': `${COOKIE}=${payload}.${await signature(payload, env)}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Lax` } });
      }

      if (!await authorized(request, env)) {
        if (request.method === 'GET' && (request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('/') || !url.pathname.split('/').pop().includes('.'))) return gate(wordmark, gateFonts, url.pathname + url.search);
        return new Response('Password required.', { status: 401, headers: noCache });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { ...noCache, allow: 'GET, HEAD' } });

      let path = assetPath(url.pathname, assets);
      let status = 200;
      if (!path) { path = '/404.html'; status = 404; }
      const asset = assets[path];
      if (!asset) return new Response('Not found', { status: 404, headers: noCache });
      const range = request.method === 'GET' && status === 200 ? rangeFor(request.headers.get('range'), asset.size) : null;
      if (range === false) return new Response(null, { status: 416, headers: { ...noCache, 'content-range': `bytes */${asset.size}` } });
      const headers = new Headers({ ...noCache, 'content-type': asset.type, 'accept-ranges': 'bytes', 'content-length': String(range ? range.length : asset.size), etag: `"${asset.sha256}"` });
      if (range) { status = 206; headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${asset.size}`); }
      const object = request.method === 'HEAD'
        ? await env.DOPPL_ASSETS.head(`${buildId}${path}`)
        : await env.DOPPL_ASSETS.get(`${buildId}${path}`, range ? { range } : undefined);
      if (!object) return new Response('The preview is being prepared. Please try again shortly.', { status: 503, headers: noCache });
      return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
    },
  };
}
