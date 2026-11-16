// Attempt-контур: создание (status reading), приём ответов (античит → UPSERT → answering), события.
// Транзакция не обязательна (§бриф task-5): UPSERT идемпотентен, статус — последняя запись.
const crypto = require('crypto');
const anticheat = require('../anticheat');
let repo = require('../repo'); // seam для тестов: _setRepo подставляет мок (см. test/attempts.test.js)

const EVENT_TYPES = new Set(['read_start', 'read_end', 'switch', 'hint', 'anticheat_flag']);
const STAKE_MIN = 1, STAKE_MAX = 100000;

async function create({ user, level_id, stake }) {
  stake = Number(stake);
  if (!level_id || !Number.isInteger(stake) || stake < STAKE_MIN || stake > STAKE_MAX) {
    return { status: 400, body: { error: 'validation' } };
  }
  if (!(await repo.getLevel(level_id))) return { status: 404, body: { error: 'not_found' } };
  const now = Date.now();
  const attempt = {
    id: crypto.randomUUID(), user_id: user.id, level_id,
    stake, status: 'reading', pass_number: 1, socratic_count: 0, iterations: 0,
    created_at: now, updated_at: now,
  };
  await repo.createAttempt(attempt);
  return { body: { attempt } };
}

// answers: [{qid, text, keydown, pasted, t_answer}] — одна запись на qid, повторная отправка перезаписывает.
async function answers({ user, id, answers: ans }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (!Array.isArray(ans) || ans.length === 0 || ans.some(a => !a || !a.qid)) {
    return { status: 400, body: { error: 'validation' } };
  }
  if (anticheat.isSuspicious(ans)) {
    await repo.addEvent(user.id, id, 'anticheat_flag', { reason: 'suspicious', qids: ans.map(a => a.qid) }, Date.now());
    return { status: 422, body: { error: 'suspicious' } };
  }
  for (const a of ans) await repo.upsertAnswer(id, a);
  await repo.setAttemptStatus(id, 'answering', Date.now());
  return { body: { ok: true, status: 'answering' } };
}

async function event({ user, id, type, payload }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (!EVENT_TYPES.has(type)) return { status: 400, body: { error: 'validation' } };
  await repo.addEvent(user.id, id, type, payload, Date.now());
  return { body: { ok: true } };
}

function _setRepo(r) { repo = r; }

module.exports = { create, answers, event, EVENT_TYPES, _setRepo };
