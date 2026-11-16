// Админка (task-10): полный отчёт, HTML-экспорт, экономика, 403, вейт-лист-апрув.
// Мок repo через _setRepo (как в review.test.js); YDB и LLM не трогаем.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// db.ready подменяем ДО require('../index') — index делает const { ready } = require('./lib/db')
// и ловит значение в момент загрузки. Дальше handler идёт по маршрутам с мокнутым repo.
// SECRET нужен: index.js fail-fast при холодном старте без env (I3).
process.env.SECRET = process.env.SECRET || 'test-secret';
require('../lib/db');
require.cache[require.resolve('../lib/db')].exports.ready = async () => {};
const { handler } = require('../index');
const admin = require('../lib/handlers/admin');
const exporter = require('../lib/export');

const ADMIN = { id: 'admin-root', role: 'admin' };
const CHILD = { id: 'u1', role: 'child' };
const NOW = Date.now();
const DAY = (n) => NOW - n * 86400 * 1000;

const QUESTIONS = [
  { qid: 'q1', type: 'T2', text: 'Сожми текст до одного предложения', form_spec: { limit_words: 25 }, fragment_ref: 'whole' },
  { qid: 'q2', type: 'T1', text: 'Перескажи мольбу своими словами', form_spec: { forbid: 'цитата' }, fragment_ref: 'f3' },
  { qid: 'q3', type: 'T3', text: 'Приведи свой пример', fragment_ref: 'f1' },
];
const PACK_TEXT = JSON.stringify({ results: [
  { qid: 'q1', criteria: [2, 2, 2, 2, 2], explanation: 'Полный сжатый пересказ' },
  { qid: 'q2', criteria: [0, 0, 0, 0, 0], explanation: 'Сплошная цитата' },
  { qid: 'q3', criteria: [2, 2, 1, 2, 2], explanation: 'Свой случай есть' },
] });

function makeRepo(over = {}) {
  const calls = { invites: [], waitlistStatus: [] };
  const wState = { id: 'w1', name: 'Вася', contact: 'vasya@example.com', status: 'new', created_at: NOW };
  const repo = {
    getAttempt: async () => ({
      id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', stake: 25, status: 'approved',
      pass_number: 1, iterations: 1, socratic_count: 1,
      marks_json: { q1: { mark: 2, total: 10, explanation: 'Полный сжатый пересказ' }, q2: { mark: 0, total: 0, explanation: 'Сплошная цитата' }, q3: { mark: 2, total: 9, explanation: 'Свой случай есть' } },
      zero_qids_json: ['q2'], created_at: NOW - 3600 * 1000, updated_at: NOW, text_override: '',
    }),
    getUserById: async () => ({ id: 'u1', login: 'TEST-10', role: 'child', created_at: NOW - 86400 * 1000 }),
    levels: async () => [{ id: 'lvl-p2-vanka', rule_code: 'P2', rule_kid: 'Скажи суть своими словами', text_id: 'text-vanka', text_title: 'Ванька', text_author: 'Чехов', questions: QUESTIONS }],
    getAnswers: async () => ([
      { qid: 'q1', text_raw: 'Это письмо о мальчике, который просит деда забрать его из города.', typed_chars: 68, pasted: false, t_answer: 42000 },
      { qid: 'q2', text_raw: '«Сделайте милость, Ваньку Жукова удочерите» — дословно скопировано', typed_chars: 50, pasted: true, t_answer: 15000 },
      { qid: 'q3', text_raw: 'У меня был похожий случай на даче.', typed_chars: 36, pasted: false, t_answer: 60000 },
    ]),
    getReflectionAnswers: async () => ([
      { qid: 'r1', question_text: 'Какое слово важнее всего?', answer_text: 'Слово «забери» — просьба о спасении.', mark: 2, explanation: 'По теме, осмысленно' },
      { qid: 'r2', question_text: 'Где ты встречал похожее?', answer_text: 'Когда я скучал по бабушке.', mark: 1, explanation: 'По теме, бедно' },
      { qid: 'r3', question_text: 'Согласен ли ты с автором?', answer_text: 'Да, потому что Ванька грустит.', mark: 2, explanation: 'Позиция есть' },
    ]),
    listEvents: async () => ([
      { type: 'read_start', t: NOW - 3500 * 1000, payload_json: {} },
      { type: 'anticheat_flag', t: NOW - 3400 * 1000, payload_json: { reason: 'suspicious', qids: ['q2'] } },
      { type: 'socratic_ask', t: NOW - 1800 * 1000, payload_json: { qid: 'q2', step: 1 } },
      { type: 'approve', t: NOW - 60 * 1000, payload_json: { coupon: 'ABC12345' } },
    ]),
    listLlmReviewsByAttempt: async () => ([
      { scope: 'pack', qid: 'pack', iteration: 0, response_json: { text: PACK_TEXT }, tokens_in: 900, tokens_out: 120, cost_rub: 0.204, created_at: NOW - 2000 * 1000 },
      { scope: 'socratic', qid: 'q2', iteration: 11, response_json: { text: 'А что чувствовал Ванька?' }, tokens_in: 500, tokens_out: 30, cost_rub: 0.106, created_at: NOW - 1900 * 1000 },
      { scope: 'reflection', qid: 'pack', iteration: 51, response_json: { text: '{}' }, tokens_in: 400, tokens_out: 40, cost_rub: 0.088, created_at: NOW - 300 * 1000 },
    ]),
    getSocraticTurns: async (_a, qid) => qid === 'q2'
      ? [{ qid: 'q2', step: 1, question_text: 'А что чувствовал Ванька, когда писал?', child_answer: 'Он скучал и боялся.' }]
      : [],
    getCouponByAttempt: async () => ({ code: 'ABC12345', amount: 25, status: 'active', created_at: NOW - 60 * 1000 }),
    // economy
    listAllLlmReviews: async () => ([
      { attempt_id: 'a1', user_id: 'u1', scope: 'pack', qid: 'pack', tokens_in: 900, tokens_out: 120, cost_rub: 0.2, created_at: NOW },
      { attempt_id: 'a1', user_id: 'u1', scope: 'socratic', qid: 'q2', tokens_in: 100, tokens_out: 20, cost_rub: 0.1, created_at: NOW },
      { attempt_id: 'a9', user_id: 'u2', scope: 'pack', qid: 'pack', tokens_in: 800, tokens_out: 100, cost_rub: 0.18, created_at: DAY(1) },
    ]),
    // users
    listUsers: async () => ([{ id: 'u1', login: 'TEST-10', role: 'child', created_at: NOW }, { id: 'admin-root', login: 'admin', role: 'admin', created_at: NOW }]),
    listAttemptsAdmin: async () => ([{ id: 'a1', level_id: 'lvl-p2-vanka', status: 'approved', stake: 25, pass_number: 1, created_at: NOW, updated_at: NOW }]),
    // waitlist
    listWaitlist: async () => ([{ ...wState }]),
    getWaitlist: async () => ({ ...wState }),
    setWaitlistStatus: async (id, status) => { wState.status = status; calls.waitlistStatus.push([id, status]); },
    createInvite: async (code, limit) => calls.invites.push([code, limit]),
    ...over,
  };
  return { repo, calls };
}

function teardown(real) { admin._setRepo(real); }
const REAL_REPO = require('../lib/repo');

// (г) не-admin → 403 на admin/* — без мока repo (403 доходит раньше любых запросов).
test('admin/*: токен ребёнка → 403', async () => {
  const jwt = require('../lib/jwt');
  const token = jwt.sign({ id: 'u1', role: 'child' }, 3600);
  const res = await handler({
    httpMethod: 'GET',
    queryStringParameters: { a: 'admin/economy' },
    headers: { 'x-auth-token': token },
  });
  assert.strictEqual(res.statusCode, 403);
});

test('без токена → 401', async () => {
  const res = await handler({ httpMethod: 'GET', queryStringParameters: { a: 'admin/report', attempt_id: 'a1' }, headers: {} });
  assert.strictEqual(res.statusCode, 401);
});

// (а) полный отчёт: вопросы, дословные ответы, marks, сократ-шаги, экономика-сумма.
test('admin/report: полный отчёт по попытке', async () => {
  const { repo } = makeRepo();
  admin._setRepo(repo);
  try {
    const res = await admin.report({ attempt_id: 'a1' });
    assert.strictEqual(res.status, undefined);
    const r = res.body.report;
    assert.strictEqual(r.user.login, 'TEST-10');
    assert.strictEqual(r.attempt.stake, 25);
    assert.strictEqual(r.level.rule_kid, 'Скажи суть своими словами');
    assert.strictEqual(r.questions.length, 3);
    // дословные ответы с метаданными античита
    const q1 = r.questions.find(q => q.qid === 'q1');
    assert.match(q1.answer.text_raw, /Это письмо о мальчике/);
    assert.strictEqual(q1.answer.keydown, 68);
    assert.strictEqual(q1.answer.pasted, false);
    const q2 = r.questions.find(q => q.qid === 'q2');
    assert.strictEqual(q2.zero, true);
    assert.strictEqual(q2.answer.pasted, true);
    // marks + criteria
    assert.deepStrictEqual({ mark: q1.mark.mark, total: q1.mark.total }, { mark: 2, total: 10 });
    assert.deepStrictEqual(q1.criteria.map(c => c.value), [2, 2, 2, 2, 2]);
    assert.strictEqual(q2.mark.mark, 0);
    assert.match(q2.mark.explanation, /цитата/);
    // сократ по q2 — диалогом
    assert.strictEqual(q2.socratic.length, 1);
    assert.match(q2.socratic[0].question, /Ванька/);
    assert.strictEqual(q2.socratic[0].answer, 'Он скучал и боялся.');
    // рефлексия дословно
    assert.strictEqual(r.reflection.length, 3);
    assert.match(r.reflection[0].answer, /забери/);
    assert.strictEqual(r.reflection[0].mark, 2);
    // события таймлайном
    assert.strictEqual(r.events.length, 4);
    assert.ok(r.events[0].t <= r.events[1].t, 'события отсортированы по времени');
    // экономика попытки
    assert.strictEqual(r.llm.calls, 3);
    assert.strictEqual(r.llm.tokens_in, 1800);
    assert.strictEqual(r.llm.tokens_out, 190);
    assert.strictEqual(r.llm.rub, 0.4);
    // купон
    assert.strictEqual(r.coupon.code, 'ABC12345');
  } finally { teardown(REAL_REPO); }
});

// (б) HTML-экспорт: ответы, оценки, сумма руб — и Content-Type text/html.
test('export: автономный HTML с ответами, оценками и суммой', async () => {
  const { repo } = makeRepo();
  admin._setRepo(repo);
  try {
    const bundle = await admin.reportBundle('a1');
    const h = exporter.html(bundle);
    assert.match(h, /<!DOCTYPE html>/);
    assert.match(h, /Это письмо о мальчике/);
    assert.match(h, /Сплошная цитата/);
    assert.match(h, /оценка 2 \/ 10/);
    assert.match(h, /0\.40 ₽/);
    assert.match(h, /вопрос ЛЛМ/i);
    assert.match(h, /Рефлексия/);
    assert.match(h, /А что чувствовал Ванька/);
    assert.doesNotMatch(h, /<script/, 'без скриптов');
    assert.doesNotMatch(h, /src="http/, 'без внешних ресурсов');
    // маршрут отдаёт text/html и уважает права: чужой attempt → 403
    const res = await exporter.route({ attempt_id: 'a1' }, { user: { id: 'u2', role: 'child' } });
    assert.strictEqual(res.status, 403);
    const resAdmin = await exporter.route({ attempt_id: 'a1' }, { user: ADMIN });
    assert.strictEqual(resAdmin.status, 200);
    assert.match(resAdmin.headers['Content-Type'], /text\/html/);
    assert.match(resAdmin.body, /Это письмо о мальчике/);
    const resOwner = await exporter.route({ attempt_id: 'a1' }, { user: CHILD });
    assert.strictEqual(resOwner.status, 200);
  } finally { teardown(REAL_REPO); }
});

// (в) economy агрегирует по дням, по пользователям, считает суммы.
test('admin/economy: агрегация по дням', async () => {
  const { repo } = makeRepo();
  admin._setRepo(repo);
  try {
    const res = await admin.economy();
    const b = res.body;
    assert.strictEqual(b.days.length, 2);
    const today = b.days.find(d => d.date === new Date(NOW).toISOString().slice(0, 10));
    const yesterday = b.days.find(d => d.date === new Date(DAY(1)).toISOString().slice(0, 10));
    assert.strictEqual(today.calls, 2);
    assert.strictEqual(today.rub, 0.3);
    assert.strictEqual(yesterday.calls, 1);
    assert.strictEqual(b.total.calls, 3);
    assert.strictEqual(b.total.tokens_in, 1800);
    assert.strictEqual(b.by_user.length, 2);
    const u1 = b.by_user.find(u => u.user_id === 'u1');
    assert.strictEqual(u1.rub, 0.3);
    // алёрт: сегодня 0.3 ₽ < 300 → false; проверяем и true-ветку
    assert.strictEqual(b.alert, false);
    const big = makeRepo({ listAllLlmReviews: async () => [{ attempt_id: 'a1', user_id: 'u1', tokens_in: 1, tokens_out: 1, cost_rub: 301, created_at: NOW }] });
    admin._setRepo(big.repo);
    const res2 = await admin.economy();
    assert.strictEqual(res2.body.alert, true);
  } finally { teardown(REAL_REPO); }
});

// (д) waitlist-approve: invite с лимитом 1 + заявка → approved.
test('admin/waitlist-approve: создаёт invite и одобряет заявку', async () => {
  const { repo, calls } = makeRepo();
  admin._setRepo(repo);
  try {
    const res = await admin.waitlistApprove({ id: 'w1' });
    assert.strictEqual(res.body.ok, true);
    assert.match(res.body.invite.code, /^WAIT-[A-Z2-9]{6}$/);
    assert.strictEqual(calls.invites.length, 1);
    assert.strictEqual(calls.invites[0][1], 1, 'лимит инвайта — 1');
    assert.deepStrictEqual(calls.waitlistStatus, [['w1', 'approved']]);
    // повторный апрув → 409
    const again = await admin.waitlistApprove({ id: 'w1' });
    assert.strictEqual(again.status, 409);
    // нет такой заявки → 404
    admin._setRepo(makeRepo({ getWaitlist: async () => null }).repo);
    const missing = await admin.waitlistApprove({ id: 'nope' });
    assert.strictEqual(missing.status, 404);
  } finally { teardown(REAL_REPO); }
});

// users-список: пользователи с попытками.
test('admin/users: список с попытками', async () => {
  const { repo } = makeRepo();
  admin._setRepo(repo);
  try {
    const res = await admin.users();
    const test10 = res.body.users.find(u => u.login === 'TEST-10');
    assert.strictEqual(test10.attempts.length, 1);
    assert.strictEqual(test10.attempts[0].stake, 25);
    assert.strictEqual(test10.attempts[0].status, 'approved');
  } finally { teardown(REAL_REPO); }
});
