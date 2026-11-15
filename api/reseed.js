// Контент-пересид: удаляет старый сид (пересказ «Человек-невидимка») и ставит 4 дословных
// текста (Чехов, Куприн, Ферсман, Перельман) + 4 уровня (П2/П5 × художка/текст-знание).
// Идемпотентен: новые строки — REPLACE INTO, старый контент — явный DELETE по id.
// Миграция texts.full_source_url: ALTER TABLE с игнором «колонка уже есть».
// Запуск: set -a; source ../.env; set +a;
//   YDB_ACCESS_TOKEN_CREDENTIALS=$(~/yandex-cloud/bin/yc iam create-token) node reseed.js
const { ready, query, getDriver, V } = require('./lib/db');
const { hash } = require('./lib/handlers/auth');
const { TEXTS, LEVELS, ANSWER_BASES, REFLECTIVE_TEMPLATES } = require('./seed-content');

const RUBRIC_VERSION = 'v3-2026-11-15';

// Правила (§2 методологии) — формулировки совпадают с прежним сидом, version обновляем.
const RULES = [
  { code: 'П2', kid: 'Скажи о чём текст одной фразой, своими словами', strict: 'I.2: выразить суть прочитанного одной фразой, переведя мысль автора на свой язык (не пересказывая всё подряд)' },
  { code: 'П5', kid: 'Найди 2–3 слова, без которых текст не работает, и объясни их значение', strict: 'II.1: найти ключевые слова автора и договориться об их значениях из контекста (термин — слово в определённом значении)' },
];

// Старый контент (пересказ Гарин-Михайловского) — что удаляем при каждом прогоне.
const OLD = {
  textIds: ['text-tema-nevidimka'],
  levelIds: ['lvl-p2-1', 'lvl-p5-1'],
  answerBaseIds: [
    'lvl-p2-1:q1', 'lvl-p2-1:q2', 'lvl-p2-1:q3', 'lvl-p2-1:q4', 'lvl-p2-1:q5',
    'lvl-p5-1:q1', 'lvl-p5-1:q2', 'lvl-p5-1:q3', 'lvl-p5-1:q4', 'lvl-p5-1:q5',
  ].map(q => 'ab-' + q.replace(':', '-')),
};

async function ensureColumn() {
  try {
    const d = await getDriver();
    await d.queryClient.do({ fn: async sess => { await sess.execute({ text: 'ALTER TABLE texts ADD COLUMN full_source_url Utf8' }); } });
    console.log('migrate: texts.full_source_url добавлена');
  } catch (e) {
    if (/already exists|duplicated/i.test(String(e && e.message))) {
      console.log('migrate: texts.full_source_url уже есть');
    } else {
      throw e;
    }
  }
}

async function purgeOld() {
  for (const id of OLD.levelIds) {
    await query('DELETE FROM levels WHERE id = $id', { $id: V.s(id) });
  }
  for (const id of OLD.answerBaseIds) {
    await query('DELETE FROM answer_bases WHERE id = $id', { $id: V.s(id) });
  }
  for (const id of OLD.textIds) {
    await query('DELETE FROM texts WHERE id = $id', { $id: V.s(id) });
  }
  console.log('purge: старый пересказ удалён (текст, 2 уровня, 10 answer_bases)');
}

async function main() {
  await ready();

  await ensureColumn();

  await query('REPLACE INTO invites (code, used_count, `limit`, active) VALUES ($c, $uc, $l, $a)',
    { $c: V.s('TEST-10'), $uc: V.u32(0), $l: V.u32(10), $a: V.b(true) });
  console.log('invites: TEST-10 ok');

  for (const r of RULES) {
    await query('REPLACE INTO rules (code, kid_formulation, strict_formulation, version) VALUES ($c, $k, $s, $v)',
      { $c: V.s(r.code), $k: V.s(r.kid), $s: V.s(r.strict), $v: V.s(RUBRIC_VERSION) });
  }
  console.log('rules:', RULES.map(r => r.code).join(', '));

  await purgeOld();

  for (const t of TEXTS) {
    await query('REPLACE INTO texts (id, title, author, body_json, fragments_json, checklist_score, source, full_source_url) VALUES ($id, $t, $a, $b, $f, $cs, $s, $fu)',
      { $id: V.s(t.id), $t: V.s(t.title), $a: V.s(t.author), $b: V.j(t.body), $f: V.j(t.fragments), $cs: V.u32(t.checklist_score), $s: V.s(t.source), $fu: V.s(t.full_source_url) });
    console.log('text:', t.id, t.body.length, 'абзацев');
  }

  for (const l of LEVELS) {
    await query('REPLACE INTO levels (id, rule_code, text_id, questions_json, delay_hours, difficulty) VALUES ($id, $rc, $ti, $q, $d, $df)',
      { $id: V.s(l.id), $rc: V.s(l.rule_code), $ti: V.s(l.text_id), $q: V.j(l.questions), $d: V.u32(l.delay_hours), $df: V.u32(l.difficulty) });
    console.log('level:', l.id, `(${l.questions.length} вопросов, правило ${l.rule_code})`);
  }

  for (const ab of ANSWER_BASES) {
    await query('REPLACE INTO answer_bases (id, level_qid, kind, etalon, clusters_json, version) VALUES ($id, $lq, $k, $e, $cj, $v)',
      { $id: V.s('ab-' + ab.level_qid.replace(':', '-')), $lq: V.s(ab.level_qid), $k: V.s(ab.kind), $e: V.s(ab.etalon), $cj: V.j(ab.clusters), $v: V.s(RUBRIC_VERSION) });
  }
  for (const [levelQid, tpl] of REFLECTIVE_TEMPLATES) {
    await query('REPLACE INTO answer_bases (id, level_qid, kind, etalon, clusters_json, version) VALUES ($id, $lq, $k, $e, $cj, $v)',
      { $id: V.s('ab-' + levelQid.replace(':', '-')), $lq: V.s(levelQid), $k: V.s('reflective'), $e: V.s(''), $cj: V.j({ form_template: tpl }), $v: V.s(RUBRIC_VERSION) });
  }
  console.log('answer_bases:', ANSWER_BASES.length, 'закрытых +', REFLECTIVE_TEMPLATES.length, 'рефлексивных');

  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminPass) {
    await query('REPLACE INTO users (id, login, pass_hash, role, family_id, invite_code, created_at) VALUES ($id, $l, $h, $r, $f, $ic, $ca)',
      { $id: V.s('admin-root'), $l: V.s('admin'), $h: V.s(hash(adminPass)), $r: V.s('admin'), $f: V.s('admin-root'), $ic: V.s(''), $ca: V.u64(Date.now()) });
    console.log('user: admin (role=admin)');
  } else {
    console.log('user: admin ПРОПУЩЕН (нет ADMIN_PASSWORD в env)');
  }

  // Проверка чтением
  const lv = await query('SELECT id, rule_code, text_id FROM levels ORDER BY difficulty');
  const ab = await query('SELECT COUNT(*) AS n FROM answer_bases');
  const tx = await query('SELECT id, full_source_url FROM texts');
  console.log('verify: levels =', JSON.stringify(lv[0].map(r => [r.id, r.rule_code, r.text_id])));
  console.log('verify: answer_bases =', ab[0][0].n, ', texts =', tx[0].map(r => r.id + (r.full_source_url ? ' (+url)' : ' (БЕЗ url!)')).join(', '));
  console.log('reseed done');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
