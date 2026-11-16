// Интеграционный тест лестницы итераций (task-9): hint-крючки, next, split на фрагменты.
// Seam: handlers/iterate.js держит repo в модульной переменной (_setRepo), как attempts/review.
const test = require('node:test');
const assert = require('node:assert');
const iterate = require('../lib/handlers/iterate');
const hints = require('../lib/hints');

const LEVEL = {
  id: 'lvl-p2-fersman', rule_code: 'П2', text_id: 'text-fersman-krym',
  questions: [
    { qid: 'q1', type: 'T2', fragment_ref: 'whole', text: 'Сожми до одного предложения.' },
    { qid: 'q5', type: 'T5', fragment_ref: 'f5', text: 'Согласен ли ты с автором?' },
  ],
};

const FRAGMENTS = [
  { id: 'f1', title: 'Первая жилка', paras: [0, 1] },
  { id: 'f5', title: 'Крым — первый университет', paras: [2, 3] },
];
const BODY = ['параграф ноль', 'параграф один', 'про Крым и университет', 'концовка про Крым'];
const TEXT_ROW = { id: 'text-fersman-krym', title: 'Ферсман', author: 'А. Ферсман', body_json: BODY, fragments_json: FRAGMENTS };

function makeRepo(over = {}) {
  const calls = { events: [], created: null, iterations: 0 };
  const attempt = { id: 'a1', user_id: 'u1', level_id: 'lvl-p2-fersman', stake: 50, status: 'reading', pass_number: 1, iterations: 0 };
  const repo = {
    levels: async () => [LEVEL],
    getAttempt: async () => ({ ...attempt, iterations: calls.iterations }),
    getText: async () => TEXT_ROW,
    listEvents: async () => calls.events.filter(e => e[2] === 'hint').map(e => ({ type: 'hint', payload_json: e[3] })),
    bumpIterations: async (id, n) => { calls.iterations = n; calls.bumped = n; },
    createAttempt: async a => { calls.created = a; },
    addEvent: async (...args) => calls.events.push(args),
    ...over,
  };
  return { repo, calls, attempt };
}
const USER = { id: 'u1', role: 'child' };

test('hint: формулировки по кругу + событие hint с {qid, idx, text}', async () => {
  const { repo, calls } = makeRepo();
  iterate._setRepo(repo);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const res = await iterate.hint({ user: USER, id: 'a1', qid: 'q1' });
    assert.strictEqual(res.status, undefined);
    seen.push(res.body.hint.text);
  }
  iterate._setRepo(require('../lib/repo'));
  // Первые N формулировок разные, затем по кругу (матрица даёт 3 штуки на комбинацию).
  assert.strictEqual(new Set(seen.slice(0, 3)).size, 3, 'первые три подсказки разные');
  assert.strictEqual(seen[3], seen[0], 'четвёртая = первая (по кругу)');
  const hintEvents = calls.events.filter(e => e[2] === 'hint');
  assert.strictEqual(hintEvents.length, 5);
  assert.deepStrictEqual(hintEvents[0][3], { qid: 'q1', idx: 0, text: seen[0] });
  assert.strictEqual(hintEvents[3][3].idx, 0, 'idx по кругу');
});

test('hint: Т2-крючок про память, Т5 — про привязку к фрагменту (методология §3)', async () => {
  const t2 = hints.pick('П2', 'T2', 0);
  const t5 = hints.pick('П5', 'T5', 0);
  assert.match(t2, /памят|не подглядыв|без текста/i);
  assert.match(t5, /фрагмент|место в тексте/i);
});

test('hint: approved attempt → 409', async () => {
  const { repo } = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u1', status: 'approved', level_id: 'lvl-p2-fersman' }) });
  iterate._setRepo(repo);
  const res = await iterate.hint({ user: USER, id: 'a1', qid: 'q1' });
  iterate._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, 409);
});

test('hint: чужой attempt → 404', async () => {
  const { repo } = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u2', status: 'reading', level_id: 'lvl-p2-fersman' }) });
  iterate._setRepo(repo);
  const res = await iterate.hint({ user: USER, id: 'a1', qid: 'q1' });
  iterate._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, 404);
});

test('next: инкрементит iterations до порога, splitThreshold=4', async () => {
  const { repo, calls } = makeRepo();
  iterate._setRepo(repo);
  const r1 = await iterate.next({ user: USER, id: 'a1' });
  assert.deepStrictEqual(r1.body, { iterations: 1 });
  assert.strictEqual(calls.bumped, 1);
  iterate._setRepo(require('../lib/repo'));
});

test('next: на 4-й итерации — новый attempt pass_number+1, reading, мини-текст фрагмента', async () => {
  const { repo, calls } = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-fersman', stake: 50, status: 'answering', pass_number: 1, iterations: 3 }) });
  iterate._setRepo(repo);
  const res = await iterate.next({ user: USER, id: 'a1' });
  iterate._setRepo(require('../lib/repo'));
  const a = res.body.attempt;
  assert.ok(a, 'должен вернуться новый attempt');
  assert.strictEqual(a.pass_number, 2);
  assert.strictEqual(a.status, 'reading');
  assert.strictEqual(a.iterations, 0);
  assert.strictEqual(a.user_id, 'u1');
  assert.strictEqual(a.level_id, 'lvl-p2-fersman');
  const ov = JSON.parse(a.text_override);
  assert.match(ov.text, /Крым/, 'мини-текст — фрагмент про Крым');
  assert.strictEqual(ov.fragment_id, 'f5', 'фрагмент f5 — наиболее нагружен вопросами (q5)');
  const split = calls.events.filter(e => e[2] === 'split');
  assert.strictEqual(split.length, 1);
  assert.strictEqual(split[0][3].from, 'a1');
  assert.strictEqual(split[0][3].fragment_id, 'f5');
});

test('next: approved attempt → 409', async () => {
  const { repo } = makeRepo({ getAttempt: async () => ({ id: 'a1', user_id: 'u1', status: 'approved', level_id: 'lvl-p2-fersman' }) });
  iterate._setRepo(repo);
  const res = await iterate.next({ user: USER, id: 'a1' });
  iterate._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, 409);
});

test('next: фрагмент с weight=0 не выбирается на split (split не выбирает фрагмент без вопросов)', async () => {
  const level = {
    ...LEVEL,
    questions: [{ qid: 'q5', type: 'T5', fragment_ref: 'f5', text: 'Согласен ли ты с автором?' }],
  };
  const textRow = {
    ...TEXT_ROW,
    fragments_json: [
      { id: 'f0', title: 'Пустой фрагмент', paras: [0, 1] }, // ни один вопрос не ссылается
      ...FRAGMENTS,
    ],
  };
  const { repo, calls } = makeRepo({
    levels: async () => [level],
    getText: async () => textRow,
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-fersman', stake: 50, status: 'answering', pass_number: 1, iterations: 3 }),
  });
  iterate._setRepo(repo);
  const res = await iterate.next({ user: USER, id: 'a1' });
  iterate._setRepo(require('../lib/repo'));
  const ov = JSON.parse(res.body.attempt.text_override);
  assert.strictEqual(ov.fragment_id, 'f5', 'выбран нагруженный фрагмент, а не f0 с нулевым весом');
  assert.strictEqual(calls.events.filter(e => e[2] === 'split').length, 1);
});

test('next: tie-break по id при равных весах — детерминизм явно', async () => {
  const level = {
    ...LEVEL,
    questions: [
      { qid: 'qa', type: 'T1', fragment_ref: 'fb', text: 'вопрос к fb' },
      { qid: 'qb', type: 'T1', fragment_ref: 'fa', text: 'вопрос к fa' },
    ],
  };
  // fa и fb равны по весу (1) — берётся fa (меньший id), независимо от порядка в fragments_json.
  const textRow = {
    ...TEXT_ROW,
    fragments_json: [
      { id: 'fb', title: 'Б', paras: [0, 1] },
      { id: 'fa', title: 'А', paras: [2, 3] },
    ],
  };
  const { repo } = makeRepo({
    levels: async () => [level],
    getText: async () => textRow,
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-fersman', stake: 50, status: 'answering', pass_number: 1, iterations: 3 }),
  });
  iterate._setRepo(repo);
  const res = await iterate.next({ user: USER, id: 'a1' });
  iterate._setRepo(require('../lib/repo'));
  const ov = JSON.parse(res.body.attempt.text_override);
  assert.strictEqual(ov.fragment_id, 'fa', 'при равенстве весов — меньший id');
});

test('next: повторный split с того же attempt → 409 already_split', async () => {
  const { repo } = makeRepo({
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-fersman', stake: 50, status: 'answering', pass_number: 1, iterations: 3 }),
    listEvents: async () => [
      { type: 'hint', payload_json: '{}' },
      { type: 'split', payload_json: JSON.stringify({ from: 'a1', to: 'a2', fragment_id: 'f5' }) },
    ],
  });
  iterate._setRepo(repo);
  const res = await iterate.next({ user: USER, id: 'a1' });
  iterate._setRepo(require('../lib/repo'));
  assert.strictEqual(res.status, 409);
  assert.deepStrictEqual(res.body, { error: 'already_split' });
});

test('next: кандидатов на фрагмент нет (все weight=0) → без split, только iterations', async () => {
  const level = {
    ...LEVEL,
    questions: [{ qid: 'q1', type: 'T2', fragment_ref: 'whole', text: 'Сожми до одного предложения.' }],
  };
  const { repo, calls } = makeRepo({
    levels: async () => [level],
    getAttempt: async () => ({ id: 'a1', user_id: 'u1', level_id: 'lvl-p2-fersman', stake: 50, status: 'answering', pass_number: 1, iterations: 3 }),
  });
  iterate._setRepo(repo);
  const res = await iterate.next({ user: USER, id: 'a1' });
  iterate._setRepo(require('../lib/repo'));
  assert.deepStrictEqual(res.body, { iterations: 4 }, 'лестница исчерпана — split не создаётся');
  assert.strictEqual(res.body.attempt, undefined);
  assert.strictEqual(calls.created, null, 'новый attempt не создавался');
  assert.strictEqual(calls.events.filter(e => e[2] === 'split').length, 0);
});
