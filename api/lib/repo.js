// Тонкие обёртки над YDB queryClient (паттерн из merch-api).
// Данные — декларативные запросы; транзакционность — через db.tx (см. lib/db.js).
const db = require('./db');
const { TypedValues } = require('./db');

async function execute(yql, params = {}) { await db.ready(); return db.query(yql, params); }

// --- users ---
async function getUserByLogin(login) {
  const rs = await execute('SELECT * FROM users WHERE login = $l', { $l: db.V.s(login) });
  return rs[0] && rs[0][0];
}
async function createUser(u) {
  await execute(
    'INSERT INTO users (id, login, pass_hash, role, family_id, invite_code, created_at) VALUES ($id, $l, $h, $r, $f, $ic, $ca)',
    { $id: db.V.s(u.id), $l: db.V.s(u.login), $h: db.V.s(u.pass_hash), $r: db.V.s(u.role), $f: db.V.s(u.family_id), $ic: db.V.s(u.invite_code || ''), $ca: db.V.u64(u.created_at) }
  );
}

// --- invites ---
// Атомарный инкремент: чтение + проверка лимита + запись в serializable-транзакции;
// при конфликте блокировок db.tx повторяет fn целиком — used_count не потеряется.
async function inviteUse(code) {
  return db.tx(async run => {
    const rs = await run('SELECT used_count, `limit`, active FROM invites WHERE code = $c', { $c: db.V.s(code) });
    const inv = rs[0] && rs[0][0];
    if (!inv || !inv.active || Number(inv.used_count) >= Number(inv.limit)) return { ok: false };
    await run('UPDATE invites SET used_count = used_count + CAST(1 AS Uint32) WHERE code = $c', { $c: db.V.s(code) });
    return { ok: true };
  });
}

// --- waitlist ---
async function waitlistAdd(w) {
  await execute(
    'INSERT INTO waitlist (id, name, contact, created_at, status) VALUES ($id, $n, $ct, $ca, $s)',
    { $id: db.V.s(w.id), $n: db.V.s(w.name), $ct: db.V.s(w.contact || ''), $ca: db.V.u64(w.created_at), $s: db.V.s(w.status || 'new') }
  );
}

// --- review (task-6) ---
// Текст уровня целиком: body_json — Json (массив абзацев/фрагментов).
async function getText(id) {
  const rs = await execute('SELECT * FROM texts WHERE id = $i', { $i: db.V.s(id) });
  return rs[0] && rs[0][0];
}
// Лимит LLM-вызовов — на ВСЕ записи attempt (не только scope='pack').
async function countLlmReviews(attemptId) {
  const rs = await execute('SELECT COUNT(*) AS n FROM llm_reviews WHERE attempt_id = $a', { $a: db.V.s(attemptId) });
  const row = rs[0] && rs[0][0];
  return row ? Number(row.n) : 0;
}
// Одна запись = один LLM-вызов (pack — один вызов на весь пакет, qid='pack').
// REPLACE INTO: повторный review после 502 (клиентский ретрай) перезаписывает
// запись с тем же PK (attempt_id, iteration, scope, qid) — без PK-конфликта,
// число строк по attempt не растёт → лимит countLlmReviews не ломается.
async function addLlmReview(r) {
  await execute(
    `REPLACE INTO llm_reviews (attempt_id, iteration, scope, qid, criteria_json, total, final_mark, verdict, explanation,
                              rubric_version, request_json, response_json, tokens_in, tokens_out, cost_rub, t_spent, created_at)
     VALUES ($a, $it, $sc, $q, $cj, $to, $fm, $v, $e, $rv, $req, $resp, $ti, $tout, $c, $ts, $ca)`,
    {
      $a: db.V.s(r.attempt_id), $it: db.V.u32(r.iteration || 0), $sc: db.V.s(r.scope), $q: db.V.s(r.qid || 'pack'),
      $cj: db.V.j(r.criteria_json || []), $to: db.V.u32(r.total || 0), $fm: db.V.u32(r.final_mark || 0),
      $v: db.V.s(r.verdict || ''), $e: db.V.s(r.explanation || ''), $rv: db.V.s(r.rubric_version || ''),
      $req: db.V.j(r.request_json || {}), $resp: db.V.j(r.response_json || {}),
      $ti: db.V.u64(r.tokens_in || 0), $tout: db.V.u64(r.tokens_out || 0), $c: TypedValues.double(Number(r.cost_rub) || 0),
      $ts: db.V.u64(r.t_spent || 0), $ca: db.V.u64(Date.now()),
    }
  );
}
// Итог ревью пакета: статус (socratic/reflection) + marks_json {qid:{mark,total,explanation}} + zero_qids_json.
async function updateAttemptReview(id, r) {
  await execute(
    'UPDATE attempts SET status = $s, marks_json = $m, zero_qids_json = $z, updated_at = $ua WHERE id = $i',
    { $s: db.V.s(r.status), $m: db.V.j(r.marks_json || {}), $z: db.V.j(r.zero_qids_json || []), $ua: db.V.u64(r.updated_at || Date.now()), $i: db.V.s(id) }
  );
}

// --- контент уровней ---
// join levels + rules + texts; questions_json — массив вопросов (§3.3 методологии).
async function levels() {
  const rs = await execute(
    `SELECT l.id AS id, l.rule_code AS rule_code, l.text_id AS text_id, l.questions_json AS questions_json, l.delay_hours AS delay_hours, l.difficulty AS difficulty,
            r.kid_formulation AS rule_kid, r.strict_formulation AS rule_strict,
            t.title AS text_title, t.author AS text_author, t.full_source_url AS text_full_source_url
     FROM levels AS l
     JOIN rules AS r ON r.code = l.rule_code
     JOIN texts AS t ON t.id = l.text_id
     ORDER BY l.difficulty ASC`
  );
  return (rs[0] || []).map(o => ({ ...o, questions: safeParse(o.questions_json, []) }));
}

async function answerBases(levelId) {
  const rs = await execute(
    "SELECT * FROM answer_bases WHERE level_qid LIKE $p ORDER BY level_qid",
    { $p: db.V.s(levelId + ':%') }
  );
  return (rs[0] || []).map(o => ({ ...o, clusters: safeParse(o.clusters_json, []) }));
}

// --- попытки (для статуса доступности уровня) ---
async function lastApprovedAttempt(userId, levelId) {
  const rs = await execute(
    "SELECT updated_at FROM attempts WHERE user_id = $u AND level_id = $l AND status = 'approved' ORDER BY updated_at DESC LIMIT 1",
    { $u: db.V.s(userId), $l: db.V.s(levelId) }
  );
  return rs[0] && rs[0][0];
}

// --- попытки, ответы, события ---
async function getLevel(id) {
  const rs = await execute('SELECT id FROM levels WHERE id = $i', { $i: db.V.s(id) });
  return rs[0] && rs[0][0];
}
async function getAttempt(id) {
  const rs = await execute('SELECT * FROM attempts WHERE id = $i', { $i: db.V.s(id) });
  return rs[0] && rs[0][0];
}
async function createAttempt(a) {
  await execute(
    'INSERT INTO attempts (id, user_id, level_id, stake, status, pass_number, socratic_count, iterations, text_override, created_at, updated_at) VALUES ($id, $u, $l, $st, $s, $pn, $sc, $it, $to, $ca, $ua)',
    { $id: db.V.s(a.id), $u: db.V.s(a.user_id), $l: db.V.s(a.level_id), $st: db.V.u32(a.stake), $s: db.V.s(a.status), $pn: db.V.u32(a.pass_number), $sc: db.V.u32(a.socratic_count), $it: db.V.u32(a.iterations), $to: db.V.s(a.text_override || ''), $ca: db.V.u64(a.created_at), $ua: db.V.u64(a.updated_at) }
  );
}
// Одна запись на (attempt_id, qid): повторная отправка перезаписывает ответ.
async function upsertAnswer(attemptId, q) {
  await execute(
    'REPLACE INTO answers (attempt_id, qid, text_raw, typed_chars, pasted, t_answer, updated_at) VALUES ($a, $q, $t, $tc, $p, $ta, $ua)',
    { $a: db.V.s(attemptId), $q: db.V.s(q.qid), $t: db.V.s(q.text || ''), $tc: db.V.u32(q.keydown || 0), $p: db.V.b(!!q.pasted), $ta: db.V.u64(q.t_answer || 0), $ua: db.V.u64(Date.now()) }
  );
}
async function getAnswers(attemptId) {
  const rs = await execute('SELECT * FROM answers WHERE attempt_id = $a', { $a: db.V.s(attemptId) });
  return rs[0] || [];
}
async function setAttemptStatus(id, status, now) {
  await execute(
    'UPDATE attempts SET status = $s, updated_at = $ua WHERE id = $i',
    { $s: db.V.s(status), $ua: db.V.u64(now), $i: db.V.s(id) }
  );
}
// Монотонность t в пределах инстанса: PK events (user_id, t) — два события в одну
// миллисекунду дали бы "Conflict with existing key", поэтому t не убывает.
let lastEventT = 0;
async function addEvent(userId, attemptId, type, payload, t) {
  t = Math.max(Number(t) || 0, Date.now(), lastEventT + 1);
  // PK events (user_id, t): при параллельных инстансах t может совпасть — поднимаем и повторяем.
  for (let attempt = 0; ; attempt++) {
    try {
      await execute(
        'INSERT INTO events (user_id, attempt_id, type, payload_json, t) VALUES ($u, $a, $ty, $p, $t)',
        { $u: db.V.s(userId), $a: db.V.s(attemptId), $ty: db.V.s(type), $p: db.V.j(payload || {}), $t: db.V.u64(t) }
      );
      lastEventT = t;
      return;
    } catch (e) {
      if (attempt < 3 && /Conflict with existing key|Constraint violated|PreconditionFailed/i.test(String(e && e.message))) { t = ++lastEventT; continue; }
      throw e;
    }
  }
}

// --- сократовский цикл (task-7) ---
// Шаги наводящих вопросов по (attempt, qid). PK (attempt_id, qid, step):
// ask пишет question_text, answer дописывает child_answer тем же UPSERT.
async function countSocraticTurns(attemptId, qid) {
  const rs = await execute('SELECT COUNT(*) AS n FROM socratic_turns WHERE attempt_id = $a AND qid = $q', { $a: db.V.s(attemptId), $q: db.V.s(qid) });
  const row = rs[0] && rs[0][0];
  return row ? Number(row.n) : 0;
}
async function getSocraticTurns(attemptId, qid) {
  const rs = await execute('SELECT * FROM socratic_turns WHERE attempt_id = $a AND qid = $q ORDER BY step ASC', { $a: db.V.s(attemptId), $q: db.V.s(qid) });
  return rs[0] || [];
}
async function addSocraticTurn(t) {
  await execute(
    'UPSERT INTO socratic_turns (attempt_id, qid, step, question_text, child_answer, llm_call_ref, created_at) VALUES ($a, $q, $st, $qt, $ca, $ref, $ts)',
    { $a: db.V.s(t.attempt_id), $q: db.V.s(t.qid), $st: db.V.u32(t.step), $qt: db.V.s(t.question_text || ''), $ca: db.V.s(t.child_answer || ''), $ref: db.V.s(t.llm_call_ref || ''), $ts: db.V.u64(t.created_at || Date.now()) }
  );
}
// Последняя pack-запись: оттуда достаём criteria нулевого вопроса (zeroCriteria для промпта сократа).
async function getLastLlmReview(attemptId, scope) {
  const rs = await execute(
    'SELECT * FROM llm_reviews WHERE attempt_id = $a AND scope = $s ORDER BY created_at DESC LIMIT 1',
    { $a: db.V.s(attemptId), $s: db.V.s(scope) }
  );
  return rs[0] && rs[0][0];
}

// --- лестница итераций (task-9) ---
// Итерации считаются на attempt; next() инкрементит, на пороге — split (новый attempt).
async function bumpIterations(id, n, now) {
  await execute(
    'UPDATE attempts SET iterations = $n, updated_at = $ua WHERE id = $i',
    { $n: db.V.u32(n), $ua: db.V.u64(now || Date.now()), $i: db.V.s(id) }
  );
}
// События attempt (hint-ротация, split, журнал пути участника).
async function listEvents(attemptId) {
  const rs = await execute('SELECT * FROM events WHERE attempt_id = $a', { $a: db.V.s(attemptId) });
  return rs[0] || [];
}
// Последний незакрытый attempt пользователя на уровне (для /levels: пометка разбивки).
async function lastOpenAttempt(userId, levelId) {
  const rs = await execute(
    "SELECT * FROM attempts WHERE user_id = $u AND level_id = $l AND status != 'approved' ORDER BY created_at DESC LIMIT 1",
    { $u: db.V.s(userId), $l: db.V.s(levelId) }
  );
  return rs[0] && rs[0][0];
}

// --- рефлексия и купоны (task-8) ---
// Одна запись на (attempt_id, qid): повторный reflect (ребёнок переписал нулевые) — REPLACE.
// question_text/answer_text/explanation — для полного отчёта админки по прохождению.
async function addReflectionAnswer(attemptId, q) {
  await execute(
    'REPLACE INTO reflection_answers (attempt_id, qid, question_text, answer_text, mark, explanation, created_at) VALUES ($a, $q, $qt, $at, $m, $e, $ca)',
    { $a: db.V.s(attemptId), $q: db.V.s(q.qid), $qt: db.V.s(q.question_text || ''), $at: db.V.s(q.answer_text || ''), $m: db.V.u32(q.mark || 0), $e: db.V.s(q.explanation || ''), $ca: db.V.u64(Date.now()) }
  );
}
async function getReflectionAnswers(attemptId) {
  const rs = await execute('SELECT * FROM reflection_answers WHERE attempt_id = $a ORDER BY qid', { $a: db.V.s(attemptId) });
  return rs[0] || [];
}
// Атомарное «insert-if-not-exists»: конкурентные approve одного attempt не создают
// второй купон (гард WHERE NOT EXISTS применяется к актуальному состоянию таблицы
// внутри одного запроса YQL). Реальный attempt_id в PK добавлять не нужно.
async function createCoupon(c) {
  await execute(
    'INSERT INTO coupons (id, user_id, attempt_id, amount, status, code, created_at) ' +
    'SELECT $id, $u, $a, $am, $s, $c, $ca WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE attempt_id = $a)',
    { $id: db.V.s(c.id), $u: db.V.s(c.user_id), $a: db.V.s(c.attempt_id), $am: db.V.u32(c.amount), $s: db.V.s(c.status), $c: db.V.s(c.code), $ca: db.V.u64(c.created_at) }
  );
}
async function getCouponByAttempt(attemptId) {
  const rs = await execute('SELECT * FROM coupons WHERE attempt_id = $a', { $a: db.V.s(attemptId) });
  return rs[0] && rs[0][0];
}
async function listCoupons(userId) {
  const rs = await execute('SELECT code, amount, status, created_at FROM coupons WHERE user_id = $u ORDER BY created_at DESC', { $u: db.V.s(userId) });
  return rs[0] || [];
}
async function listUserAttempts(userId) {
  const rs = await execute('SELECT id, level_id, status, updated_at FROM attempts WHERE user_id = $u ORDER BY updated_at DESC', { $u: db.V.s(userId) });
  return rs[0] || [];
}

function safeParse(j, dflt) { try { return typeof j === 'string' ? JSON.parse(j) : (j || dflt); } catch { return dflt; } }

module.exports = { execute, getUserByLogin, createUser, inviteUse, waitlistAdd, levels, answerBases, lastApprovedAttempt, getLevel, getAttempt, createAttempt, upsertAnswer, getAnswers, setAttemptStatus, addEvent, getText, countLlmReviews, addLlmReview, updateAttemptReview, countSocraticTurns, addSocraticTurn, getSocraticTurns, getLastLlmReview, addReflectionAnswer, getReflectionAnswers, createCoupon, getCouponByAttempt, listCoupons, listUserAttempts, bumpIterations, listEvents, lastOpenAttempt };
