const crypto = require('crypto');
let SECRET = '';
function init(secret) { SECRET = secret; }
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function sign(payload, ttlSec) {
  const h = b64url(JSON.stringify({ alg: 'HS256' }));
  const p = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + ttlSec }));
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
function verify(token) {
  try {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) return null;
    const expect = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
    delete payload.exp;
    return payload;
  } catch { return null; }
}
module.exports = { init, sign, verify };
