// Лестница итераций (task-9, методология §3.8 + проектирование §3): hint-крючок всегда доступен,
// next инкрементит iterations; на iterations >= splitThreshold — РАЗБИВКА: новый attempt на том же
// уровне (pass_number+1, статус reading), текст заменяется мини-текстом одного фрагмента.
// Фрагмент выбирается по нагрузке вопросами (самый частый fragment_ref); при повторных
// разбивках — следующий по нагрузке (опора снимается ступенями, не целиком).
const crypto = require('crypto');
const C = require('../config');
const hints = require('../hints');
let repo = require('../repo'); // seam для тестов: _setRepo (паттерн из attempts/review)

const ITERABLE = new Set(['reading', 'answering', 'socratic']);

function safeParse(j, dflt) { try { return typeof j === 'string' ? JSON.parse(j) : (j || dflt); } catch { return dflt; } }

async function hint({ user, id, qid }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (!ITERABLE.has(attempt.status)) return { status: 409, body: { error: 'not_iterable' } };
  const level = (await repo.levels()).find(l => l.id === attempt.level_id);
  const question = level && level.questions.find(q => q.qid === qid);
  if (!question) return { status: 404, body: { error: 'not_found' } };
  // Сколько подсказок уже выдано на этот qid — idx по кругу по числу вариантов матрицы.
  const events = await repo.listEvents(id);
  const given = events.filter(e => e.type === 'hint' && safeParse(e.payload_json, {}).qid === qid).length;
  const idx = given % hints.variants(level.rule_code, question.type).length;
  const text = hints.pick(level.rule_code, question.type, idx);
  await repo.addEvent(user.id, id, 'hint', { qid, idx, text }, Date.now());
  return { body: { hint: { qid, idx, text } } };
}

// Мини-текст фрагмента: body_json — массив абзацев, paras: [a, b] — диапазон включительно.
function fragmentText(textRow, fragment) {
  const body = safeParse(textRow && textRow.body_json, []);
  const [a, b] = (fragment.paras || [0, body.length - 1]).map(Number);
  const paras = body.slice(a, b + 1).map(p => (typeof p === 'string' ? p : (p && (p.text || p.body)) || '')).filter(Boolean);
  return { fragment_id: fragment.id, fragment_title: fragment.title || '', text: paras.join('\n') };
}

// Ранжирование фрагментов по нагрузке вопросами: чем чаще fragment_ref вопросов указывает
// на фрагмент, тем раньше он берётся в разбивку (первая разбивка — самый «вопрошаемый»).
function rankFragments(level, fragments) {
  const weight = f => level.questions.filter(q => q.fragment_ref === f.id).length;
  return [...fragments].sort((x, y) => weight(y) - weight(x));
}

async function next({ user, id }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  if (!ITERABLE.has(attempt.status)) return { status: 409, body: { error: 'not_iterable' } };
  const iterations = Number(attempt.iterations || 0) + 1;
  await repo.bumpIterations(id, iterations, Date.now());
  if (iterations < C.splitThreshold) return { body: { iterations } };

  // РАЗБИВКА: новый attempt на том же уровне, короткий фрагмент текста.
  const level = (await repo.levels()).find(l => l.id === attempt.level_id);
  const textRow = await repo.getText(level.text_id);
  const fragments = safeParse(textRow && textRow.fragments_json, []);
  if (!fragments.length) return { body: { iterations } }; // фрагментов нет — разбивка нечего делить
  const passNumber = Number(attempt.pass_number || 1) + 1;
  const ranked = rankFragments(level, fragments);
  const fragment = ranked[Math.min(passNumber - 2, ranked.length - 1)];
  const now = Date.now();
  const fresh = {
    id: crypto.randomUUID(), user_id: user.id, level_id: attempt.level_id, stake: Number(attempt.stake),
    status: 'reading', pass_number: passNumber, socratic_count: 0, iterations: 0,
    text_override: JSON.stringify(fragmentText(textRow, fragment)),
    created_at: now, updated_at: now,
  };
  await repo.createAttempt(fresh);
  await repo.addEvent(user.id, id, 'split', { from: id, to: fresh.id, fragment_id: fragment.id, pass_number: passNumber }, now);
  return { body: { attempt: fresh } };
}

// Текст уровня для фронта и review: мини-текст фрагмента, если attempt — результат разбивки.
async function get({ user, id }) {
  const attempt = await repo.getAttempt(id);
  if (!attempt || attempt.user_id !== user.id) return { status: 404, body: { error: 'not_found' } };
  const level = (await repo.levels()).find(l => l.id === attempt.level_id);
  const textRow = level && (await repo.getText(level.text_id));
  const ov = safeParse(attempt.text_override, null);
  const body = safeParse(textRow && textRow.body_json, []);
  const full = body.map(p => (typeof p === 'string' ? p : (p && (p.text || p.body)) || '')).filter(Boolean).join('\n');
  return {
    body: {
      attempt,
      text: ov ? ov.text : full,
      split: !!ov,
      fragment: ov ? { id: ov.fragment_id, title: ov.fragment_title } : null,
    },
  };
}

function _setRepo(r) { repo = r; }

module.exports = { hint, next, get, _setRepo };
