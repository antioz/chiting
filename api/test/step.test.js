// Пошаговый флоу (task-14): review-question — один вопрос, один вызов ЛЛМ, marks_json
// накапливается; mark=0 → событие q_zero, attempts_on_qid = подряд идущие нули;
// все in_scope qid с mark>=1 → status='reflection'; сократ разрешён в answering по нулевому qid;
// лимит llmCallsLimit=16 → 429. Моки repo/LLM по паттерну review.test.js.
const test = require('node:test');
const assert = require('node:assert');
const review = require('../lib/handlers/review');
const socratic = require('../lib/handlers/socratic');

const USER = { id: 'u1', role: 'child' };
const QUESTIONS = [
  { qid: 'q1', type: 'T2', text: 'Сожми текст до одного предложения' },
  { qid: 'q2', type: 'T1', text: 'Передай суть мольбы своими словами' },
  { qid: 'q3', type: 'T3', text: 'Приведи свой пример' },
];
const CRIT_2 = [2, 2, 2, 2, 2];
const CRIT_1 = [1, 2, 1, 2, 1]; // total 7 → mark 1... нет: 7 → mark 2. Используем total 4-6 для mark 1
const CRIT_MARK1 = [1, 1, 1, 1, 1]; // total 5 → mark 1
const CRIT_0 = [0, 0, 0, 0, 0];

const LLM_MARK2 = JSON.stringify({ criteria: CRIT_2, explanation: 'Полный точный ответ своими словами' });
const LLM_MARK1 = JSON.stringify({ criteria: CRIT_MARK1, explanation: 'По теме, но бедно' });
const LLM_MARK0 = JSON.stringify({ criteria: CRIT_0, explanation: 'Сплошная цитата, смысла нет' });

// События храним в массиве (как боевой repo: append-only, порядок = порядок добавления).
function makeRepo(over = {}) {
  const calls = { reviews: [], updates: [], events: [], turns: [] };
  const state = {
    attempt: {
      id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'answering', iterations: 0,
      marks_json: '{}',
    },
    llmCount: 0,
    events: [],
  };
  const repo = {
    getAttempt: async () => state.attempt,
    countLlmReviews: async () => state.llmCount,
    levels: async () => [{ id: 'lvl-p2-vanka', text_id: 'text-vanka', rule_kid: 'Скажи суть', questions: QUESTIONS }],
    getText: async () => ({ id: 'text-vanka', body_json: ['Абзац один.', 'Абзац два.'] }),
    getAnswers: async () => [{ qid: 'q1', text_raw: 'ответ на q1' }, { qid: 'q2', text_raw: 'ответ на q2' }, { qid: 'q3', text_raw: 'ответ на q3' }],
    answerBases: async () => [{ level_qid: 'lvl-p2-vanka:q2', etalon: 'Ванька просит деда забрать его в деревню.', clusters: [] }],
    addLlmReview: async (r) => { state.llmCount++; calls.reviews.push([r]); },
    updateAttemptMarks: async (id, r) => { state.attempt.marks_json = JSON.stringify(r.marks_json); state.attempt.status = r.status; calls.updates.push([id, r]); },
    addEvent: async (uid, aid, type, payload) => { state.events.push({ type, payload }); calls.events.push([uid, aid, type, payload]); },
    listEvents: async () => state.events,
    countConsecutiveQZero: async (aid, qid) => {
      let n = 0;
      for (let i = state.events.length - 1; i >= 0; i--) {
        const e = state.events[i];
        if (e.type === 'q_zero' && e.payload.qid === qid) n++;
        else if (e.type === 'q_review' && e.payload.qid === qid && Number(e.payload.mark) === 0) { /* часть серии */ }
        else break;
      }
      return n;
    },
    countSocraticTurns: async () => 0,
    getSocraticTurns: async () => [],
    getLastQuestionReview: async () => null,
    getLastLlmReview: async () => null,
    addSocraticTurn: async (...args) => calls.turns.push(args),
    ...over,
  };
  return { repo, calls, state };
}
let llmCalls;
function mockLlm(text) {
  llmCalls = 0;
  return async () => {
    llmCalls++;
    return { text: typeof text === 'function' ? text(llmCalls) : text, tokensIn: 100, tokensOut: 50, costRub: 0.03 };
  };
}
const realRepo = require('../lib/repo');
const realLlm = require('../lib/llm');
function teardown() {
  review._setRepo(realRepo); review.setLlm(realLlm.complete);
  socratic._setRepo(realRepo); socratic.setLlm(realLlm.complete);
}

// (а) happy path: mark 2 по q1, marks_json накоплен, статус answering (q2, q3 ещё без оценок)
test('review-question: mark 2 → {qid, mark:2, attempts_on_qid:0}, marks_json накоплен, статус answering', async () => {
  const { repo, calls, state } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(LLM_MARK2));
  const res = await review.question({ user: USER, id: 'a1', qid: 'q1' });
  assert.strictEqual(res.status, undefined);
  assert.strictEqual(res.body.qid, 'q1');
  assert.strictEqual(res.body.mark, 2);
  assert.strictEqual(res.body.attempts_on_qid, 0);
  assert.match(res.body.explanation, /своими словами/);
  assert.strictEqual(llmCalls, 1, 'один вызов ЛЛМ');
  assert.strictEqual(calls.reviews.length, 1);
  assert.strictEqual(calls.reviews[0][0].scope, 'question');
  assert.strictEqual(calls.reviews[0][0].qid, 'q1');
  assert.strictEqual(calls.reviews[0][0].final_mark, 2);
  const marks = JSON.parse(state.attempt.marks_json);
  assert.strictEqual(marks.q1.mark, 2);
  assert.deepStrictEqual(Object.keys(marks), ['q1'], 'только оценённый qid');
  assert.strictEqual(state.attempt.status, 'answering', 'не все qid оценены — статус не меняется');
  teardown();
});

// (б) mark 0 → attempts_on_qid 1, событие q_zero, статус answering
test('review-question: mark 0 → attempts_on_qid 1, событие q_zero, статус answering', async () => {
  const { repo, calls } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(LLM_MARK0));
  const res = await review.question({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.body.mark, 0);
  assert.strictEqual(res.body.attempts_on_qid, 1);
  const zeros = calls.events.filter(e => e[2] === 'q_zero');
  assert.strictEqual(zeros.length, 1);
  assert.strictEqual(zeros[0][3].qid, 'q2');
  assert.strictEqual(calls.updates[0][1].status, 'answering');
  teardown();
});

// (в) второй подряд mark 0 → attempts_on_qid 2 (считаем по событиям q_zero)
test('review-question: второй подряд mark 0 → attempts_on_qid 2', async () => {
  const { repo, state } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(LLM_MARK0));
  const r1 = await review.question({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(r1.body.attempts_on_qid, 1);
  // Второй вызов: репо перечитает attempt (с marks_json) — эмулируем, как в боевом
  state.attempt.marks_json = JSON.stringify({ q2: { mark: 0, total: 0, explanation: 'x' } });
  const r2 = await review.question({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(r2.body.mark, 0);
  assert.strictEqual(r2.body.attempts_on_qid, 2, 'два подряд идущих q_zero по q2');
  teardown();
});

// нулевая серия прерывается mark>=1: после mark 2 attempts_on_qid снова 0
test('review-question: после mark 0 → mark 2 серия нулей прерывается (attempts_on_qid 0)', async () => {
  const { repo, state } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(n => (n === 1 ? LLM_MARK0 : LLM_MARK2)));
  await review.question({ user: USER, id: 'a1', qid: 'q2' });
  state.attempt.marks_json = JSON.stringify({ q2: { mark: 0, total: 0, explanation: 'x' } });
  const r2 = await review.question({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(r2.body.mark, 2);
  assert.strictEqual(r2.body.attempts_on_qid, 0);
  teardown();
});

// (г) сократ разрешён в answering при нулевом qid (пошаговый флоу, мок LLM)
test('socratic-ask: разрешён в status answering при mark 0 по qid (пошаговый флоу)', async () => {
  const { repo, calls } = makeRepo({
    getAttempt: async () => ({
      id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'answering', iterations: 0,
      marks_json: JSON.stringify({ q2: { mark: 0, total: 0, explanation: 'цитата' } }),
    }),
  });
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm('А почему ты так решил?'));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, undefined);
  assert.strictEqual(res.body.question, 'А почему ты так решил?');
  assert.strictEqual(calls.turns.length, 1);
  teardown();
});

test('socratic-ask: в answering по qid с mark>=1 → 409 not_zero_qid', async () => {
  const { repo } = makeRepo({
    getAttempt: async () => ({
      id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'answering', iterations: 0,
      marks_json: JSON.stringify({ q2: { mark: 2, total: 10, explanation: 'ок' } }),
    }),
  });
  socratic._setRepo(repo);
  let called = 0;
  socratic.setLlm(async () => { called++; return { text: 'вопрос?' }; });
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error, 'not_zero_qid');
  assert.strictEqual(called, 0);
  teardown();
});

test('socratic-answer: разрешён в answering по нулевому qid', async () => {
  const { repo, calls } = makeRepo({
    getAttempt: async () => ({
      id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'answering', iterations: 0,
      marks_json: JSON.stringify({ q2: { mark: 0, total: 0, explanation: 'цитата' } }),
    }),
    getSocraticTurns: async () => [{ attempt_id: 'a1', qid: 'q2', step: 1, question_text: 'Почему так?', child_answer: '' }],
  });
  socratic._setRepo(repo);
  const res = await socratic.answer({ user: USER, id: 'a1', qid: 'q2', text: 'Потому что Ванька тоскует по деду' });
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(calls.turns[0][0].child_answer, 'Потому что Ванька тоскует по деду');
  teardown();
});

// (д) после mark>=1 по всем in_scope qid → status reflection
test('review-question: mark>=1 по всем in_scope qid → status reflection', async () => {
  const { repo, state } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(LLM_MARK2));
  await review.question({ user: USER, id: 'a1', qid: 'q1' });
  await review.question({ user: USER, id: 'a1', qid: 'q2' });
  // q3 оцениваем mark 1 — тоже >= 1
  review.setLlm(mockLlm(LLM_MARK1));
  state.attempt.marks_json = JSON.stringify({ q1: { mark: 2 }, q2: { mark: 2 } });
  const r3 = await review.question({ user: USER, id: 'a1', qid: 'q3' });
  assert.strictEqual(r3.body.mark, 1);
  assert.strictEqual(state.attempt.status, 'reflection', 'все in_scope qid с mark>=1 → reflection');
  teardown();
});

// (е) лимит 16 → 429 llm_limit, ЛЛМ не вызывается
test('review-question: лимит 16 вызовов → 429 llm_limit, ЛЛМ не вызывается', async () => {
  const { repo } = makeRepo({ countLlmReviews: async () => 16 });
  review._setRepo(repo);
  let called = 0;
  review.setLlm(async () => { called++; return { text: '' }; });
  const res = await review.question({ user: USER, id: 'a1', qid: 'q1' });
  assert.strictEqual(res.status, 429);
  assert.deepStrictEqual(res.body, { error: 'llm_limit' });
  assert.strictEqual(called, 0);
  teardown();
});

test('review-question: нет текущего ответа на qid → 409 no_answer; чужой attempt → 404; reflection → 409', async () => {
  const noAnswer = makeRepo({ getAnswers: async () => [{ qid: 'q1', text_raw: 'ответ на q1' }] });
  review._setRepo(noAnswer.repo);
  review.setLlm(mockLlm(LLM_MARK2));
  const r1 = await review.question({ user: USER, id: 'a1', qid: 'q2' });
  const foreign = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u2', status: 'answering' }) });
  review._setRepo(foreign.repo);
  const r2 = await review.question({ user: USER, id: 'a1', qid: 'q1' });
  const refl = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'reflection' }) });
  review._setRepo(refl.repo);
  const r3 = await review.question({ user: USER, id: 'a1', qid: 'q1' });
  teardown();
  assert.strictEqual(r1.status, 409);
  assert.strictEqual(r1.body.error, 'no_answer');
  assert.strictEqual(r2.status, 404);
  assert.strictEqual(r3.status, 409);
});

test('review-question: не-JSON даже после ретрая → 502 llm_parse, две записи llm_reviews', async () => {
  const { repo, calls } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm('Просто текст без JSON'));
  const res = await review.question({ user: USER, id: 'a1', qid: 'q1' });
  teardown();
  assert.strictEqual(res.status, 502);
  assert.deepStrictEqual(res.body, { error: 'llm_parse' });
  assert.strictEqual(llmCalls, 2, 'ровно один ретрай');
  assert.strictEqual(calls.reviews.length, 2);
  assert.strictEqual(calls.reviews[1][0].scope, 'question_retry');
});

// split-режим: только qid фрагмента + whole — остальные qid → 404
test('review-question: split-attempt — qid из чужого фрагмента → 404, in_scope считается по фрагменту + whole', async () => {
  const QREF = [
    { qid: 'q1', type: 'T2', fragment_ref: 'whole', text: 'Сожми текст' },
    { qid: 'q2', type: 'T5', fragment_ref: 'f9', text: 'Согласен ли ты?' },
    { qid: 'q3', type: 'T1', fragment_ref: 'f8', text: 'Суть мольбы' },
  ];
  const OVERRIDE = JSON.stringify({ fragment_id: 'f9', fragment_title: 'Мольба', text: 'Мини-текст про мольбу.' });
  const { repo, state } = makeRepo({
    getAttempt: async () => ({
      ...state.attempt, level_id: 'lvl-p2-vanka', text_override: OVERRIDE,
    }),
    levels: async () => [{ id: 'lvl-p2-vanka', text_id: 'text-vanka', rule_kid: 'Скажи суть', questions: QREF }],
  });
  review._setRepo(repo);
  review.setLlm(mockLlm(LLM_MARK2));
  const bad = await review.question({ user: USER, id: 'a1', qid: 'q3' });
  // whole + фрагмент f9 с mark>=1 → reflection (q3 не входит в scope)
  const r1 = await review.question({ user: USER, id: 'a1', qid: 'q1' });
  state.attempt.marks_json = JSON.stringify({ q1: { mark: 2 } });
  const r2 = await review.question({ user: USER, id: 'a1', qid: 'q2' });
  teardown();
  assert.strictEqual(bad.status, 404);
  assert.strictEqual(r1.body.mark, 2);
  assert.strictEqual(r2.body.mark, 2);
  assert.strictEqual(state.attempt.status, 'reflection', 'reflection по in_scope (whole+f9), q3 не требуется');
});
