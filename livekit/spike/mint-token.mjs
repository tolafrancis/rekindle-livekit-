// Throwaway LiveKit token minter for the Phase 0 spike.
// Dependency-free (node:crypto only) HS256 JWT with a LiveKit VideoGrant.
// This is NOT the production token path — Phase 1 builds the `livekit-token`
// edge fn that derives grants from the DB. This just gets you *a* token to prove
// the infra works.
//
// Usage:
//   node livekit/spike/mint-token.mjs --room spike --identity alice --name Alice
//   node livekit/spike/mint-token.mjs --room spike --identity bob   --name Bob
//
// Flags:
//   --room       room name              (default: spike)
//   --identity   participant identity   (default: user-<rand>)
//   --name       display name           (default: identity)
//   --ttl        seconds until expiry   (default: 21600 = 6h)
//   --no-publish     mint a subscribe-only (viewer) token
//   --recorder       mint a hidden egress-style token (subscribe only, hidden)
//   --url        LiveKit ws url to embed in the printed spike link
//
// Key/secret come from env — there is deliberately no fallback, so a real secret
// never has to live in this file:
//   export $(grep -v '^#' livekit/.env | xargs)   # or set them by hand

import crypto from 'node:crypto';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET (see livekit/.env).');
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) return true; // boolean flag
  return next;
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const seg = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', API_SECRET).update(seg).digest();
  return `${seg}.${b64url(sig)}`;
}

const rand = crypto.randomBytes(3).toString('hex');
const room = String(arg('room', 'spike'));
const identity = String(arg('identity', `user-${rand}`));
const name = String(arg('name', identity));
const ttl = parseInt(String(arg('ttl', '21600')), 10);
const noPublish = arg('no-publish', false) === true;
const recorder = arg('recorder', false) === true;
const url = arg('url', process.env.LIVEKIT_URL || 'ws://localhost:7880');

const canPublish = !(noPublish || recorder);
const now = Math.floor(Date.now() / 1000);

const grant = {
  room,
  roomJoin: true,
  canPublish,
  canSubscribe: true,
  canPublishData: true,
};
if (recorder) grant.hidden = true;

const payload = {
  iss: API_KEY,
  sub: identity,
  nbf: now,
  exp: now + ttl,
  name,
  metadata: JSON.stringify({ role: recorder ? 'egress' : noPublish ? 'viewer' : 'attendee' }),
  video: grant,
};

const token = sign(payload);

const link = `${new URL('index.html', `file://${process.cwd()}/livekit/spike/`).href}` +
  `?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;

console.log('\n=== LiveKit spike token ===');
console.log(`room       : ${room}`);
console.log(`identity   : ${identity} (${name})`);
console.log(`canPublish : ${canPublish}${recorder ? '  [hidden recorder]' : ''}`);
console.log(`url        : ${url}`);
console.log(`expires in : ${ttl}s\n`);
console.log('TOKEN:\n' + token + '\n');
console.log('Open the spike page with this token pre-filled:');
console.log(link + '\n');
