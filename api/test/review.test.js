// Интеграционный тест review.pack: мок repo (_setRepo) и мок LLM (setLlm).
// Реальный YDB и реальный YandexGPT не трогаем — детерминированные фикстуры.
const test = require('node:test');
const assert = require('node:assert');
const review = require('../lib/handlers/review');

const USER = { id: 'u1', role: 'child' };
const QUESTIONS = [
  { qid: 'q1', type: 'T2', text: 'Сожми текст до одного предложения' },
  { qid: 'q2', type: 'T1', text: 'Передай суть мольбы своими словами' },
  { qid: 'q3', type: 'T3', text: 'Приведи свой пример' },
];
// criteria 5 штук 0-2; mark = finalMark(criteria)
const LLM_OK = JSON.stringify({ results: [
  { qid: 'q1', criteria: [2, 2, 2, 2, 2], explanation: 'Полный точный сжатый пересказ своими словами' },
  { qid: 'q2', criteria: [1, 2, 2, 2, 2], explanation: 'Свои слова, мольба передана, мелкая неточность формы' },
  { qid: 'q3', criteria: [2, 2, 1, 2, 2], explanation: 'Свой случай есть, связка с текстом слабая' },
] });
const LLM_WITH_ZERO = JSON.stringify({ results: [
  { qid: 'q1', criteria: [2, 2, 2, 2, 2], explanation: 'хорошо' },
  { qid: 'q2', criteria: [0, 0, 0, 0, 0], explanation: 'Сплошная цитата, не своими словами' },
  { qid: 'q3', criteria: [2, 2, 1, 2, 2], explanation: 'норм' },
] });

function makeRepo(over = {}) {
  const calls = { reviews: [], updates: [], events: [] };
  const repo = {
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'answering', iterations: 0 }),
    countLlmReviews: async () => 0,
    levels: async () => [{ id: 'lvl-p2-vanka', text_id: 'text-vanka-chekhov', rule_kid: 'Скажи суть', questions: QUESTIONS }],
    getText: async () => ({ id: 'text-vanka-chekhov', body_json: ['Абзац один.', 'Абзац два.'] }),
    getAnswers: async () => QUESTIONS.map(q => ({ qid: q.qid, text_raw: 'ответ на ' + q.qid })),
    answerBases: async () => [],
    addLlmReview: async (...args) => calls.reviews.push(args),
    updateAttemptReview: async (...args) => calls.updates.push(args),
    addEvent: async (...args) => calls.events.push(args),
    ...over,
  };
  return { repo, calls };
}
let llmCalls;
let lastPrompt; // user-промпт последнего вызова — проверяем, что ответы ребёнка доехали до ЛЛМ
function mockLlm(text) {
  llmCalls = 0;
  return async (system, user) => {
    llmCalls++;
    lastPrompt = user;
    return { text: typeof text === 'function' ? text(llmCalls) : text, tokensIn: 100, tokensOut: 50, costRub: 0.03 };
  };
}
function teardown(real) { review._setRepo(real); review.setLlm(require('../lib/llm').complete); }

test('pack: без нулей → status reflection, marks по каждому вопросу', async () => {
  const { repo, calls } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(LLM_OK));
  const res = await review.pack({ user: USER, id: 'a1' });
  review._setRepo(require('../lib/repo'));
  assert.strictEqual(res.body.status, 'reflection');
  assert.strictEqual(res.body.zero_qids, undefined);
  assert.deepStrictEqual(Object.keys(res.body.marks).sort(), ['q1', 'q2', 'q3']);
  assert.strictEqual(res.body.marks.q1.mark, 2);
  assert.strictEqual(res.body.marks.q1.total, 10);
  assert.strictEqual(res.body.marks.q2.mark, 2);
  assert.strictEqual(res.body.marks.q3.mark, 2);
  assert.strictEqual(calls.updates.length, 1);
  assert.strictEqual(calls.updates[0][1].status, 'reflection');
  assert.strictEqual(calls.reviews.length, 1, 'один вызов ЛЛМ — одна запись llm_reviews');
  assert.strictEqual(calls.reviews[0][0].scope, 'pack');
  assert.strictEqual(calls.reviews[0][0].tokens_in, 100);
  assert.strictEqual(calls.reviews[0][0].cost_rub, 0.03);
  assert.strictEqual(calls.events.filter(e => e[2] === 'review').length, 1);
  assert.match(lastPrompt, /ответ на q2/, 'text_raw ответов должен попадать в промпт ЛЛМ');
  assert.match(lastPrompt, /Абзац один/, 'текст произведения должен попадать в промпт');
});

test('pack: ноль по q2 → status socratic + zero_qids', async () => {
  const { repo } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(LLM_WITH_ZERO));
  const res = await review.pack({ user: USER, id: 'a1' });
  review._setRepo(require('../lib/repo'));
  assert.strictEqual(res.body.status, 'socratic');
  assert.deepStrictEqual(res.body.zero_qids, ['q2']);
  assert.strictEqual(res.body.marks.q2.mark, 0);
  assert.strictEqual(res.body.marks.q2.total, 0);
});

test('pack: лимит 12 вызовов → 429 llm_limit, ЛЛМ не вызывается', async () => {
  const { repo } = makeRepo({ countLlmReviews: async () => 12 });
  review._setRepo(repo);
  let called = 0;
  review.setLlm(async () => { called++; return { text: '' }; });
  const res = await review.pack({ user: USER, id: 'a1' });
  review._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, 429);
  assert.deepStrictEqual(res.body, { error: 'llm_limit' });
  assert.strictEqual(called, 0);
});

test('pack: не-JSON даже после ретрая → 502 llm_parse, две записи в llm_reviews', async () => {
  const { repo, calls } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm('Просто текст без JSON'));
  const res = await review.pack({ user: USER, id: 'a1' });
  review._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, 502);
  assert.deepStrictEqual(res.body, { error: 'llm_parse' });
  assert.strictEqual(llmCalls, 2, 'ровно один ретрай');
  assert.strictEqual(calls.reviews.length, 2);
  assert.strictEqual(calls.reviews[1][0].scope, 'pack_retry');
  assert.strictEqual(calls.updates.length, 0, 'статус attempt не меняется при 502');
});

test('pack: не-JSON первый раз, валидный JSON в ретрае → успех', async () => {
  const { repo } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm(n => (n === 1 ? 'мусор' : LLM_OK)));
  const res = await review.pack({ user: USER, id: 'a1' });
  review._setRepo(require('../lib/repo'));
  assert.strictEqual(res.body.status, 'reflection');
  assert.strictEqual(llmCalls, 2);
});

test('pack: не-JSON → 502, повторный review тем же PK → успех, без 500/PK-конфликта', async () => {
  const { repo } = makeRepo();
  review._setRepo(repo);
  review.setLlm(mockLlm('Просто текст без JSON'));
  const r1 = await review.pack({ user: USER, id: 'a1' });
  assert.strictEqual(r1.status, 502);
  assert.deepStrictEqual(r1.body, { error: 'llm_parse' });
  // клиент повторяет review: статус attempt остался 'answering', та же итерация и scope='pack'
  review.setLlm(mockLlm(LLM_OK));
  const r2 = await review.pack({ user: USER, id: 'a1' });
  assert.notStrictEqual(r2.status, 500, 'повторный review не падает с internal/PK-конфликтом');
  assert.notStrictEqual(r2.status, 409, 'статус answering допускает повторный review');
  assert.strictEqual(r2.body.status, 'reflection');
});

test('repo: addLlmReview — повторная запись с тем же PK (REPLACE INTO), без конфликта', async () => {
  const db = require('../lib/db');
  const realReady = db.ready, realQuery = db.query;
  const yqlLog = [];
  db.ready = async () => {};
  db.query = async (yql) => { yqlLog.push(yql); return [[]]; };
  try {
    const repo = require('../lib/repo');
    const row = { attempt_id: 'a1', iteration: 0, scope: 'pack', qid: 'pack' };
    await repo.addLlmReview(row);
    await repo.addLlmReview(row); // повтор после 502 — то же значение PK, не должно быть исключения
    assert.strictEqual(yqlLog.length, 2);
    assert.match(yqlLog[0], /^REPLACE INTO llm_reviews/, 'addLlmReview пишет через REPLACE INTO (идемпотентность)');
  } finally {
    db.ready = realReady; db.query = realQuery;
  }
});

test('pack: чужой attempt → 404; статус не answering → 409', async () => {
  const foreign = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u2', status: 'answering' }) });
  review._setRepo(foreign.repo);
  const r1 = await review.pack({ user: USER, id: 'a1' });
  const wrongStatus = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u1', status: 'reading' }) });
  review._setRepo(wrongStatus.repo);
  const r2 = await review.pack({ user: USER, id: 'a1' });
  review._setRepo(require('../lib/repo'));
  assert.strictEqual(r1.status, 404);
  assert.strictEqual(r2.status, 409);
});

test('pack: split-attempt — в промпте только вопросы фрагмента + whole, reviewed_qids', async () => {
  const QUESTIONS_WITH_REF = [
    { qid: 'q1', type: 'T2', fragment_ref: 'whole', text: 'Сожми текст до одного предложения' },
    { qid: 'q2', type: 'T5', fragment_ref: 'f9', text: 'Согласен ли ты с автором?' },
    { qid: 'q3', type: 'T1', fragment_ref: 'f8', text: 'Передай суть мольбы своими словами' },
  ];
  const OVERRIDE = JSON.stringify({ fragment_id: 'f9', fragment_title: 'Мольба', text: 'Мини-текст фрагмента про мольбу.' });
  const { repo, calls } = makeRepo({
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-vanka', status: 'answering', iterations: 0, text_override: OVERRIDE }),
    levels: async () => [{ id: 'lvl-p2-vanka', text_id: 'text-vanka-chekhov', rule_kid: 'Скажи суть', questions: QUESTIONS_WITH_REF }],
  });
  review._setRepo(repo);
  review.setLlm(mockLlm(JSON.stringify({ results: [
    { qid: 'q1', criteria: [2, 2, 2, 2, 2], explanation: 'хорошо' },
    { qid: 'q2', criteria: [2, 2, 2, 2, 2], explanation: 'согласен, аргументированно' },
  ] })));
  const res = await review.pack({ user: USER, id: 'a1' });
  review._setRepo(require('../lib/repo'));
  assert.strictEqual(res.body.status, 'reflection');
  assert.deepStrictEqual(res.body.reviewed_qids, ['q1', 'q2'], 'оценены whole + вопрос фрагмента f9');
  assert.deepStrictEqual(Object.keys(res.body.marks).sort(), ['q1', 'q2'], 'q3 (другой фрагмент) не оценивается');
  assert.match(lastPrompt, /ВОПРОС q1/, 'retrieval-вопрос whole в промпте');
  assert.match(lastPrompt, /ВОПРОС q2/, 'вопрос фрагмента f9 в промпте');
  assert.doesNotMatch(lastPrompt, /ВОПРОС q3/, 'вопрос чужого фрагмента f8 не в промпте');
  assert.match(lastPrompt, /ответ на q2/, 'ответ фрагмента доехал до ЛЛМ');
  assert.doesNotMatch(lastPrompt, /ответ на q3/, 'ответ чужого фрагмента не доехал');
  assert.match(lastPrompt, /Мини-текст фрагмента про мольбу/, 'полный текст автора для «Своих слов» = мини-текст фрагмента');
  assert.strictEqual(calls.updates.length, 1);
});
