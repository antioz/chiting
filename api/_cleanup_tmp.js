const { ready, query, V } = require('./lib/db');
(async () => {
  await ready();
  const u = await query("SELECT id, login FROM users WHERE login = $l", { $l: V.s('seedtest-t4') });
  if (u[0].length) {
    const uid = u[0][0].id;
    await query('DELETE FROM attempts WHERE user_id = $id', { $id: V.s(uid) });
    await query('DELETE FROM events WHERE user_id = $id', { $id: V.s(uid) });
    await query('DELETE FROM users WHERE id = $id', { $id: V.s(uid) });
    console.log('user deleted:', uid);
  } else console.log('user not found');
  await query("UPDATE invites SET used_count = 0 WHERE code = $c", { $c: V.s('TEST-10') });
  const i = await query("SELECT code, used_count FROM invites WHERE code = $c", { $c: V.s('TEST-10') });
  console.log('invite:', JSON.stringify(i[0][0]));
})().catch(e => { console.error(e); process.exit(1); });
