// Minimal App Store Connect API client. Credentials: ~/.appstoreconnect/asc.env (ASC_KEY_ID, ASC_ISSUER_ID,
// ASC_KEY_PATH), never in the repo.
//   node scripts/asc.mjs GET /v1/apps?filter[bundleId]=com.theanhgen.declutter
//   node scripts/asc.mjs POST /v1/inAppPurchases '{"data":…}'
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const env = Object.fromEntries(fs.readFileSync(`${os.homedir()}/.appstoreconnect/asc.env`, 'utf8')
  .split('\n').map((l) => l.match(/^(?:export\s+)?(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const keyPath = env.ASC_KEY_PATH.replace('$HOME', os.homedir());

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: fs.readFileSync(keyPath), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

export async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json?.errors ?? json)}`);
  return json;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [method, path, body] = process.argv.slice(2);
  console.log(JSON.stringify(await asc(method, path, body), null, 2));
}
