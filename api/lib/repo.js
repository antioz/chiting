// Тонкие обёртки над YDB queryClient (паттерн из merch-api).
// Данные — декларативные запросы; транзакционность — через db.tx (см. lib/db.js).
const db = require('./db');

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
    'INSERT INTO attempts (id, user_id, level_id, stake, status, pass_number, socratic_count, iterations, created_at, updated_at) VALUES ($id, $u, $l, $st, $s, $pn, $sc, $it, $ca, $ua)',
    { $id: db.V.s(a.id), $u: db.V.s(a.user_id), $l: db.V.s(a.level_id), $st: db.V.u32(a.stake), $s: db.V.s(a.status), $pn: db.V.u32(a.pass_number), $sc: db.V.u32(a.socratic_count), $it: db.V.u32(a.iterations), $ca: db.V.u64(a.created_at), $ua: db.V.u64(a.updated_at) }
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

function safeParse(j, dflt) { try { return typeof j === 'string' ? JSON.parse(j) : (j || dflt); } catch { return dflt; } }

module.exports = { execute, getUserByLogin, createUser, inviteUse, waitlistAdd, levels, answerBases, lastApprovedAttempt, getLevel, getAttempt, createAttempt, upsertAnswer, getAnswers, setAttemptStatus, addEvent };
