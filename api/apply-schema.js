// Применение api/schema.yql к YDB. В отличие от merch-api, где работает `ydb` CLI,
// здесь DDL выполняется через SDK (yc ydb database sql отсутствует, ydb CLI не установлен).
// Локально: YDB_ACCESS_TOKEN_CREDENTIALS=1 + YDB_ACCESS_TOKEN=$(yc iam create-token).
// Каждая строка schema.yql — отдельный DDL-запрос (YQL в serverless не принимает мультивыражений).
const fs = require('fs');
const path = require('path');
const { ready, query, getDriver } = require('./lib/db');

(async () => {
  const file = path.join(__dirname, 'schema.yql');
  const statements = fs.readFileSync(file, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
  await ready();
  // DDL — через Query Service (table service data query DDL не принимает, SchemeService в SDK 5.x
  // не экспонирует CreateTable, `ydb` CLI и `yc ydb database sql` отсутствуют)
  const d = await getDriver();
  for (const s of statements) {
    try {
      await d.queryClient.do({ fn: async sess => { await sess.execute({ text: s }); } });
    } catch (e) {
      // CREATE TABLE существующей таблицы / ALTER ADD COLUMN существующей колонки — не ошибка.
      if (/path exist|already exist|duplicated/i.test(String(e && e.message))) { console.log('exists:', s.slice(0, 60)); continue; }
      throw e;
    }
    console.log('ok:', s.slice(0, 60));
  }
  console.log('schema applied:', statements.length, 'tables');
})().catch(e => { console.error(e); process.exit(1); });
