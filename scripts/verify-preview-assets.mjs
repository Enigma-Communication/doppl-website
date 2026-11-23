import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Use after upload. Existing preview credentials arrive over hidden stdin only.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
console.error('Ready for preview verification JSON on stdin (input is hidden).');
const input = await new Promise((resolve, reject) => {
  let data = '';
  const onData = chunk => {
    data += chunk;
    if (data.includes('\u0003')) reject(new Error('Cancelled'));
    if (/[\r\n]/.test(data)) {
      process.stdin.off('data', onData);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      try { resolve(JSON.parse(data.trim())); } catch (error) { reject(error); }
    }
  };
  process.stdin.on('data', onData);
  process.stdin.resume();
});
const origin = new URL(input.url).origin;
if (!origin.startsWith('https://') || !origin.endsWith('.chatgpt.site')) throw new Error('Expected a secure Sites origin.');
const access = input.bypass ? { 'OAI-Sites-Authorization': input.bypass } : {};
const login = await fetch(`${origin}/_preview/login`, {
  method: 'POST', headers: { ...access, origin, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: input.password, returnTo: '/' }), redirect: 'manual',
});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (login.status !== 303 || !cookie) throw new Error(`Preview login failed (${login.status}).`);
await login.arrayBuffer();
const { assets, buildId } = JSON.parse(await readFile('.sites-runtime/preview-assets.json', 'utf8'));
const queue = Object.entries(assets);
const failures = [];
let verified = 0;
async function verify() {
  while (queue.length) {
    const [pathname, asset] = queue.shift();
    try {
      const response = await fetch(origin + pathname, { headers: { ...access, cookie }, signal: AbortSignal.timeout(90000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // The host may inject its bridge into HTML; other asset bytes must match.
      if (!asset.type.startsWith('text/html') && createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Content hash mismatch');
      if (asset.type.startsWith('video/')) {
        const range = await fetch(origin + pathname, { headers: { ...access, cookie, range: 'bytes=0-1023' }, signal: AbortSignal.timeout(20000) });
        const part = Buffer.from(await range.arrayBuffer());
        if (range.status !== 206 || range.headers.get('content-range') !== `bytes 0-1023/${asset.size}` || !part.equals(bytes.subarray(0, 1024))) throw new Error('Video byte-range mismatch');
      }
      verified++;
    } catch (error) {
      failures.push({ path: pathname, error: error.message });
    }
  }
}
await Promise.all(Array.from({ length: 4 }, verify));
console.log(JSON.stringify({ buildId, verified, total: Object.keys(assets).length, failures }));
if (failures.length) process.exitCode = 1;
