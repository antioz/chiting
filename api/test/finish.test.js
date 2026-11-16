// Интеграционный тест finish-контура (task-8): reflect / approve / coupons.
// Мок repo (_setRepo) и мок LLM (setLlm) — реальные YDB и YandexGPT не трогаем.
const test = require('node:test');
const assert = require('node:assert');
const finish = require('../lib/handlers/finish');
const prompts = require('../lib/prompts');

const USER = { id: 'u1', role: 'child' };
const OTHER = { id: 'u2', role: 'child' };
const RQ = prompts.REFLECTION_QUESTIONS;

const LLM_OK = JSON.stringify({ results: RQ.map((q, i) => ({ qid: q.qid, mark: 2, explanation: 'Полноценный ответ по теме' })) });
const LLM_ONE_ZERO = JSON.stringify({ results: [
  { qid: RQ[0].qid, mark: 2, explanation: 'хорошо' },
  { qid: RQ[1].qid, mark: 0, explanation: 'Мусор, не по теме' },
  { qid: RQ[2].qid, mark: 1, explanation: 'по теме, но бедно' },
] });

function makeState(over = {}) {
  const state = {
    attempt: { id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', stake: 25, status: 'reflection', iterations: 0 },
    reflection: [], // reflection_answers
    coupons: [],
    calls: { reflections: [], reviews: [], statuses: [], events: [], coupons: [] },
  };
  return Object.assign(state, over);
}
function makeRepo(state) {
  return {
    getAttempt: async () => state.attempt,
    countLlmReviews: async () => 0,
    addLlmReview: async (r) => state.calls.reviews.push(r),
    addReflectionAnswer: async (attemptId, q) => state.calls.reflections.push([attemptId, q]),
    getReflectionAnswers: async () => state.reflection,
    createCoupon: async (c) => { state.calls.coupons.push(c); state.coupons.push(c); },
    getCouponByAttempt: async (attemptId) => state.coupons.find(c => c.attempt_id === attemptId) || null,
    listCoupons: async (uid) => state.coupons.filter(c => c.user_id === uid).map(c => ({ code: c.code, amount: c.amount, status: c.status, created_at: c.created_at })),
    listUserAttempts: async (uid) => (state.attempt.user_id === uid ? [{ id: state.attempt.id, level_id: state.attempt.level_id, status: state.attempt.status, updated_at: state.attempt.updated_at }] : []),
    setAttemptStatus: async (id, s, now) => { state.calls.statuses.push([id, s]); state.attempt.status = s; },
    addEvent: async (...args) => state.calls.events.push(args),
  };
}
let llmCalls, lastPrompt;
function mockLlm(text) {
  llmCalls = 0;
  return async (system, user) => { llmCalls++; lastPrompt = user; return { text: typeof text === 'function' ? text(llmCalls) : text, tokensIn: 80, tokensOut: 40, costRub: 0.024 }; };
}
const ANSWERS = ['Слово «мольба» — оно главное, потому что весь рассказ о просьбе', 'У меня был похожий случай с другом: я боялся признаться в ошибке, как герой; похоже тем, что страшно потерять друга', 'Согласен: автор прав, потому что в тексте герой меняется после разговора'];
const ZERO_ANSWERS = ['Слово «мольба»', 'ывапролдж', 'Согласен'];

test('reflect: happy path → marks, reflection_answers записаны, llm_reviews scope=reflection', async () => {
  const state = makeState();
  finish._setRepo(makeRepo(state));
  finish.setLlm(mockLlm(LLM_OK));
  const res = await finish.reflect({ user: USER, id: 'a1', answers: ANSWERS });
  assert.strictEqual(res.status || 200, 200);
  assert.deepStrictEqual(Object.keys(res.body.marks).sort(), RQ.map(q => q.qid).sort());
  assert.strictEqual(state.calls.reflections.length, RQ.length);
  const [attemptId, rec] = state.calls.reflections[0];
  assert.strictEqual(attemptId, 'a1');
  assert.strictEqual(rec.qid, RQ[0].qid);
  assert.ok(rec.question_text, 'текст вопроса сохранён');
  assert.strictEqual(rec.answer_text, ANSWERS[0]);
  assert.strictEqual(rec.mark, 2);
  assert.ok(rec.explanation);
  assert.strictEqual(state.calls.reviews.length, 1);
  assert.strictEqual(state.calls.reviews[0].scope, 'reflection');
  assert.ok(!('iteration' in state.calls.reviews[0]), 'iteration назначает repo (append-only), handler не передаёт');
  assert.strictEqual(state.calls.reviews[0].tokens_in, 80);
  assert.strictEqual(state.calls.reviews[0].cost_rub, 0.024);
  assert.match(lastPrompt, /мольба/, 'ответы ребёнка доехали до ЛЛМ');
});

test('reflect: mark=0 → retry_qids, статус attempt не меняется', async () => {
  const state = makeState();
  finish._setRepo(makeRepo(state));
  finish.setLlm(mockLlm(LLM_ONE_ZERO));
  const res = await finish.reflect({ user: USER, id: 'a1', answers: ZERO_ANSWERS });
  assert.deepStrictEqual(res.body.retry_qids, [RQ[1].qid]);
  assert.strictEqual(res.body.marks[RQ[1].qid].mark, 0);
  assert.strictEqual(state.calls.statuses.length, 0, 'статус не меняется');
  assert.strictEqual(state.calls.reflections.length, RQ.length, 'все ответы перезаписаны');
  // повторный reflect с исправленным ответом (REPLACE) → без retry_qids
  finish.setLlm(mockLlm(LLM_OK));
  const res2 = await finish.reflect({ user: USER, id: 'a1', answers: ANSWERS });
  assert.strictEqual(res2.body.retry_qids, undefined);
});

test('reflect: не reflection-статус → 409; чужой attempt → 404; пустые ответы → 400', async () => {
  const s1 = makeState({ attempt: { id: 'a1', user_id: 'u1', stake: 25, status: 'answering' } });
  finish._setRepo(makeRepo(s1));
  assert.strictEqual((await finish.reflect({ user: USER, id: 'a1', answers: ANSWERS })).status, 409);
  const s2 = makeState({ attempt: { id: 'a1', user_id: 'u2', stake: 25, status: 'reflection' } });
  finish._setRepo(makeRepo(s2));
  assert.strictEqual((await finish.reflect({ user: USER, id: 'a1', answers: ANSWERS })).status, 404);
  const s3 = makeState();
  finish._setRepo(makeRepo(s3));
  assert.strictEqual((await finish.reflect({ user: USER, id: 'a1', answers: [] })).status, 400);
  assert.strictEqual((await finish.reflect({ user: USER, id: 'a1', answers: ['', 'б', 'в'] })).status, 400);
  assert.strictEqual((await finish.reflect({ user: USER, id: 'a1', answers: ['а', 'б'] })).status, 400);
});

test('reflect: не-JSON от ЛЛМ → 502 llm_parse, записей reflection_answers нет', async () => {
  const state = makeState();
  finish._setRepo(makeRepo(state));
  finish.setLlm(mockLlm('Просто текст'));
  const res = await finish.reflect({ user: USER, id: 'a1', answers: ANSWERS });
  assert.strictEqual(res.status, 502);
  assert.deepStrictEqual(res.body, { error: 'llm_parse' });
  assert.strictEqual(state.calls.reflections.length, 0);
  assert.strictEqual(state.calls.statuses.length, 0);
});

test('approve: без завершённой рефлексии → 409', async () => {
  // статус не reflection
  const s1 = makeState({ attempt: { id: 'a1', user_id: 'u1', stake: 25, status: 'socratic' } });
  finish._setRepo(makeRepo(s1));
  assert.strictEqual((await finish.approve({ user: USER, id: 'a1' })).status, 409);
  // reflection, но есть ноль
  const s2 = makeState({ reflection: RQ.map((q, i) => ({ qid: q.qid, mark: i === 1 ? 0 : 2 })) });
  finish._setRepo(makeRepo(s2));
  assert.strictEqual((await finish.approve({ user: USER, id: 'a1' })).status, 409);
  // reflection, но рефлексии вообще не было
  const s3 = makeState({ reflection: [] });
  finish._setRepo(makeRepo(s3));
  assert.strictEqual((await finish.approve({ user: USER, id: 'a1' })).status, 409);
});

test('approve: happy path → купон с amount=ставкой, повторный approve idempotent (тот же code)', async () => {
  const state = makeState({ reflection: RQ.map(q => ({ qid: q.qid, mark: 2 })) });
  finish._setRepo(makeRepo(state));
  const res = await finish.approve({ user: USER, id: 'a1' });
  assert.strictEqual(res.body.coupon.amount, 25);
  assert.match(res.body.coupon.code, /^[A-Z2-9]{8}$/);
  assert.strictEqual(state.calls.statuses.length, 1);
  assert.strictEqual(state.calls.statuses[0][1], 'approved');
  assert.strictEqual(state.calls.events.filter(e => e[2] === 'approve').length, 1);
  assert.strictEqual(state.coupons[0].status, 'active');
  assert.strictEqual(state.coupons[0].amount, 25);
  const res2 = await finish.approve({ user: USER, id: 'a1' });
  assert.strictEqual(res2.body.coupon.code, res.body.coupon.code, 'тот же код');
  assert.strictEqual(state.coupons.length, 1, 'второй купон не создан');
  assert.strictEqual(state.calls.events.filter(e => e[2] === 'approve').length, 1);
});

test('approve: одновременные approve (гонка без перечитывания) → ровно 1 купон, оба вызова — одинаковый code', async () => {
  const state = makeState({ reflection: RQ.map(q => ({ qid: q.qid, mark: 2 })) });
  // Репо с INSERT-гардом: createCoupon — insert-if-not-exists по attempt_id.
  // Гонка имитируется тем, что getCouponByAttempt в пре-чеке обоих вызовов
  // возвращает null (нет перечитывания между ними), а гард в createCoupon
  // не даёт второму вызову вставить дубль; пост-чтение у обоих — запись победителя.
  let preCheckReads = 0;
  const repo = Object.assign(makeRepo(state), {
    getCouponByAttempt: async (attemptId) => {
      preCheckReads++;
      if (preCheckReads <= 2) return null; // оба пре-чека «не видят» купон
      return state.coupons.find(c => c.attempt_id === attemptId) || null;
    },
    createCoupon: async (c) => {
      state.calls.coupons.push(c);
      if (!state.coupons.some(x => x.attempt_id === c.attempt_id)) state.coupons.push(c); // INSERT-гард
    },
    setAttemptStatus: async (id, s, now) => { state.calls.statuses.push([id, s]); }, // статус не меняем: второй вызов как при гонке
  });
  finish._setRepo(repo);
  const [r1, r2] = await Promise.all([
    finish.approve({ user: USER, id: 'a1' }),
    finish.approve({ user: USER, id: 'a1' }),
  ]);
  assert.strictEqual(state.coupons.length, 1, 'второй INSERT не создал дубль');
  assert.strictEqual(state.calls.coupons.length, 2, 'оба вызова пытались создать (вторая — no-op)');
  assert.strictEqual(r1.body.coupon.code, r2.body.coupon.code, 'оба вызова вернули одинаковый code');
  assert.strictEqual(r1.body.coupon.amount, 25);
  assert.strictEqual(r2.body.coupon.amount, 25);
});

test('approve: чужой attempt → 404', async () => {
  const state = makeState({ attempt: { id: 'a1', user_id: 'u2', stake: 25, status: 'reflection' } });
  finish._setRepo(makeRepo(state));
  assert.strictEqual((await finish.approve({ user: USER, id: 'a1' })).status, 404);
});

test('coupons: только свои купоны и попытки', async () => {
  const state = makeState({
    reflection: RQ.map(q => ({ qid: q.qid, mark: 2 })),
    coupons: [
      { id: 'c1', user_id: 'u1', attempt_id: 'a1', amount: 25, status: 'active', code: 'ABC12345', created_at: 1 },
      { id: 'c2', user_id: 'u2', attempt_id: 'a9', amount: 99, status: 'active', code: 'ZZZ99999', created_at: 2 },
    ],
  });
  finish._setRepo(makeRepo(state));
  const mine = await finish.coupons({ user: USER });
  assert.strictEqual(mine.body.coupons.length, 1);
  assert.strictEqual(mine.body.coupons[0].code, 'ABC12345');
  assert.strictEqual(mine.body.coupons[0].amount, 25);
  assert.strictEqual(mine.body.attempts.length, 1);
  assert.strictEqual(mine.body.attempts[0].id, 'a1');
  const other = await finish.coupons({ user: OTHER });
  assert.strictEqual(other.body.attempts.length, 0);
  assert.strictEqual(other.body.coupons.length, 1);
  assert.strictEqual(other.body.coupons[0].code, 'ZZZ99999');
});
