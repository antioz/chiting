// Review-контур (task-6): оценка всего пакета ответов одним вызовом YandexGPT.
// Лимит — llmCallsLimit вызовов на attempt, считается по ВСЕМ записям llm_reviews.
// Есть нули → status='socratic' + zero_qids; нет нулей → status='reflection'.
const C = require('../config');
const prompts = require('../prompts');
const rubric = require('../rubric');
let llm = require('../llm');       // seam для тестов: setLlm(mockFn)
let repo = require('../repo');     // seam для тестов: _setRepo(mock) (паттерн из attempts)

// body_json — Json: массив абзацев/фрагментов (seed-content). Плоский текст для промпта.
function flattenBody(bodyJson) {
  const body = safeParse(bodyJson, []);
  if (typeof body === 'string') return body;
  if (Array.isArray(body)) return body.map(p => (typeof p === 'string' ? p : (p && (p.text || p.body)) || '')).filter(Boolean).join('\n');
  return '';
}
function safeParse(j, dflt) { try { return typeof j === 'string' ? JSON.parse(j) : (j || dflt); } catch { return dflt; } }

async function pack({ user, id }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (attempt.status !== 'answering') return { status: 409, body: { error: 'not_answering' } };
  if ((await repo.countLlmReviews(id)) >= C.llmCallsLimit) {
    return { status: 429, body: { error: 'llm_limit' } };
  }

  const levels = await repo.levels();
  const level = levels.find(l => l.id === attempt.level_id);
  if (!level) return { status: 404, body: { error: 'not_found' } };
  const [text, rawAnswers, bases] = await Promise.all([
    repo.getText(level.text_id), repo.getAnswers(id), repo.answerBases(attempt.level_id),
  ]);
  // Split-режим (task-9): attempt читает мини-текст одного фрагмента — ЛЛМ оценивает ТОЛЬКО
  // вопросы этого фрагмента (fragment_ref == id фрагмента) плюс retrieval-вопросы 'whole'
  // (проверяют память, не зависят от фрагмента). Ответы и эталоны фильтруются соответственно.
  const ov = safeParse(attempt.text_override, null);
  const scopeQids = new Set(
    ov
      ? level.questions.filter(q => q.fragment_ref === ov.fragment_id || q.fragment_ref === 'whole').map(q => q.qid)
      : level.questions.map(q => q.qid),
  );
  const questions = level.questions.filter(q => scopeQids.has(q.qid));
  const answers = rawAnswers.filter(a => scopeQids.has(a.qid)).map(a => ({ ...a, text: a.text_raw }));
  const answerBases = bases.filter(b => scopeQids.has(b.level_qid));
  const iteration = Number(attempt.iterations || 0);
  const tStart = Date.now();

  const { system, user: userPrompt } = prompts.packReview({
    rule: { kid_formulation: level.rule_kid },
    questions,
    answers,
    answerBases,
  });
  // «Свои слова (нет копии слов автора)»: текст автора = мини-текст фрагмента в split-режиме,
  // полный текст уровня — в обычном.
  const textBody = ov ? ov.text : flattenBody(text && text.body_json);
  const withText = `ТЕКСТ ДЛЯ ПРОВЕРКИ:\n${textBody}\n---\n${userPrompt}`;

  let out = await llm.complete(system, withText);
  let results = rubric.parseLlmResults(out.text);
  await repo.addLlmReview({
    attempt_id: id, iteration, scope: 'pack', qid: 'pack', rubric_version: C.rubricVersion,
    request_json: { system, user: withText }, response_json: { text: out.text },
    tokens_in: out.tokensIn, tokens_out: out.tokensOut, cost_rub: out.costRub, t_spent: tStart,
  });

  // Один ретрай максимум: явное требование строгого JSON (второй вызов — идёт в счёт лимита).
  if (!results) {
    const retrySystem = `${system}\nПрошлый ответ не был корректным JSON. Ответь СТРОГО одним JSON-объектом по схеме, без текста до или после.`;
    out = await llm.complete(retrySystem, withText);
    results = rubric.parseLlmResults(out.text);
    await repo.addLlmReview({
      attempt_id: id, iteration, scope: 'pack_retry', qid: 'pack', rubric_version: C.rubricVersion,
      request_json: { system: retrySystem, user: withText }, response_json: { text: out.text },
      tokens_in: out.tokensIn, tokens_out: out.tokensOut, cost_rub: out.costRub, t_spent: tStart,
    });
    if (!results) {
      await repo.addEvent(user.id, id, 'review', { error: 'llm_parse' }, Date.now());
      return { status: 502, body: { error: 'llm_parse' } };
    }
  }

  // Итоговые отметки по вопросам scope (split: только фрагмент + 'whole'); вопрос,
  // пропущенный ЛЛМ, — ноль.
  const marks = {};
  const zeroQids = [];
  for (const q of questions) {
    const r = results.find(x => x.qid === q.qid);
    if (!r) {
      marks[q.qid] = { mark: 0, total: 0, explanation: 'ЛЛМ не вернула оценку по вопросу' };
      zeroQids.push(q.qid);
      continue;
    }
    const fm = rubric.finalMark(r.criteria);
    marks[q.qid] = { mark: fm.mark, total: fm.total, explanation: r.explanation };
    if (fm.mark === 0) zeroQids.push(q.qid);
  }

  const status = zeroQids.length ? 'socratic' : 'reflection';
  await repo.updateAttemptReview(id, { status, marks_json: marks, zero_qids_json: zeroQids, updated_at: Date.now() });
  await repo.addEvent(user.id, id, 'review', { status, zero_qids: zeroQids }, Date.now());
  const reviewedQids = questions.map(q => q.qid);
  return zeroQids.length
    ? { body: { status, zero_qids: zeroQids, marks, reviewed_qids: reviewedQids } }
    : { body: { status, marks, reviewed_qids: reviewedQids } };
}

function _setRepo(r) { repo = r; }
function setLlm(fn) { llm = { complete: fn }; }

module.exports = { pack, _setRepo, setLlm };
