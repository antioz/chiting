// Интеграционный тест античит-проверки на приёме ответов attempt.
// Seam: handlers/attempts.js держит repo в модульной переменной (_setRepo);
// здесь подставляем мок — реальный YDB не трогаем.
const test = require('node:test');
const assert = require('node:assert');
const attempts = require('../lib/handlers/attempts');
const anticheat = require('../lib/anticheat');

function makeRepo(over = {}) {
  const calls = { answers: [], updates: [], events: [], created: null };
  const repo = {
    getLevel: async (id) => (id === 'lvl-p2-vanka' ? { id } : null),
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'reading' }),
    createAttempt: async a => { calls.created = a; },
    upsertAnswer: async (...args) => calls.answers.push(args),
    setAttemptStatus: async (...args) => calls.updates.push(args),
    addEvent: async (...args) => calls.events.push(args),
    ...over,
  };
  return { repo, calls };
}

const USER = { id: 'u1', role: 'child' };
const GOOD = [
  { qid: 'q1', text: 'О встрече Ваньки с дядей', keydown: 24, pasted: false },
  { qid: 'q2', text: 'Потому что дядя был добрым', keydown: 27, pasted: false },
];

test('answers: pasted=true на длинном ответе → 422 {error:"suspicious"} + событие anticheat_flag', async () => {
  const { repo, calls } = makeRepo();
  attempts._setRepo(repo);
  const spy = () => { let n = 0; return { inc: () => n++, get: () => n }; };
  let checked = 0;
  const orig = anticheat.isSuspicious;
  anticheat.isSuspicious = a => { checked++; return orig(a); };
  try {
    const res = await attempts.answers({ user: USER, id: 'a1', answers: [
      ...GOOD,
      { qid: 'q3', text: 'Очень длинный вставленный ответ длиной явно больше сорока символов подряд', keydown: 3, pasted: true },
    ] });
    assert.strictEqual(checked, 1, 'isSuspicious должен быть вызван ровно один раз на приёме');
    assert.strictEqual(res.status, 422);
    assert.deepStrictEqual(res.body, { error: 'suspicious' });
    const flags = calls.events.filter(e => e[2] === 'anticheat_flag');
    assert.strictEqual(flags.length, 1, 'должно быть одно событие anticheat_flag');
    assert.strictEqual(calls.answers.length, 0, 'подозрительные ответы не пишутся в answers');
    assert.strictEqual(calls.updates.length, 0, 'статус attempt не меняется при 422');
  } finally {
    anticheat.isSuspicious = orig;
    attempts._setRepo(require('../lib/repo'));
  }
});

test('answers: обычные ответы → UPSERT, статус answering, без anticheat_flag', async () => {
  const { repo, calls } = makeRepo();
  attempts._setRepo(repo);
  const res = await attempts.answers({ user: USER, id: 'a1', answers: GOOD });
  attempts._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, undefined);
  assert.deepStrictEqual(res.body, { ok: true, status: 'answering' });
  assert.strictEqual(calls.answers.length, 2);
  assert.strictEqual(calls.updates.length, 1);
  assert.strictEqual(calls.updates[0][1], 'answering');
  assert.strictEqual(calls.events.filter(e => e[2] === 'anticheat_flag').length, 0);
});

test('answers: повторная отправка того же qid → перезапись (upsert, одна запись на qid)', async () => {
  const { repo, calls } = makeRepo();
  attempts._setRepo(repo);
  const a = { qid: 'q1', text: 'исправленный ответ на первый вопрос', keydown: 30, pasted: false };
  await attempts.answers({ user: USER, id: 'a1', answers: [a] });
  await attempts.answers({ user: USER, id: 'a1', answers: [a] });
  attempts._setRepo(require('../lib/repo'));
  // оба раза шли через UPSERT (REPLACE INTO) — в repo два вызова upsertAnswer на один qid,
  // уникальность (attempt_id, qid) гарантирует схема таблицы.
  assert.strictEqual(calls.answers.length, 2);
  assert.strictEqual(calls.answers[0][0], 'a1');
  assert.strictEqual(calls.answers[0][1].qid, 'q1');
  assert.strictEqual(calls.answers[1][1].qid, 'q1');
});

test('answers: чужой attempt → 404', async () => {
  const { repo } = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u2' }) });
  attempts._setRepo(repo);
  const res = await attempts.answers({ user: USER, id: 'a1', answers: GOOD });
  attempts._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(res.body, { error: 'not_found' });
});

test('event: whitelist — read_start ok, мусор → 400', async () => {
  const { repo, calls } = makeRepo();
  attempts._setRepo(repo);
  const ok = await attempts.event({ user: USER, id: 'a1', type: 'read_start', payload: { at: 1 } });
  const bad = await attempts.event({ user: USER, id: 'a1', type: 'hack' });
  const foreign = await attempts.event({ user: USER, id: 'a1', type: 'read_end' });
  attempts._setRepo(require('../lib/repo'));
  assert.deepStrictEqual(ok.body, { ok: true });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(calls.events.length, 2);
  assert.strictEqual(calls.events[0][2], 'read_start');
});

test('create: ставка 1..100000, статус reading; 0 и 100001 → 400', async () => {
  const { repo, calls } = makeRepo();
  attempts._setRepo(repo);
  const bad0 = await attempts.create({ user: USER, level_id: 'lvl-p2-vanka', stake: 0 });
  const badBig = await attempts.create({ user: USER, level_id: 'lvl-p2-vanka', stake: 100001 });
  const noLevel = await attempts.create({ user: USER, level_id: 'nope', stake: 50 });
  const ok = await attempts.create({ user: USER, level_id: 'lvl-p2-vanka', stake: 50 });
  attempts._setRepo(require('../lib/repo'));
  assert.strictEqual(bad0.status, 400);
  assert.strictEqual(badBig.status, 400);
  assert.strictEqual(noLevel.status, 404);
  assert.strictEqual(ok.status, undefined);
  assert.strictEqual(calls.created.status, 'reading');
  assert.strictEqual(calls.created.stake, 50);
  assert.strictEqual(calls.created.user_id, 'u1');
});
