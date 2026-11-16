// Админка (task-10): полный отчёт по попытке, экономика ЛЛМ, вейт-лист.
// reportBundle — единый сборщик данных: его же потребляет lib/export.js для HTML.
const crypto = require('crypto');
const C = require('../config');
const rubric = require('../rubric');
let repo = require('../repo'); // seam для тестов: _setRepo

const CRITERIA_NAMES = ['Соответствие форме задания', 'Точность (смысл не подменён)', 'Привязка к тексту', 'Свои слова (нет копии)', 'Осмысленность'];
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function safeParse(j, dflt) { try { return typeof j === 'string' ? JSON.parse(j) : (j || dflt); } catch { return dflt; } }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
// День по метке created_at (UTC, YYYY-MM-DD) — ключ агрегации экономики.
function dayKey(ms) { return new Date(num(ms)).toISOString().slice(0, 10); }
function round2(n) { return Math.round(n * 100) / 100; }

function inviteCode() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  return 'WAIT-' + code;
}

// --- полный отчёт по попытке (JSON для админки и данные для HTML-экспорта) ---
async function reportBundle(attemptId) {
  const attempt = await repo.getAttempt(attemptId);
  if (!attempt) return null;
  const [user, levels, answers, reflection, events, reviews, coupon] = await Promise.all([
    repo.getUserById(attempt.user_id),
    repo.levels(),
    repo.getAnswers(attemptId),
    repo.getReflectionAnswers(attemptId),
    repo.listEvents(attemptId),
    repo.listLlmReviewsByAttempt(attemptId),
    repo.getCouponByAttempt(attemptId),
  ]);
  const level = levels.find(l => l.id === attempt.level_id) || null;
  const marks = safeParse(attempt.marks_json, {});
  const zeroQids = safeParse(attempt.zero_qids_json, []);

  // criteria по qid — из последнего pack-ревью (marks в attempt уже итоговые, criteria нужны для разбора).
  const packReviews = reviews.filter(r => r.scope === 'pack').sort((a, b) => num(a.created_at) - num(b.created_at));
  const lastPack = packReviews[packReviews.length - 1];
  const packResults = lastPack ? (rubric.parseLlmResults(safeParse(lastPack.response_json, {}).text || '') || []) : [];

  const questions = [];
  for (const q of (level ? level.questions : [])) {
    const ans = answers.find(a => a.qid === q.qid) || null;
    const turns = await repo.getSocraticTurns(attemptId, q.qid);
    const pr = packResults.find(r => r.qid === q.qid);
    const m = marks[q.qid];
    questions.push({
      qid: q.qid,
      type: q.type,
      text: q.text,
      form_spec: q.form_spec || null,
      fragment_ref: q.fragment_ref || null,
      zero: zeroQids.includes(q.qid),
      answer: ans ? {
        text_raw: ans.text_raw, keydown: num(ans.typed_chars),
        pasted: !!ans.pasted, t_answer: num(ans.t_answer), updated_at: num(ans.updated_at),
      } : null,
      mark: m ? { mark: num(m.mark), total: num(m.total), explanation: m.explanation || '' } : null,
      criteria: pr ? CRITERIA_NAMES.map((name, i) => ({ name, value: num(pr.criteria[i]) })) : null,
      socratic: turns.map(t => ({ step: num(t.step), question: t.question_text, answer: t.child_answer || '' })),
    });
  }

  const llm = {
    calls: reviews.length,
    tokens_in: reviews.reduce((s, r) => s + num(r.tokens_in), 0),
    tokens_out: reviews.reduce((s, r) => s + num(r.tokens_out), 0),
    rub: round2(reviews.reduce((s, r) => s + num(r.cost_rub), 0)),
    by_scope: reviews.map(r => ({
      scope: r.scope, qid: r.qid, iteration: num(r.iteration),
      tokens_in: num(r.tokens_in), tokens_out: num(r.tokens_out),
      rub: round2(num(r.cost_rub)), created_at: num(r.created_at),
    })),
  };

  let split = null;
  if (attempt.text_override) {
    try { split = JSON.parse(attempt.text_override); } catch { split = null; }
  }

  return {
    attempt: {
      id: attempt.id, user_id: attempt.user_id, level_id: attempt.level_id,
      stake: num(attempt.stake), status: attempt.status,
      pass_number: num(attempt.pass_number), iterations: num(attempt.iterations),
      socratic_count: num(attempt.socratic_count),
      created_at: num(attempt.created_at), updated_at: num(attempt.updated_at),
      split,
    },
    user: user ? { id: user.id, login: user.login, created_at: num(user.created_at) } : { id: attempt.user_id, login: '(удалён)' },
    level: level ? {
      id: level.id, rule_code: level.rule_code, rule_kid: level.rule_kid,
      text_id: level.text_id, text_title: level.text_title, text_author: level.text_author,
    } : { id: attempt.level_id },
    questions,
    reflection: reflection.map(r => ({
      qid: r.qid, question: r.question_text, answer: r.answer_text,
      mark: num(r.mark), explanation: r.explanation || '',
    })),
    events: events
      .map(e => ({ type: e.type, t: num(e.t), payload: safeParse(e.payload_json, {}) }))
      .sort((a, b) => a.t - b.t),
    llm,
    coupon: coupon ? { code: coupon.code, amount: num(coupon.amount), status: coupon.status, created_at: num(coupon.created_at) } : null,
  };
}

async function report({ attempt_id }) {
  if (!attempt_id) return { status: 400, body: { error: 'validation' } };
  const bundle = await reportBundle(attempt_id);
  if (!bundle) return { status: 404, body: { error: 'not_found' } };
  return { body: { report: bundle } };
}

// --- список пользователей с попытками ---
async function users() {
  const us = await repo.listUsers();
  const out = [];
  for (const u of us) {
    const attempts = await repo.listAttemptsAdmin(u.id);
    out.push({
      id: u.id, login: u.login, role: u.role, created_at: num(u.created_at),
      attempts: attempts.map(a => ({
        id: a.id, level_id: a.level_id, status: a.status, stake: num(a.stake),
        pass_number: num(a.pass_number), created_at: num(a.created_at), updated_at: num(a.updated_at),
      })),
    });
  }
  return { body: { users: out } };
}

// --- экономика ЛЛМ: по дням, по пользователям, суммы, алёрт за сегодня ---
async function economy() {
  const rows = await repo.listAllLlmReviews();
  const days = new Map();
  const usersMap = new Map();
  const total = { calls: 0, tokens_in: 0, tokens_out: 0, rub: 0 };
  for (const r of rows) {
    const day = dayKey(r.created_at);
    const rub = num(r.cost_rub);
    const ti = num(r.tokens_in), to = num(r.tokens_out);
    if (!days.has(day)) days.set(day, { date: day, calls: 0, tokens_in: 0, tokens_out: 0, rub: 0 });
    const d = days.get(day);
    d.calls++; d.tokens_in += ti; d.tokens_out += to; d.rub = round2(d.rub + rub);
    if (!usersMap.has(r.user_id)) usersMap.set(r.user_id, { user_id: r.user_id, calls: 0, tokens_in: 0, tokens_out: 0, rub: 0 });
    const u = usersMap.get(r.user_id);
    u.calls++; u.tokens_in += ti; u.tokens_out += to; u.rub = round2(u.rub + rub);
    total.calls++; total.tokens_in += ti; total.tokens_out += to; total.rub = round2(total.rub + rub);
  }
  const today = dayKey(Date.now());
  const todayRow = days.get(today);
  return {
    body: {
      days: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      by_user: [...usersMap.values()].sort((a, b) => b.rub - a.rub),
      total,
      today: todayRow || { date: today, calls: 0, tokens_in: 0, tokens_out: 0, rub: 0 },
      alert: !!(todayRow && todayRow.rub > C.dailyAlertRub),
    },
  };
}

// --- вейт-лист ---
async function waitlist() {
  const rows = await repo.listWaitlist();
  return { body: { waitlist: rows.map(w => ({ id: w.id, name: w.name, contact: w.contact, status: w.status, created_at: num(w.created_at) })) } };
}

// Одобрение заявки: новый invite с лимитом 1, заявка → approved.
async function waitlistApprove({ id }) {
  if (!id) return { status: 400, body: { error: 'validation' } };
  const w = await repo.getWaitlist(id);
  if (!w) return { status: 404, body: { error: 'not_found' } };
  if (w.status === 'approved') return { status: 409, body: { error: 'already_approved' } };
  const code = inviteCode();
  await repo.createInvite(code, 1);
  await repo.setWaitlistStatus(id, 'approved');
  return { body: { ok: true, invite: { code, limit: 1 }, waitlist: { id, status: 'approved' } } };
}

function _setRepo(r) { repo = r; }

module.exports = { report, reportBundle, users, economy, waitlist, waitlistApprove, inviteCode, _setRepo };
