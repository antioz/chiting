// Чистка тестовых данных task-15: удаляет юзеров t15-*/e2e-* и всё связанное,
// сбрасывает invites.used_count по TEST-10 до 0.
// Запуск: set -a; source ../.env; set +a; YDB_ACCESS_TOKEN_CREDENTIALS=$(~/yandex-cloud/bin/yc iam create-token) node cleanup-t15.js
const { query } = require('./lib/db');

async function main() {
  const users = await query(`SELECT id, login FROM users WHERE login LIKE 't15-%' OR login LIKE 'e2e-%' OR login LIKE 't11_e2e_%'`);
  const ids = (users[0]||[]).map(r => r.id);
  console.log('test users:', ids.length, (users[0]||[]).map(r => r.login).join(', '));
  if (!ids.length) { console.log('ничего чистить'); }
  const inList = ids.map(id => `'${id}'`).join(',');
  if (ids.length) {
    const attempts = await query(`SELECT id FROM attempts WHERE user_id IN (${inList})`);
    const aIds = (attempts[0]||[]).map(r => r.id);
    console.log('attempts:', aIds.length);
    const aIn = aIds.length ? aIds.map(id => `'${id}'`).join(',') : null;
    if (aIds.length) {
      for (const t of ['answers', 'llm_reviews', 'socratic_turns', 'reflection_answers', 'events']) {
        await query(`DELETE FROM ${t} WHERE attempt_id IN (${aIn})`);
      }
      await query(`DELETE FROM coupons WHERE user_id IN (${inList})`);
      await query(`DELETE FROM attempts WHERE user_id IN (${inList})`);
    }
    await query(`DELETE FROM waitlist WHERE name LIKE 't15-%' OR name LIKE 'e2e-%'`);
    await query(`DELETE FROM users WHERE id IN (${inList})`);
  }
  await query(`UPDATE invites SET used_count = 0 WHERE code = 'TEST-10'`);
  const inv = await query(`SELECT code, used_count, \`limit\` FROM invites WHERE code = 'TEST-10'`);
  console.log('TEST-10:', JSON.stringify(inv[0]));
  const left = await query(`SELECT COUNT(*) AS c FROM users WHERE role != 'admin'`);
  console.log('non-admin users left:', JSON.stringify(left[0]));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
