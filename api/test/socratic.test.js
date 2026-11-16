// Интеграционный тест сократовского цикла (task-7): мок repo (_setRepo) и мок LLM (setLlm).
// Пост-фильтр эталона, лимит шагов (socraticMaxSteps=4), суммарный лимит LLM-вызовов (llmCallsLimit=12).
const test = require('node:test');
const assert = require('node:assert');
const socratic = require('../lib/handlers/socratic');

const USER = { id: 'u1', role: 'child' };
const QUESTIONS = [
  { qid: 'q1', type: 'T2', text: 'Сожми текст до одного предложения' },
  { qid: 'q2', type: 'T1', text: 'Передай суть мольбы своими словами' },
];
const ETALON_Q2 = 'Ванька жалуется деду, что хозяин его избил, еды нет, жить невозможно, и просит забрать его к себе в деревню.';
const PACK_RESPONSE = JSON.stringify({ results: [
  { qid: 'q1', criteria: [2, 2, 2, 2, 2], explanation: 'хорошо' },
  { qid: 'q2', criteria: [0, 2, 2, 0, 2], explanation: 'Цитата без пересказа' },
] });

function makeRepo(over = {}) {
  const calls = { reviews: [], turns: [] };
  const repo = {
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'socratic', iterations: 0, zero_qids_json: ['q2'] }),
    countLlmReviews: async () => 1,
    countSocraticTurns: async () => 0,
    getSocraticTurns: async () => [],
    levels: async () => [{ id: 'lvl-p2-vanka', text_id: 'text-vanka', rule_kid: 'Скажи суть', questions: QUESTIONS }],
    getAnswers: async () => [{ qid: 'q2', text_raw: 'Ванька написал письмо деду' }],
    answerBases: async () => [{ level_qid: 'lvl-p2-vanka:q2', etalon: ETALON_Q2, clusters: [] }],
    getLastLlmReview: async () => ({ response_json: { text: PACK_RESPONSE } }),
    addLlmReview: async (...args) => calls.reviews.push(args),
    addSocraticTurn: async (...args) => calls.turns.push(args),
    addEvent: async () => {},
    ...over,
  };
  return { repo, calls };
}
let llmCalls;
function mockLlm(text) {
  llmCalls = 0;
  return async (system, user) => {
    llmCalls++;
    return { text: typeof text === 'function' ? text(llmCalls) : text, tokensIn: 50, tokensOut: 20, costRub: 0.01 };
  };
}

test('ask: happy path → {question}, шаг записан в socratic_turns, вызов в llm_reviews', async () => {
  const { repo, calls } = makeRepo();
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm('А почему ты так решил?'));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, undefined);
  assert.strictEqual(res.body.question, 'А почему ты так решил?');
  assert.strictEqual(llmCalls, 1);
  assert.strictEqual(calls.turns.length, 1);
  assert.strictEqual(calls.turns[0][0].step, 1);
  assert.strictEqual(calls.turns[0][0].qid, 'q2');
  assert.strictEqual(calls.turns[0][0].question_text, 'А почему ты так решил?');
  assert.strictEqual(calls.reviews.length, 1);
  assert.strictEqual(calls.reviews[0][0].scope, 'socratic');
  assert.strictEqual(calls.reviews[0][0].qid, 'q2');
  socratic._setRepo(require('../lib/repo'));
});

test('ask: вопрос содержит эталон → генерация повторяется, чистый вопрос, 2 вызова ЛЛМ', async () => {
  const { repo, calls } = makeRepo();
  socratic._setRepo(repo);
  // Первый ответ — плохой (прямой кусок эталона), второй — чистый.
  socratic.setLlm(mockLlm(n => (n === 1
    ? 'Ты помнишь, что Ванька жалуется деду, что хозяин его избил?'
    : 'Покажи место в тексте, где герой молит о помощи?')));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.body.question, 'Покажи место в тексте, где герой молит о помощи?');
  assert.strictEqual(llmCalls, 2);
  assert.strictEqual(calls.reviews.length, 2, 'каждый вызов ЛЛМ — запись в llm_reviews');
  assert.ok(!('iteration' in calls.reviews[0][0]) && !('iteration' in calls.reviews[1][0]),
    'iteration назначает repo.addLlmReview (append-only: следующий свободный индекс = countLlmReviews)');
  socratic._setRepo(require('../lib/repo'));
});

test('ask: 4 попытки с эталоном → 502 socratic_filter', async () => {
  const { repo, calls } = makeRepo();
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm('Ванька жалуется деду, что хозяин его избил, верно?'));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, 502);
  assert.deepStrictEqual(res.body, { error: 'socratic_filter' });
  assert.strictEqual(llmCalls, 4, '1 основная + 3 повтора');
  assert.strictEqual(calls.reviews.length, 4);
  assert.strictEqual(calls.turns.length, 0, 'отклонённый вопрос в socratic_turns не пишется');
  socratic._setRepo(require('../lib/repo'));
});

test('ask: вопрос с одним ключевым словом из эталона (уровень П5) принимается', async () => {
  const { repo, calls } = makeRepo({
    levels: async () => [{ id: 'lvl-p2-vanka', text_id: 'text-vanka', rule_kid: 'Скажи суть', questions: QUESTIONS }],
    answerBases: async () => [{ level_qid: 'lvl-p2-vanka:q2', etalon: 'Ванька чудесный мальчик, который просит деда забрать его в деревню.', clusters: [] }],
  });
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm('А что в тексте значит слово «чудесный»?'));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, undefined);
  assert.deepStrictEqual(res.body, { question: 'А что в тексте значит слово «чудесный»?', step: 1 });
  assert.strictEqual(calls.turns.length, 1);
  socratic._setRepo(require('../lib/repo'));
});

test('ask: вопрос с длинным куском эталона (≥25 симв) отклоняется → 502', async () => {
  const { repo, calls } = makeRepo();
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm('А ведь Ванька жалуется деду, что хозяин его избил, так?'));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, 502);
  assert.deepStrictEqual(res.body, { error: 'socratic_filter' });
  assert.strictEqual(calls.turns.length, 0);
  socratic._setRepo(require('../lib/repo'));
});

test('leaksEtalon: ≥4 слов эталона подряд — отклоняется', () => {
  assert.strictEqual(socratic.leaksEtalon('Почему доктор оказался ещё и добрым человеком?', 'Чудесный доктор оказался ещё и добрым человеком.'), true);
});

test('ask: 5-й шаг → 429 socratic_limit, ЛЛМ не вызывается', async () => {
  const { repo } = makeRepo({ countSocraticTurns: async () => 4 });
  socratic._setRepo(repo);
  let called = 0;
  socratic.setLlm(async () => { called++; return { text: 'вопрос' }; });
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, 429);
  assert.deepStrictEqual(res.body, { error: 'socratic_limit' });
  assert.strictEqual(called, 0);
  socratic._setRepo(require('../lib/repo'));
});

test('ask: суммарный лимит 16 LLM-вызовов → 429 llm_limit', async () => {
  const { repo } = makeRepo({ countLlmReviews: async () => 16 });
  socratic._setRepo(repo);
  let called = 0;
  socratic.setLlm(async () => { called++; return { text: 'вопрос' }; });
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, 429);
  assert.deepStrictEqual(res.body, { error: 'llm_limit' });
  assert.strictEqual(called, 0);
  socratic._setRepo(require('../lib/repo'));
});

test('ask: count=15 на входе, первый вопрос с эталоном → 429 llm_limit на 2-й итерации, ЛЛМ вызван 1 раз', async () => {
  const { repo, calls } = makeRepo();
  // Счётчик как в боевом репо: addLlmReview реально увеличивает countLlmReviews.
  let count = 15;
  repo.countLlmReviews = async () => count;
  repo.addLlmReview = async (...args) => { count++; calls.reviews.push(args); };
  socratic._setRepo(repo);
  // Первый ответ содержит эталон → без перепроверки лимита был бы 2-й вызов.
  socratic.setLlm(mockLlm('Ванька жалуется деду, что хозяин его избил, верно?'));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.status, 429);
  assert.deepStrictEqual(res.body, { error: 'llm_limit' });
  assert.strictEqual(llmCalls, 1, 'перед 2-й итерацией лимит (15+1=16) перепроверен — второй вызов не делается');
  assert.strictEqual(calls.reviews.length, 1);
  socratic._setRepo(require('../lib/repo'));
});

test('ask: генерация без «?» → регенерация, вернулся хороший вопрос', async () => {
  const { repo, calls } = makeRepo();
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm(n => (n === 1
    ? 'Спроси его, где герой просит о помощи.'
    : 'Покажи место в тексте, где герой просит о помощи?')));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.body.question, 'Покажи место в тексте, где герой просит о помощи?');
  assert.strictEqual(llmCalls, 2);
  assert.strictEqual(calls.turns.length, 1);
  socratic._setRepo(require('../lib/repo'));
});

test('ask: отказ/перевод темы («не могу обсуждать…») → регенерация, вернулся хороший вопрос', async () => {
  const { repo, calls } = makeRepo();
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm(n => (n === 1
    ? 'Я не могу обсуждать эту тему. Давайте поговорим о чём-нибудь ещё.'
    : 'Почему Ванька решил писать именно деду?')));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.body.question, 'Почему Ванька решил писать именно деду?');
  assert.strictEqual(llmCalls, 2);
  assert.strictEqual(calls.turns.length, 1);
  socratic._setRepo(require('../lib/repo'));
});

test('isBadSocraticQuestion: без «?» или маркер отказа — плохой вопрос', () => {
  assert.strictEqual(socratic.isBadSocraticQuestion('Просто скажи, что он устал.'), true);
  assert.strictEqual(socratic.isBadSocraticQuestion('Извини, но эта тема неприемлема, давай поговорим о другой теме.'), true);
  assert.strictEqual(socratic.isBadSocraticQuestion('Почему герой просит о помощи?'), false);
});

test('ask: happy path → {question} без регенерации (не сломан пост-фильтром)', async () => {
  const { repo, calls } = makeRepo();
  socratic._setRepo(repo);
  socratic.setLlm(mockLlm('А что ты имеешь в виду, когда пишешь «не мог»?'));
  const res = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  assert.strictEqual(res.body.question, 'А что ты имеешь в виду, когда пишешь «не мог»?');
  assert.strictEqual(llmCalls, 1);
  assert.strictEqual(calls.turns.length, 1);
  socratic._setRepo(require('../lib/repo'));
});

test('ask: чужой attempt → 404; статус не socratic → 409; qid не из zero_qids → 409', async () => {
  const foreign = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u2', status: 'socratic', zero_qids_json: ['q2'] }) });
  socratic._setRepo(foreign.repo);
  const r1 = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  const wrongStatus = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u1', status: 'reflection', zero_qids_json: ['q2'] }) });
  socratic._setRepo(wrongStatus.repo);
  const r2 = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  const notZero = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u1', status: 'socratic', zero_qids_json: ['q1'] }) });
  socratic._setRepo(notZero.repo);
  const r3 = await socratic.ask({ user: USER, id: 'a1', qid: 'q2' });
  socratic._setRepo(require('../lib/repo'));
  assert.strictEqual(r1.status, 404);
  assert.strictEqual(r2.status, 409);
  assert.strictEqual(r3.status, 409);
});

test('answer: запись ответа ребёнка в последний шаг', async () => {
  const { repo, calls } = makeRepo({
    getSocraticTurns: async () => [{ attempt_id: 'a1', qid: 'q2', step: 1, question_text: 'Почему так?', child_answer: '' }],
    countSocraticTurns: async () => 1,
  });
  socratic._setRepo(repo);
  const res = await socratic.answer({ user: USER, id: 'a1', qid: 'q2', text: 'Потому что хозяин злой' });
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(calls.turns.length, 1);
  assert.strictEqual(calls.turns[0][0].step, 1);
  assert.strictEqual(calls.turns[0][0].child_answer, 'Потому что хозяин злой');
  assert.strictEqual(calls.turns[0][0].question_text, 'Почему так?', 'текст вопроса при дописывании ответа сохраняется');
  socratic._setRepo(require('../lib/repo'));
});

test('answer: вопросов ещё не было → 409', async () => {
  const { repo } = makeRepo();
  socratic._setRepo(repo);
  const res = await socratic.answer({ user: USER, id: 'a1', qid: 'q2', text: 'ответ' });
  assert.strictEqual(res.status, 409);
  socratic._setRepo(require('../lib/repo'));
});
