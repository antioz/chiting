// Регистрация (с invite → child; без invite → waitlist 403) и логин (JWT 30 дней).
const crypto = require('crypto');
const jwt = require('../jwt');
const repo = require('../repo');

async function register({ name, password, invite }) {
  if (!name || !password || String(password).length < 4) return { status: 400, body: { error: 'validation' } };
  if (await repo.getUserByLogin(name)) return { status: 409, body: { error: 'login_taken' } };
  const used = await repo.inviteUse(invite);
  if (!used.ok) {
    await repo.waitlistAdd({ id: crypto.randomUUID(), name, contact: '', created_at: Date.now(), status: 'new' });
    return { status: 403, body: { error: 'waitlist' } };
  }
  const user = { id: crypto.randomUUID(), login: name, pass_hash: hash(password), role: 'child', family_id: crypto.randomUUID(), invite_code: invite, created_at: Date.now() };
  await repo.createUser(user);
  return { body: { token: jwt.sign({ id: user.id, role: user.role }, 86400 * 30) } };
}

async function login({ name, password }) {
  const u = await repo.getUserByLogin(name);
  if (!u || u.pass_hash !== hash(password)) return { status: 401, body: { error: 'bad_credentials' } };
  return { body: { token: jwt.sign({ id: u.id, role: u.role }, 86400 * 30) } };
}

function hash(s) { return crypto.createHash('sha256').update(String(s) + (process.env.SECRET || '')).digest('hex'); }

module.exports = { register, login, hash };
