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

function safeParse(j, dflt) { try { return typeof j === 'string' ? JSON.parse(j) : (j || dflt); } catch { return dflt; } }

module.exports = { execute, getUserByLogin, createUser, inviteUse, waitlistAdd, levels, answerBases, lastApprovedAttempt };
