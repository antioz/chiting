// YDB: драйвер кэшируется на уровне модуля (переживает вызовы функции в одном инстансе).
// ready()  — await перед каждым запросом из handler (гарантия инициализации драйвера).
// query()  — один YQL в авто-транзакции (serializable RW, commit); конфликт блокировок → повтор до 5 раз.
// tx(fn)   — интерактивная транзакция; fn(run) выполняет несколько YQL; конфликт
//            (ABORTED / locks invalidated) → повтор всей fn до 5 раз. Так реализуется
//            оптимистичная блокировка: «прочитал → проверил → записал».
//
// Адаптировано из merch-api/lib/ydb.js (паттерн БД проекта): вместо YDB_CONNECTION —
// пара YDB_ENDPOINT (grpcs://host:2135) + YDB_DATABASE (/ru-central1/…/<id>).
const { Driver, getCredentialsFromEnv, TypedValues, TypedData, AUTO_TX } = require('ydb-sdk');

const C = require('./config');

// connectionString вида grpcs://host:2135/<database>
function connectionString() {
  return `${C.ydbEndpoint.replace(/\/+$/, '')}/${C.ydbDb.replace(/^\/+/, '')}`;
}

let driverPromise = null;
function getDriver() {
  if (!driverPromise) {
    const d = new Driver({ connectionString: connectionString(), authService: getCredentialsFromEnv() });
    driverPromise = d.ready(10000).then(ok => {
      if (!ok) throw new Error('YDB not ready');
      return d;
    }).catch(e => { driverPromise = null; throw e; });
  }
  return driverPromise;
}

// Готовность перед запросом: в облаке — метаданные (YDB_METADATA_CREDENTIALS=1),
// локально — IAM-токен (YDB_ACCESS_TOKEN_CREDENTIALS=1 + YDB_ACCESS_TOKEN=$(yc iam create-token)).
async function ready() { await getDriver(); }

const rows = r => r.resultSets.map(rs => TypedData.createNativeObjects(rs).map(o => ({ ...o })));

// Serverless YDB при конфликте блокировок отвечает на commit не ABORTED, а NotFound «Transaction not found»
// (транзакция уже отменена сервером) — это тоже повод повторить fn целиком.
const isRetryable = e => /ABORTED|locks invalidated|Transaction locks|Transaction not found/i.test(String(e && (e.message || e)));
const pause = attempt => new Promise(r => setTimeout(r, 20 * attempt + Math.random() * 30));

async function query(yql, params = {}, retries = 5) {
  const d = await getDriver();
  for (let attempt = 0; ; attempt++) {
    try { return await d.tableClient.withSessionRetry(s => s.executeQuery(yql, params, AUTO_TX).then(rows)); }
    catch (e) { if (attempt < retries && isRetryable(e)) { await pause(attempt); continue; } throw e; }
  }
}

async function tx(fn, retries = 5) {
  const d = await getDriver();
  for (let attempt = 0; ; attempt++) {
    try {
      return await d.tableClient.withSession(async s => {
        const { id } = await s.beginTransaction({ serializableReadWrite: {} });
        const run = (yql, params = {}) => s.executeQuery(yql, params, { txId: id }).then(rows);
        try {
          const out = await fn(run);
          // Коммит через executeQuery(commitTx), а не s.commitTransaction(): у последнего в SDK зашит
          // @retryable с 10 повторами NotFound (~5 с), а конфликт блокировок как раз даёт NotFound.
          await s.executeQuery('SELECT 1;', {}, { txId: id, commitTx: true });
          return out;
        } catch (e) {
          // После ABORTED/NotFound транзакции на сервере уже нет — rollback только зря ждёт ретраи SDK (~4 с).
          if (!isRetryable(e)) { try { await s.rollbackTransaction({ txId: id }); } catch (_) { /* уже отменена */ } }
          throw e;
        }
      });
    } catch (e) {
      if (attempt < retries && isRetryable(e)) {
        await pause(attempt);
        continue;
      }
      throw e;
    }
  }
}

const V = {
  s: v => TypedValues.utf8(String(v)),
  i: v => TypedValues.int32(Number(v)),
  u32: v => TypedValues.uint32(Number(v)),
  u64: v => TypedValues.uint64(BigInt(v)),
  b: v => TypedValues.bool(!!v),
  ts: v => TypedValues.timestamp(v instanceof Date ? v : new Date(v)),
  j: v => TypedValues.json(JSON.stringify(v)),
};

module.exports = { ready, query, tx, V, TypedValues, getDriver };
