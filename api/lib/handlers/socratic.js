// Сократовский цикл (task-7, task-14): наводящие вопросы по нулевым ответам (shared inquiry).
// Допуск: status в ('answering','socratic') И qid имеет mark 0 (marks_json от пошагового
// review-question, zero_qids_json от пакетного review-ответа, либо есть подряд идущие
// события q_zero). Шагов на qid — не больше C.socraticMaxSteps; вызовы ЛЛМ идут в общий
// лимит C.llmCallsLimit. Пост-фильтр: сгенерированный вопрос не должен выдавать содержание
// эталона (иначе повтор, макс 3). Подключается со ВТОРОЙ неудачи подряд — решает фронт.
const C = require('../config');
const prompts = require('../prompts');
const rubric = require('../rubric');
let llm = require('../llm');       // seam для тестов: setLlm(mockFn)
const llmShared = require('../llm'); // isRefusal — общий детектор отказа (вне seam)
let repo = require('../repo');     // seam для тестов: _setRepo(mock)

const CRITERIA_NAMES = ['Соответствие форме задания', 'Точность (пересказ не подменяет смысл)', 'Привязка к тексту', 'Свои слова (нет копии слов автора)', 'Осмысленность'];
const GENERATION_TRIES = 4; // 1 основная + 3 повтора после отклонения фильтром (yandexgpt-lite нестабилен)

function safeParse(j, dflt) { try { return typeof j === 'string' ? JSON.parse(j) : (j || dflt); } catch { return dflt; } }

// Проверка пост-фильтра: вопрос не должен ВЫДАВАТЬ эталонное содержание.
// Отклоняем, только если вопрос содержит: (1) эталон целиком как подстроку,
// (2) кусок эталона длиной ≥ 25 символов (по словам), (3) ≥ 4 слов эталона
// подряд. Одиночное ключевое слово из эталона (уровень П5: «что значит слово X»)
// законно — не отклоняем.
function leaksEtalon(question, etalon) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();
  const q = norm(question);
  const e = norm(etalon);
  if (!q || !e) return false;
  if (q.includes(e)) return true;
  const qw = q.split(' ');
  const ew = e.split(' ');
  // (2) кусок эталона ≥ 25 символов — наращиваем окно по словам эталона
  for (let i = 0; i < ew.length; i++) {
    let buf = '';
    for (let j = i; j < ew.length; j++) {
      buf = buf ? `${buf} ${ew[j]}` : ew[j];
      if (buf.length >= 25 && q.includes(buf)) return true;
      if (buf.length >= 80) break;
    }
  }
  // (3) ≥ 4 слов эталона подряд
  for (let i = 0; i + 4 <= ew.length; i++) {
    if (q.includes(ew.slice(i, i + 4).join(' '))) return true;
  }
  return false;
}

// Плохой сократовский вопрос: (а) в тексте НЕТ знака «?»; (б) в тексте есть
// маркеры отказа/перевода темы (модель отказалась от беседы, а не задала
// вопрос). Такая генерация отклоняется — как утечка эталона (регенерация).
// Маркеры — общий детектор llm.isRefusal.
function isBadSocraticQuestion(q) {
  const text = String(q || '').toLowerCase();
  if (!text) return true;
  if (!text.includes('?')) return true;
  if (llmShared.isRefusal(q)) return true;
  return false;
}

// Нулевые критерии по qid — из последнего question-ревью этого qid (пошаговый флоу,
// task-14), fallback — последнее pack-ревью. Не распарсилось — все пять.
async function zeroCriteriaFor(id, qid) {
  try {
    const qr = await repo.getLastQuestionReview(id, qid);
    const p = safeParse(qr && qr.response_json, {});
    const single = rubric.parseLlmJson(p.text || '');
    if (single) return single.criteria.map((v, i) => (v === 0 ? CRITERIA_NAMES[i] : null)).filter(Boolean);
  } catch { /* ниже — запасной вариант */ }
  try {
    const row = await repo.getLastLlmReview(id, 'pack');
    const results = rubric.parseLlmResults(safeParse(row && row.response_json, {}).text || '');
    const r = results && results.find(x => x.qid === qid);
    if (r) return r.criteria.map((v, i) => (v === 0 ? CRITERIA_NAMES[i] : null)).filter(Boolean);
  } catch { /* ниже — запасной вариант */ }
  return CRITERIA_NAMES.slice();
}

// qid «нулевой», если: marks_json[qid].mark === 0 (пошаговый review-question), либо qid в
// zero_qids_json пакетного review, либо есть подряд идущие события q_zero по этому qid.
async function qidIsZero(attempt, id, qid) {
  const marks = safeParse(attempt.marks_json, {});
  if (marks[qid] && Number(marks[qid].mark) === 0) return true;
  const zq = safeParse(attempt.zero_qids_json, []);
  if (Array.isArray(zq) && zq.includes(qid)) return true;
  try {
    if ((await repo.countConsecutiveQZero(id, qid)) > 0) return true;
  } catch { /* репо без этой функции (моки старых тестов) — остальные признаки выше */ }
  return false;
}

async function ask({ user, id, qid }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (attempt.status !== 'answering' && attempt.status !== 'socratic') {
    return { status: 409, body: { error: 'not_socratic' } };
  }
  if (!(await qidIsZero(attempt, id, qid))) return { status: 409, body: { error: 'not_zero_qid' } };
  if ((await repo.countSocraticTurns(id, qid)) >= C.socraticMaxSteps) {
    return { status: 429, body: { error: 'socratic_limit' } };
  }
  if ((await repo.countLlmReviews(id)) >= C.llmCallsLimit) {
    return { status: 429, body: { error: 'llm_limit' } };
  }

  const levels = await repo.levels();
  const level = levels.find(l => l.id === attempt.level_id);
  const question = level && level.questions.find(q => q.qid === qid);
  if (!question) return { status: 404, body: { error: 'not_found' } };
  const [answers, bases, zeroCriteria] = await Promise.all([
    repo.getAnswers(id), repo.answerBases(attempt.level_id), zeroCriteriaFor(id, qid),
  ]);
  const childAnswer = (answers.find(a => a.qid === qid) || {}).text_raw || '';
  const etalon = ((bases.find(b => b.level_qid === `${attempt.level_id}:${qid}`) || {}).etalon) || '';
  const step = (await repo.countSocraticTurns(id, qid)) + 1;

  let lastOut = null;
  for (let t = 1; t <= GENERATION_TRIES; t++) {
    // Перепроверка суммарного лимита перед КАЖДЫМ вызовом ЛЛМ: на входе в ask
    // лимит мог быть почти достигнут (например count=11), а цикл генерации
    // делает до 3 вызовов — иначе суммарный лимит превышался бы.
    if ((await repo.countLlmReviews(id)) >= C.llmCallsLimit) {
      return { status: 429, body: { error: 'llm_limit' } };
    }
    const { system, user: userPrompt } = prompts.socraticQuestion({
      rule: { kid_formulation: level.rule_kid },
      question, childAnswer, zeroCriteria, attempts: step - 1,
    });
    const tStart = Date.now();
    const out = await llm.complete(system, userPrompt);
    lastOut = out;
    // PK/iteration назначает repo.addLlmReview (append-only, следующий свободный
    // индекс = countLlmReviews) — здесь iteration не передаём, повторные вызовы
    // цикла генерации остаются отдельными строками.
    await repo.addLlmReview({
      attempt_id: id, scope: 'socratic', qid, rubric_version: C.rubricVersion,
      request_json: { system, user: userPrompt }, response_json: { text: out.text },
      tokens_in: out.tokensIn, tokens_out: out.tokensOut, cost_rub: out.costRub, t_spent: tStart,
    });
    const qText = String(out.text || '').trim();
    if (qText && !leaksEtalon(qText, etalon) && !isBadSocraticQuestion(qText)) {
      await repo.addSocraticTurn({ attempt_id: id, qid, step, question_text: qText, created_at: Date.now() });
      await repo.addEvent(user.id, id, 'socratic_ask', { qid, step }, Date.now());
      return { body: { question: qText, step } };
    }
  }
  await repo.addEvent(user.id, id, 'socratic_ask', { qid, step, error: 'socratic_filter' }, Date.now());
  return { status: 502, body: { error: 'socratic_filter' } };
}

// Ребёнок отвечает на наводящий вопрос: ответ дописывается в последний шаг.
// Финальный ответ ребёнок переписывает сам через attempt-answers (attempts.answers) — отдельный маршрут не нужен.
async function answer({ user, id, qid, text }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (attempt.status !== 'answering' && attempt.status !== 'socratic') {
    return { status: 409, body: { error: 'not_socratic' } };
  }
  if (!(await qidIsZero(attempt, id, qid))) return { status: 409, body: { error: 'not_zero_qid' } };
  const turns = await repo.getSocraticTurns(id, qid);
  const last = turns[turns.length - 1];
  if (!last) return { status: 409, body: { error: 'no_question' } };
  await repo.addSocraticTurn({
    attempt_id: id, qid, step: Number(last.step), question_text: last.question_text,
    child_answer: String(text || ''), created_at: Date.now(),
  });
  await repo.addEvent(user.id, id, 'socratic_answer', { qid, step: Number(last.step) }, Date.now());
  return { body: { ok: true, step: Number(last.step) } };
}

function _setRepo(r) { repo = r; }
function setLlm(fn) { llm = { complete: fn }; }

module.exports = { ask, answer, _setRepo, setLlm, leaksEtalon, isBadSocraticQuestion, qidIsZero };
