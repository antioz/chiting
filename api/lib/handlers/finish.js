// Finish-контур (task-8): рефлексия после пакета → апрув → купон.
// reflect: один вызов ЛЛМ (scope='reflection'; PK/iteration назначает repo —
// append-only, следующий свободный индекс), запись reflection_answers (REPLACE — переписывание нулевых).
// mark=0 в любом ответе → {retry_qids} без смены статуса. approve: все marks != 0 →
// купон (amount=ставка), status='approved', событие approve; повторный approve идемпотентен.
const crypto = require('crypto');
const C = require('../config');
const prompts = require('../prompts');
const rubric = require('../rubric');
const anticheat = require('../anticheat');
let llm = require('../llm');       // seam для тестов: setLlm(mockFn)
const llmShared = require('../llm'); // каноничные тексты degraded (вне seam)
let repo = require('../repo');     // seam для тестов: _setRepo(mock)

// 8-значный код без неоднозначных символов (0/O, 1/I/L исключены) — читается с экрана/бумаги.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function couponCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

// answers — массив ровно из REFLECTION_QUESTIONS.length непустых строк (по порядку вопросов).
async function reflect({ user, id, answers }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (attempt.status !== 'reflection') return { status: 409, body: { error: 'not_reflection' } };
  const qs = prompts.REFLECTION_QUESTIONS;
  if (!Array.isArray(answers) || answers.length !== qs.length || answers.some(a => typeof a !== 'string' || !a.trim())) {
    return { status: 400, body: { error: 'validation' } };
  }
  if ((await repo.countLlmReviews(id)) >= C.llmCallsLimit) {
    return { status: 429, body: { error: 'llm_limit' } };
  }

  const pairs = qs.map((q, i) => ({ qid: q.qid, text: q.text, answer: answers[i].trim() }));
  const { system, user: userPrompt } = prompts.reflection({ questions: qs, answers: pairs.map(p => ({ text: p.answer })) });
  const tStart = Date.now();
  const out = await llm.complete(system, userPrompt);
  await repo.addLlmReview({
    attempt_id: id, scope: 'reflection', qid: 'pack', rubric_version: C.rubricVersion,
    request_json: { system, user: userPrompt }, response_json: { text: out.text },
    tokens_in: out.tokensIn, tokens_out: out.tokensOut, cost_rub: out.costRub, t_spent: tStart,
  });

  const results = rubric.parseLlmReflectionResults(out.text);
  // Отказ модели / непарс — НЕ 502: все вопросы mark 0 с нейтральным каноничным
  // текстом + retry_qids. Explanation — только заготовленный текст (без эха
  // грубостей ребёнка и без текста самой модели).
  const degraded = !results;

  // Вопрос, пропущенный ЛЛМ, — ноль (как в review.pack); при degraded — ноль у всех.
  // Грубость в ответе ребёнка — детерминированный 0 с каноничным текстом (task-17),
  // даже если модель оценила иначе (или отказалась — тогда degraded выше).
  const marks = {};
  const retryQids = [];
  for (const p of pairs) {
    const r = results ? results.find(x => x.qid === p.qid) : null;
    const profane = anticheat.hasProfanity(p.answer);
    const mark = profane ? 0 : (r ? r.mark : 0);
    const explanation = profane ? llmShared.DEGRADED_REFLECTION_EXPLANATION : (r ? r.explanation : llmShared.DEGRADED_REFLECTION_EXPLANATION);
    marks[p.qid] = { mark, explanation };
    await repo.addReflectionAnswer(id, { qid: p.qid, question_text: p.text, answer_text: p.answer, mark, explanation });
    if (mark === 0) retryQids.push(p.qid);
  }
  const eventPayload = { marks, retry_qids: retryQids };
  if (degraded) eventPayload.degraded = true;
  await repo.addEvent(user.id, id, 'reflect', eventPayload, Date.now());
  const body = { marks };
  if (retryQids.length) body.retry_qids = retryQids;
  if (degraded) body.degraded = true;
  return { body };
}

async function approve({ user, id }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  // Идемпотентность: купон уже есть (повторный клик/ретрай) — возвращаем существующий,
  // даже если статус уже 'approved'.
  const existing = await repo.getCouponByAttempt(id);
  if (existing) return { body: { coupon: { code: existing.code, amount: Number(existing.amount) } } };
  if (attempt.status !== 'reflection') return { status: 409, body: { error: 'not_reflection' } };
  // Апрув возможен только после завершённой рефлексии: записи есть и ни одного нуля.
  const ra = await repo.getReflectionAnswers(id);
  if (!ra.length || ra.some(r => Number(r.mark) === 0)) {
    return { status: 409, body: { error: 'reflection_incomplete' } };
  }
  const code = couponCode();
  // createCoupon — атомарный insert-if-not-exists по attempt_id: при гонке двух
  // approve второй INSERT не вставит дубль. После него единый путь возврата:
  // перечитываем купон по attempt (победившая запись у обоих вызовов одна).
  await repo.createCoupon({
    id: crypto.randomUUID(), user_id: user.id, attempt_id: id,
    amount: Number(attempt.stake), status: 'active', code, created_at: Date.now(),
  });
  await repo.setAttemptStatus(id, 'approved', Date.now());
  await repo.addEvent(user.id, id, 'approve', { coupon: code }, Date.now());
  const coupon = await repo.getCouponByAttempt(id);
  return { body: { coupon: { code: coupon.code, amount: Number(coupon.amount) } } };
}

// Кабинет ребёнка: свои купоны + свои попытки (сводно для админки/личного кабинета).
async function coupons({ user }) {
  const [c, a] = await Promise.all([repo.listCoupons(user.id), repo.listUserAttempts(user.id)]);
  return { body: { coupons: c, attempts: a } };
}

function _setRepo(r) { repo = r; }
function setLlm(fn) { llm = { complete: fn }; }

module.exports = { reflect, approve, coupons, couponCode, _setRepo, setLlm };
