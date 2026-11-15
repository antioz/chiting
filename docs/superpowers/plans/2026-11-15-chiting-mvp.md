# «Читинг» MVP — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочее веб-приложение «читинг»: регистрация по инвайту → 2 уровня (правило П2 и П5 Адлера × 1 текст) → пакет вопросов → оценка YandexGPT по рубрикатору v3 → сократовский цикл → рефлексия → купон; админка с дословными ответами, экономикой и выгрузкой HTML.

**Architecture:** Как у merch-api (Antiosov): одна Yandex Cloud Function (Node.js 18, HTTP-триггер, маршрутизация `?a=`, тело/ответ JSON, CORS для фронта), данные в YDB serverless (новая БД `chiting`), ключ YandexGPT только на сервере (.env → переменные функции). Фронтенд — статика в этом же репо (`app/`), GitHub Pages `https://antiosov.github.io/chiting/app/`; функция разрешает CORS для этого origin.

**Tech Stack:** Node.js 18 (без фреймворков, как merch-api), YDB serverless (SDK `@yandex-cloud/ydb-sdk`), Yandex Cloud Functions, YandexGPT API (fetch, `Api-Key`), JWT (HMAC, кастомная lib как в merch-api `lib/jwt.js`), нативный JS фронтенд (без сборки, один `app/index.html` + модули).

## Global Constraints

- Репо: `antioz/chiting`, ветка `main`, каждый таск — коммит, в конце сообщения: `Co-Authored-By: Claude Code <noreply@anthropic.com>`; push в конце каждого таска.
- `.env` НЕ в git (в .gitignore); ключ `YANDEX_GPT_API_KEY` уже создан (сервисный аккаунт `chiting-gpt`), лежит в `/Users/imac/Documents/новый/projects/chiting/.env`.
- Лимит: **12 вызовов ЛЛМ на attempt** (оценка пакета 1 + до 4 шагов сократовского цикла ×2 вызова + резерв 3). Порог разбивки: итераций ≥ 4. В конфиге, не в коде.
- Рубрикатор v3: 5 критериев × 0–2 (Форма задания, Точность, Привязка к тексту, Свои слова, Осмысленность); итог задания: 0 (есть критерий=0 ИЛИ сумма≤3, блокирует) / 1 (нет нулей, 4–6) / 2 (нет нулей, ≥7). Апрув пакета: ни одного итогового 0 + выполненный блок рефлексии.
- Сократовский цикл: максимум 4 наводящих вопроса подряд на задание; ЛЛМ только спрашивает (пост-фильтр: ответ содержит финальную формулировку → отклонить, сгенерировать заново).
- Античит: запрет paste на полях (фронт), серверная проверка `typed_ratio` (введённых символов из событий клавиатуры ≥ 0,9 длины ответа — фронт шлёт счётчик keydown), детект одинаковых ответов.
- Цены/экономика: yandexgpt-lite ~0,2 ₽/1k токенов (вход+выход); worst case attempt ≈ 12–14 ₽.
- Язык интерфейса и текстов — русский. Стиль фронта — Roblox (яркие цвета, крупные формы, без бежевого, одна шкала шрифтов).
- Тексты и вопросы двух уровней — контент из методологии v3 (П2 «суть в одном предложении», П5 «ключевые слова»); источник текста — классика 5 класса.
- Тесты: `node --test` (встроенный раннер), без внешних зависимостей для тестов.

## File Structure

```
chiting/
├── api/                      # бэкенд (Cloud Function)
│   ├── index.js              # точка входа, маршрутизация ?a=
│   ├── package.json
│   ├── schema.yql            # DDL таблиц YDB
│   ├── deploy.sh             # zip + yc serverless function update
│   ├── lib/
│   │   ├── db.js             # YDB сессия, queryClient
│   │   ├── jwt.js            # sign/verify (HMAC SHA-256)
│   │   ├── config.js         # env → конфиг (лимиты, пороги, model uri)
│   │   ├── llm.js            # вызов YandexGPT (completion) + подсчёт токенов/руб
│   │   ├── prompts.js        # сборка промптов (pack-оценка, socratic-вопрос, reflection)
│   │   ├── rubric.js         # парсинг оценки ЛЛМ → итог 0/1/2
│   │   └── anticheat.js      # typed_ratio, детект копипаста
│   └── test/
│       ├── rubric.test.js
│       ├── anticheat.test.js
│       ├── prompts.test.js
│       └── jwt.test.js
├── app/                      # фронтенд (GitHub Pages)
│   ├── index.html            # одностраничник: регистрация/кабинет/читалка/вопросы/результат/купон
│   ├── app.js                # состояние, роутинг экранов, API-клиент
│   └── style.css             # стиль Roblox
├── .env                      # НЕ в git (ключ YANDEX_GPT_API_KEY, FOLDER_ID)
└── .gitignore                # .env, api/node_modules, *.zip
```

Таблицы YDB (все `PRIMARY KEY` первым ключом):
- `users (id, login, pass_hash, role, family_id, invite_code, created_at)`
- `invites (code, used_count, limit, active)`
- `waitlist (id, name, contact, created_at, status)`
- `texts (id, title, author, body_json, fragments_json, checklist_score, source)`
- `rules (code, kid_formulation, strict_formulation, version)`
- `levels (id, rule_code, text_id, questions_json, delay_hours, difficulty)` — questions_json: `[{qid, type, text, fragment_ref, form_spec, answer_base_id}]`
- `answer_bases (id, level_qid, kind, etalon, clusters_json, version)`
- `attempts (id, user_id, level_id, stake, status, pass_number, socratic_count, iterations, created_at, updated_at)` — status: reading|answering|socratic|reflection|approved|split
- `answers (attempt_id, qid, text_raw, typed_chars, pasted, t_answer, updated_at)` — PK (attempt_id, qid)
- `llm_reviews (attempt_id, iteration, scope, qid, criteria_json, total, final_mark, verdict, explanation, rubric_version, tokens_in, tokens_out, cost_rub, t_spent, created_at)` — PK (attempt_id, iteration, scope, qid)
- `socratic_turns (attempt_id, qid, step, question_text, child_answer, llm_call_ref, created_at)` — PK (attempt_id, qid, step)
- `reflection_answers (attempt_id, qid, text_raw, mark, created_at)` — PK (attempt_id, qid)
- `coupons (id, user_id, attempt_id, amount, status, code, created_at)`
- `events (user_id, attempt_id, type, payload_json, t)` — type: read_start|read_end|switch_text|switch_questions|hint|socratic_question|socratic_answer|iterate|split

Эндпоинты (`?a=`): `register`, `login`, `levels`, `attempt` (POST create), `answers` (POST), `review` (POST), `socratic` (POST), `reflect` (POST), `iterate` (POST), `export` (GET, HTML), `coupons` (GET), `admin/answers`, `admin/economy`, `admin/waitlist`, `admin/waitlist/approve`. Все кроме register/login — JWT (Bearer). Админ-эндпоинты — роль admin (первый пользователь с login `admin` из .env ADMIN_PASSWORD, создаётся миграцией-сиды).

---

### Task 1: Инфраструктура — БД, сервисный аккаунт, функция-скелет

**Files:**
- Create: `api/package.json`, `api/index.js`, `api/deploy.sh`, `api/schema.yql`, `api/lib/config.js`, `api/lib/db.js`, `.gitignore`

- [ ] **Step 1: Создать YDB database `chiting`** (serverless, тот же каталог `b1gkm69jqok5o2cpgn0p`):

```bash
~/yandex-cloud/bin/yc ydb database create chiting --serverless --folder-id b1gkm69jqok5o2cpgn0p
~/yandex-cloud/bin/yc ydb database list
```
Expected: БД `chiting` в статусе RUNNING, endpoint вида `grpcs://ydb.serverless.yandexcloud.net:2135/?database=/ru-central1/b1gqspi79qu9qncaoa1r/<id>`. Записать в `.env` как `YDB_ENDPOINT`.

- [ ] **Step 2: Сервисный аккаунт и права** (chiting-gpt уже есть; добавить роль ydb.editor):

```bash
SA=ajevnvlet356h3d4ft2c
~/yandex-cloud/bin/yc resource-manager folder add-access-binding b1gkm69jqok5o2cpgn0p --role ydb.editor --subject serviceAccount:$SA
~/yandex-cloud/bin/yc serverless function create --name chiting-api --folder-id b1gkm69jqok5o2cpgn0p
```

- [ ] **Step 3: Файлы скелета**

`api/package.json`:
```json
{
  "name": "chiting-api",
  "version": "0.1.0",
  "main": "index.js",
  "scripts": {
    "test": "node --test test/",
    "deploy": "bash deploy.sh"
  },
  "dependencies": {
    "@yandex-cloud/ydb-sdk": "^5.2.0"
  },
  "engines": { "node": ">=18" }
}
```

`api/lib/config.js`:
```js
module.exports = {
  ydbEndpoint: process.env.YDB_ENDPOINT,
  ydbDb: process.env.YDB_DATABASE,
  secret: process.env.SECRET || 'dev-secret-change-me',
  yandexGptKey: process.env.YANDEX_GPT_API_KEY,
  yandexGptFolder: process.env.YANDEX_GPT_FOLDER_ID,
  yandexGptModel: process.env.YANDEX_GPT_MODEL || 'yandexgpt-lite',
  llmCallsLimit: Number(process.env.LLM_CALLS_LIMIT || 12),
  splitThreshold: Number(process.env.SPLIT_THRESHOLD || 4),
  socraticMaxSteps: Number(process.env.SOCRATIC_MAX_STEPS || 4),
  rubricVersion: 'v3-2026-11-15',
  tokenPriceRubPer1k: Number(process.env.TOKEN_PRICE || 0.2),
  adminPassword: process.env.ADMIN_PASSWORD,
  siteOrigins: ['https://antiosov.github.io', 'http://localhost:8000'],
};
```

`api/lib/db.js` (по образцу merch-api — скопировать паттерн оттуда):
```js
// Адаптировать из /Users/imac/Documents/новый/projects/Antiosov/merch-api/lib/db.js:
// - Driver({endpoint, database}), credentials из метаданных в облаке (YDB_METADATA_CREDENTIALS=1)
//   или IAM-токена локально (YDB_ACCESS_TOKEN_CREDENTIALS=1 + yc iam create-token)
// - Экспорт: tableClient, queryClient (Yql), сессионный кеш, готовность await ready
```
Реализация: скопировать `merch-api/lib/db.js` → переименовать переменные, убрать S3/специфику мерча. Функция `ready()` — await перед каждым запросом.

`api/index.js` (скелет маршрутизации):
```js
const { ready } = require('./lib/db');
const C = require('./lib/config');

const routes = {}; // a -> async (params, ctx) => obj|Response

async function handler(event) {
  const p = event.queryStringParams || {};
  const a = p.a || '';
  const origin = (event.headers || {})['Origin'] || '';
  const cors = C.siteOrigins.some(o => origin.startsWith(o)) ? origin : C.siteOrigins[0];
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': cors, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    await ready();
    const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};
    const fn = routes[a];
    if (!fn) return { statusCode: 404, headers, body: JSON.stringify({ error: 'not_found' }) };
    const out = await fn({ ...p, ...body }, event);
    return { statusCode: out.status || 200, headers, body: typeof out.body === 'string' ? out.body : JSON.stringify(out) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'internal' }) };
  }
}
module.exports.handler = handler;
module.exports.routes = routes; // тесты и регистрация маршрутов
```

`api/schema.yql`:
```sql
CREATE TABLE users (id Utf8, login Utf8, pass_hash Utf8, role Utf8, family_id Utf8, invite_code Utf8, created_at Uint64, PRIMARY KEY (id));
CREATE TABLE invites (code Utf8, used_count Uint32, `limit` Uint32, active Bool, PRIMARY KEY (code));
CREATE TABLE waitlist (id Utf8, name Utf8, contact Utf8, created_at Uint64, status Utf8, PRIMARY KEY (id));
CREATE TABLE texts (id Utf8, title Utf8, author Utf8, body_json Json, fragments_json Json, checklist_score Uint32, source Utf8, PRIMARY KEY (id));
CREATE TABLE rules (code Utf8, kid_formulation Utf8, strict_formulation Utf8, version Utf8, PRIMARY KEY (code));
CREATE TABLE levels (id Utf8, rule_code Utf8, text_id Utf8, questions_json Json, delay_hours Uint32, difficulty Uint32, PRIMARY KEY (id));
CREATE TABLE answer_bases (id Utf8, level_qid Utf8, kind Utf8, etalon Utf8, clusters_json Json, version Utf8, PRIMARY KEY (id));
CREATE TABLE attempts (id Utf8, user_id Utf8, level_id Utf8, stake Uint32, status Utf8, pass_number Uint32, socratic_count Uint32, iterations Uint32, created_at Uint64, updated_at Uint64, PRIMARY KEY (id));
CREATE TABLE answers (attempt_id Utf8, qid Utf8, text_raw Utf8, typed_chars Uint32, pasted Bool, t_answer Uint64, updated_at Uint64, PRIMARY KEY (attempt_id, qid));
CREATE TABLE llm_reviews (attempt_id Utf8, iteration Uint32, scope Utf8, qid Utf8, criteria_json Json, total Uint32, final_mark Uint32, verdict Utf8, explanation Utf8, rubric_version Utf8, tokens_in Uint64, tokens_out Uint64, cost_rub Double, t_spent Uint64, created_at Uint64, PRIMARY KEY (attempt_id, iteration, scope, qid));
CREATE TABLE socratic_turns (attempt_id Utf8, qid Utf8, step Uint32, question_text Utf8, child_answer Utf8, llm_call_ref Utf8, created_at Uint64, PRIMARY KEY (attempt_id, qid, step));
CREATE TABLE reflection_answers (attempt_id Utf8, qid Utf8, text_raw Utf8, mark Uint32, created_at Uint64, PRIMARY KEY (attempt_id, qid));
CREATE TABLE coupons (id Utf8, user_id Utf8, attempt_id Utf8, amount Uint32, status Utf8, code Utf8, created_at Uint64, PRIMARY KEY (id));
CREATE TABLE events (user_id Utf8, attempt_id Utf8, type Utf8, payload_json Json, t Uint64, PRIMARY KEY (user_id, t));
```

`api/deploy.sh` (по образцу merch-api/deploy.sh):
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"
npm install --omit=dev
rm -f ../chiting-api.zip
zip -rq ../chiting-api.zip . -x "test/*" -x node_modules/.cache
cd ..
~/yandex-cloud/bin/yc serverless function version create --function-name chiting-api \
  --runtime nodejs18 --entrypoint index.handler --memory 256m --execution-timeout 30 \
  --source-path chiting-api.zip \
  --environment YDB_ENDPOINT="$YDB_ENDPOINT",YDB_DATABASE="$YDB_DATABASE",SECRET="$SECRET",YANDEX_GPT_API_KEY="$YANDEX_GPT_API_KEY",YANDEX_GPT_FOLDER_ID="$YANDEX_GPT_FOLDER_ID",YANDEX_GPT_MODEL="${YANDEX_GPT_MODEL:-yandexgpt-lite}",ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  --folder-id b1gkm69jqok5o2cpgn0p
```
(переменные из `.env` подхватываются: `set -a; source ../.env; set +a` в начале)

`.gitignore` (дополнить): `.env`, `node_modules/`, `*.zip`.

- [ ] **Step 4: Применить схему**
```bash
source .env
~/yandex-cloud/bin/yc ydb database sql --name chiting --folder-id b1gkm69jqok5o2cpgn0p -f api/schema.yql
```
(если CLI не выполняет DDL — путь как в merch-api: YDB CLI `ydb -e $YDB_ENDPOINT -d $YDB_DATABASE --token-file <(~/yandex-cloud/bin/yc iam create-token) yql -f api/schema.yql`)

- [ ] **Step 5: Деплой скелета и проверка**
```bash
cd api && npm install && bash deploy.sh
curl -s "https://functions.yandexcloud.net/<id>?a=health"
```
Expected: `404 not_found` (маршрута нет, но отвечает функция, не 5xx).

- [ ] **Step 6: Коммит + push**

---

### Task 2: lib/jwt + lib/rubric + lib/anticheat (TDD)

**Files:**
- Create: `api/lib/jwt.js`, `api/lib/rubric.js`, `api/lib/anticheat.js`
- Test: `api/test/jwt.test.js`, `api/test/rubric.test.js`, `api/test/anticheat.test.js`

**Interfaces:**
- Produces: `jwt.sign(payload, ttlSec)`, `jwt.verify(token) → payload|null`
- Produces: `rubric.finalMark(criteria) → {total, mark}` — criteria: массив 5 чисел 0–2; mark: 0|1|2
- Produces: `rubric.parseLlmJson(text) → {criteria, explanation}` — парсит JSON из ответа ЛЛМ, толерантно к обёрткам (```json и пр.)
- Produces: `anticheat.typedRatio(answer) → number` (из событий: `keydownCount/answer.length`), `anticheat.isSuspicious(answers[]) → bool` (одинаковые ответы / пустые / typed_ratio < 0,9)

- [ ] **Step 1: Написать тесты**

`api/test/rubric.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const rubric = require('../lib/rubric');
test('итог 0: есть критерий = 0', () => { assert.deepStrictEqual(rubric.finalMark([0,2,2,2,2]), {total:8, mark:0}); });
test('итог 0: сумма <= 3', () => { assert.deepStrictEqual(rubric.finalMark([1,1,0,1,0]), {total:3, mark:0}); });
test('итог 1: нет нулей, сумма 4-6', () => { assert.deepStrictEqual(rubric.finalMark([1,2,1,1,1]), {total:6, mark:1}); });
test('итог 2: нет нулей, сумма >= 7', () => { assert.deepStrictEqual(rubric.finalMark([2,2,1,2,1]), {total:8, mark:2}); });
test('parseLlmJson вынимает JSON из markdown-обёртки', () => {
  const txt = 'Вот оценка:\n```json\n{"criteria":[2,1,2,2,1],"explanation":"хорошо"}\n```';
  assert.deepStrictEqual(rubric.parseLlmJson(txt), {criteria:[2,1,2,2,1], explanation:'хорошо'});
});
test('parseLlmJson null при мусоре', () => { assert.strictEqual(rubric.parseLlmJson('нет json'), null); });
```

`api/test/anticheat.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const ac = require('../lib/anticheat');
test('typedRatio: ручной ввод 1.0', () => assert.strictEqual(ac.typedRatio({text:'привет мир', keydown:10}), 1.0));
test('typedRatio: вставка половины', () => assert.strictEqual(ac.typedRatio({text:'привет мир', keydown:5}), 0.5));
test('isSuspicious: одинаковые ответы', () => assert.strictEqual(ac.isSuspicious([{text:'а'},{text:'а'}]), true));
test('isSuspicious: разные ручные ответы — ок', () => assert.strictEqual(ac.isSuspicious([{text:'а',keydown:1},{text:'б',keydown:1}]), false));
```

`api/test/jwt.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('../lib/jwt');
jwt.init('test-secret');
test('sign/verify roundtrip', () => { const t = jwt.sign({id:'u1',role:'child'}, 3600); assert.deepStrictEqual(jwt.verify(t), {id:'u1',role:'child'}); });
test('verify чужого секрета — null', () => { const t = jwt.sign({id:'x'}, 100); jwt.init('other'); assert.strictEqual(jwt.verify(t), null); jwt.init('test-secret'); });
test('verify мусора — null', () => assert.strictEqual(jwt.verify('abc.def'), null));
```

- [ ] **Step 2: Запустить, убедиться что падают** — `cd api && npm test` → FAIL (модулей нет).

- [ ] **Step 3: Реализации**

`api/lib/jwt.js` (по образцу merch-api/lib/jwt.js — HMAC-SHA256, base64url, формат `h.payload.sig`):
```js
const crypto = require('crypto');
let SECRET = '';
function init(secret) { SECRET = secret; }
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function sign(payload, ttlSec) {
  const h = b64url(JSON.stringify({ alg: 'HS256' }));
  const p = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + ttlSec }));
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
function verify(token) {
  try {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) return null;
    const expect = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}
module.exports = { init, sign, verify };
```

`api/lib/rubric.js`:
```js
function finalMark(criteria) {
  const total = criteria.reduce((a, b) => a + b, 0);
  if (criteria.includes(0) || total <= 3) return { total, mark: 0 };
  if (total >= 7) return { total, mark: 2 };
  return { total, mark: 1 };
}
function parseLlmJson(text) {
  const m = String(text).match(/\{[\s\S]*"criteria"[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!Array.isArray(o.criteria) || o.criteria.length !== 5 || !o.criteria.every(x => [0,1,2].includes(x))) return null;
    return { criteria: o.criteria, explanation: String(o.explanation || '').slice(0, 2000) };
  } catch { return null; }
}
module.exports = { finalMark, parseLlmJson };
```

`api/lib/anticheat.js`:
```js
function typedRatio(a) { return a.text.length === 0 ? 0 : Math.min(1, (a.keydown || 0) / a.text.length); }
function isSuspicious(answers) {
  const texts = answers.map(a => (a.text || '').trim()).filter(Boolean);
  if (texts.length === 0) return true;
  const uniq = new Set(texts.map(t => t.toLowerCase()));
  if (uniq.size < texts.length) return true; // одинаковые ответы на разные вопросы
  if (texts.some((t, i) => t.length > 40 && (answers[i].pasted || typedRatio(answers[i]) < 0.9))) return true;
  return false;
}
module.exports = { typedRatio, isSuspicious };
```

- [ ] **Step 4: `npm test` → все PASS. Step 5: коммит + push.**

---

### Task 3: lib/llm + lib/prompts (TDD на сборке промптов, живой вызов — вручную)

**Files:**
- Create: `api/lib/llm.js`, `api/lib/prompts.js`
- Test: `api/test/prompts.test.js`

**Interfaces:**
- Produces: `llm.complete(systemPrompt, userText) → {text, tokensIn, tokensOut, costRub}`
- Produces: `prompts.packReview({rule, questions, answers, answerBases}) → {system, user}`
- Produces: `prompts.socraticQuestion({rule, question, childAnswer, zeroCriteria, attempts}) → {system, user}` (system запрещает выдавать ответ; attempts — число предыдущих попыток, при >1 — добавить «задан другой тип вопроса»)
- Produces: `prompts.reflection({questions, answers}) → {system, user}`

- [ ] **Step 1: Тесты на prompts**

`api/test/prompts.test.js` (проверяем: промпт пакета содержит правило, все вопросы, все ответы, эталоны; сократовский промпт содержит запрет выдавать ответ, цитирует ответ ребёнка, один вопрос; тип вопроса выбирается циклически из 4):
```js
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/prompts');
const rule = { kid_formulation: 'Скажи суть одним предложением' };
const questions = [{qid:'q1', text:'О чём текст одной фразой?', type:'сжатие'}];
const answers = [{qid:'q1', text:'О мальчике который украл'}];
const bases = [{level_qid:'q1', etalon:'О встрече, изменившей мальчика'}];
test('packReview включает правило, вопросы, ответы, эталон', () => {
  const p = P.packReview({rule, questions, answers, answerBases: bases});
  assert.match(p.system, /Скажи суть одним предложением/);
  assert.match(p.user, /q1/);
  assert.match(p.user, /О мальчике который украл/);
  assert.match(p.user, /О встрече, изменившей мальчика/);
});
test('socraticQuestion: запрет ответа + цитирование + один вопрос', () => {
  const p = P.socraticQuestion({rule, question: questions[0], childAnswer: 'О мальчике', zeroCriteria: ['Точность'], attempts: 0});
  assert.match(p.system, /НЕ сообщай правильный ответ/);
  assert.match(p.user, /О мальчике/);
  assert.strictEqual((p.user.match(/\?/g) || []).length, 1);
});
test('типы сократовских вопросов цикличны', () => {
  const t = i => P.socraticQuestion({rule, question: questions[0], childAnswer: 'x', zeroCriteria: ['Точность'], attempts: i}).user;
  assert.match(t(0), /что ты имеешь в виду|уточни/i);
  assert.match(t(1), /откуда ты решил|почему ты так решил/i);
  assert.match(t(2), /почему|следствие/i);
  assert.match(t(3), /покажи место в тексте/i);
});
```

- [ ] **Step 2: Реализация `prompts.js`**

```js
const SOCRATIC_TYPES = [
  'уточнение: спроси «что ты имеешь в виду, когда пишешь…?» — цитируя его слова',
  'предположение: спроси «откуда ты решил, что…?» — о его исходной догадке',
  'причина/следствие: спроси «почему герой поступил так, а не иначе?» — о причине в тексте',
  'пример: попроси «покажи место в тексте, где это видно» — конкретный фрагмент',
];
function packReview({rule, questions, answers, answerBases}) {
  const system = `Ты — проверяющий понимание текста для детей 10 лет (метод Адлера, курс «читинг`). Правило уровня: «${rule.kid_formulation}». Оцени каждый ответ по 5 критериям 0–2: [Соответствие форме задания, Точность (пересказ не подменяет смысл), Привязка к тексту, Свои слова (нет копии слов автора), Осмысленность]. Ответ строго в JSON: {"results":[{"qid":"...","criteria":[0-2,0-2,0-2,0-2,0-2],"explanation":"1-2 предложения"},{"qid":...}]}. Ничего кроме JSON.`;
  const qas = questions.map(q => {
    const a = answers.find(x => x.qid === q.qid) || {};
    const b = answerBases.find(x => x.level_qid === q.qid);
    return `ВОПРОС ${q.qid} (${q.type}): ${q.text}\nЭТАЛОН/ДОПУСТИМОЕ: ${b ? b.etalon : 'открытый вопрос — проверяй форму и осмысленность'}\nОТВЕТ РЕБЁНКА: ${a.text || '(пусто)'}`;
  }).join('\n---\n');
  return { system, user: qas };
}
function socraticQuestion({rule, question, childAnswer, zeroCriteria, attempts}) {
  const type = SOCRATIC_TYPES[Math.min(attempts, SOCRATIC_TYPES.length - 1) % SOCRATIC_TYPES.length];
  const system = `Ты ведёшь сократовский диалог с ребёнком 10 лет (shared inquiry: ведущий ТОЛЬКО спрашивает). Твоя задача — помочь ему самому дойти до правильного ответа. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО сообщать правильный ответ, намекать на него прямо, пересказывать эталон. Задай РОВНО ОДИН короткий наводящий вопрос. Тип вопроса: ${type}. Нулевые критерии ответа: ${zeroCriteria.join(', ')}. Ответь одним вопросом, без вступлений.`;
  const user = `Правило уровня: «${rule.kid_formulation}». Задание: ${question.text}\nОтвет ребёнка: «${childAnswer}»\nЗадай один вопрос.`;
  return { system, user };
}
function reflection({questions, answers}) {
  const system = 'Ты проверяешь блок рефлексии ребёнка 10 лет. Критерии НЕ правильности, а полноценности: ответ по теме вопроса, осмысленный, не пустой, не набор случайных слов. Оцени каждый ответ 0–2 (0 — мусор/пусто/не по теме, 1 — бедно но по теме, 2 — полноценно). Ответ строго JSON: {"results":[{"qid":"...","mark":0|1|2,"explanation":"..."}]}.';
  const user = questions.map((q, i) => `ВОПРОС ${q.qid}: ${q.text}\nОТВЕТ: ${(answers[i] || {}).text || '(пусто)'}`).join('\n---\n');
  return { system, user };
}
module.exports = { packReview, socraticQuestion, reflection, SOCRATIC_TYPES };
```

- [ ] **Step 3: `npm test` → PASS.**

- [ ] **Step 4: `api/lib/llm.js`**

```js
const C = require('./config');
async function complete(systemPrompt, userText) {
  const res = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
    method: 'POST',
    headers: { 'Authorization': `Api-Key ${C.yandexGptKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelUri: `gpt://${C.yandexGptFolder}/${C.yandexGptModel}`,
      completionOptions: { stream: false, temperature: 0.2, maxTokens: 2000 },
      messages: [{ role: 'system', text: systemPrompt }, { role: 'user', text: userText }],
    }),
  });
  if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const alt = data.result.alternatives[0];
  const tokensIn = Number(data.result.usage.inputTextTokens || 0);
  const tokensOut = Number(data.result.usage.completionTokens || 0);
  return { text: alt.message.text, tokensIn, tokensOut, costRub: ((tokensIn + tokensOut) / 1000) * C.tokenPriceRubPer1k };
}
module.exports = { complete };
```

- [ ] **Step 5: Ручная проверка живого вызова** (из корня репо, с локальным env):
```bash
set -a && source .env && set +a && node -e "
const llm=require('./api/lib/llm');
llm.complete('Отвечай одним словом','Продолжи: чтение — это').then(r=>console.log(r.text, r.costRub+' ₽'));"
```
Expected: осмысленное слово, costRub число > 0. **Внимание: этот вызов тратит реальные деньги (~<1 ₽) — это разово и допустимо.**

- [ ] **Step 6: Коммит + push.**

---

### Task 4: Регистрация, логин, сид контента (2 уровня), маршрут health

**Files:**
- Modify: `api/index.js` (регистрация маршрутов register/login/health/levels), Create: `api/lib/handlers/auth.js`, `api/seed.js`, `api/lib/repo.js`

**Interfaces:**
- Produces repo-функции: `repo.getUserByLogin(login)`, `repo.createUser(u)`, `repo.inviteUse(code) → bool` (атомарный инкремент used_count при лимите), `repo.waitlistAdd(w)`, `repo.levels() → [{id, rule, text, questions, delay_hours}]` (join texts+rules), `repo.answerBases(levelId)`
- Produces JWT-контекст: `ctx.user = {id, role}` из Bearer (middleware в index.js)

- [ ] **Step 1: `api/lib/repo.js`** — тонкие обёртки над queryClient: `execute(query, params)` с автоматическим ready, плюс typed-запросы выше. UPSERT-семантика для answers/attempts (`REPLACE INTO`).

- [ ] **Step 2: `api/lib/handlers/auth.js`**

```js
const crypto = require('crypto');
const jwt = require('../jwt'); const repo = require('../repo');
async function register({ name, password, invite }) {
  if (!name || !password || String(password).length < 4) return { status: 400, body: { error: 'validation' } };
  if (await repo.getUserByLogin(name)) return { status: 409, body: { error: 'login_taken' } };
  const used = await repo.inviteUse(invite);
  if (!used.ok) {
    await repo.waitlistAdd({ id: crypto.randomUUID(), name, contact: '', created_at: Date.now(), status: 'new' });
    return { status: 403, body: { error: 'waitlist' } };
  }
  const user = { id: crypto.randomUUID(), login: name, pass_hash: hash(password), role: 'child', family_id: crypto.randomUUID(), invite_code: invite, created_at: Date.now() };
  await repo.createUser(user);
  return { body: { token: jwt.sign({ id: user.id, role: user.role }, 86400 * 30) } };
}
async function login({ name, password }) {
  const u = await repo.getUserByLogin(name);
  if (!u || u.pass_hash !== hash(password)) return { status: 401, body: { error: 'bad_credentials' } };
  return { body: { token: jwt.sign({ id: u.id, role: u.role }, 86400 * 30) } };
}
function hash(s) { return crypto.createHash('sha256').update(String(s) + (process.env.SECRET || '')).digest('hex'); }
module.exports = { register, login };
```
(Админ: при миграции-сиды создать пользователя `admin` из `ADMIN_PASSWORD` с role=admin.)

- [ ] **Step 3: Middleware auth в `index.js`:** для всех маршрутов кроме register/login/health: `ctx.user = jwt.verify(Bearer)`; нет → 401. role=admin для `admin/*`.

- [ ] **Step 4: `api/seed.js`** — наполнение:
- invites: код `TEST-10`, limit 10, active.
- rules: П2 («Скажи о чём текст одной фразой, своими словами»), П5 («Найди 2–3 слова, без которых текст не работает, и объясни их значение») — формулировки из docs/metodologiya.html §2.
- texts: 1 текст (короткая классика 5 класса, общественное достояние — выбор исполнителя из методологии §4: например, рассказ из программы, ~3–5 стр.; тело в body_json как массив абзацев, fragments_json — 3–5 смысловых фрагментов с id).
- levels: 2 уровня на этом тексте (rule_code П2 и П5), questions_json по 5 вопросов типов Т1–Т5 из методологии §3 (с формулировками, fragment_ref, form_spec), delay_hours=24.
- answer_bases: для каждого закрытого вопроса — эталон + 3–5 кластеров допустимых формулировок; для рефлексивных — form_template.
Запуск: `node seed.js` локально с env. **Контент вопросов и эталонов писать строго по методологии v3 (docs/metodologiya.html §3, примеры §3.7).**

- [ ] **Step 5: `GET /levels`** — список из 2 уровней для ребёнка: id, название правила (kid_formulation), название текста, delay_hours, статус доступности (по времени последнего approved attempt).

- [ ] **Step 6: Проверка вживую:** регистрация curl (успех с TEST-10, waitlist с неверным кодом), логин, /levels с токеном.

- [ ] **Step 7: Коммит + push.**

---

### Task 5: Attempt, чтение, ответы, события

**Files:**
- Create: `api/lib/handlers/attempts.js`; Modify: `api/index.js`

**Interfaces:**
- Produces: `attempt.create({user, level_id, stake})` (статус reading, ставка 1–100000 ₽), `attempt.answers({user, id, answers:[{qid,text,keydown,pasted,t_answer}]})` → античит-проверка, UPSERT в answers, events, статус → answering, `attempt.event({user, id, type, payload})` — read_start/read_end/switch/hint

- [ ] **Step 1: Тест античит-интеграции** (`api/test/attempts.test.js`): `isSuspicious` вызывается на приёме; pasted=true на длинном ответе → 422 `{error:'suspicious'}` и events-запись `anticheat_flag`.
- [ ] **Step 2: Реализация attempts.js (код выше по Interfaces; UPSERT, транзакция не обязательна — одна запись на qid).**
- [ ] **Step 3: curl-проверка полного потока: create attempt → send answers → events.**
- [ ] **Step 4: Коммит + push.**

---

### Task 6: Review — оценка пакета ЛЛМ (ядро)

**Files:**
- Create: `api/lib/handlers/review.js`; Modify: `api/index.js`

**Interfaces:**
- Consumes: prompts.packReview, llm.complete, rubric.finalMark/parseLlmJson, repo (attempt, answers, answer_bases, levels, texts)
- Produces: `review.pack({user, id})` → лимит 12 вызовов на attempt (счётчик по llm_reviews), сохранение llm_reviews scope=pack, выставление попытке статуса: есть нули → status=socratic + `{zero_qids, marks:{qid:{mark, explanation}}}`; нет нулей → status=reflection.

- [ ] **Step 1: Тест на разбор ответа ЛЛМ** — мок llm.complete (подмена через dependency injection: `review.setLlm(mockFn)`): parseLlmJson→finalMark→итоговые отметки; нули → socratic; без нулей → reflection.
- [ ] **Step 2: Реализация: подсчёт вызовов (`SELECT COUNT(*) FROM llm_reviews WHERE attempt_id`), лимит 12 → 429 `{error:'llm_limit'}`; сбор контекста (текст целиком — он короткий, RAG-MVP по ТЗ 3в); запись events `review`.
- [ ] **Step 3: Живая проверка (тратит ~2 ₽):** curl review на тестовом attempt с настоящим ответом → убедиться, что marks корректны, llm_reviews записан с tokens/cost.
- [ ] **Step 4: Коммит + push.**

---

### Task 7: Сократовский цикл

**Files:**
- Create: `api/lib/handlers/socratic.js`; Modify: `api/index.js`

**Interfaces:**
- Consumes: prompts.socraticQuestion, llm.complete, repo (socratic_turns, attempts, llm_reviews)
- Produces: `socratic.ask({user, id, qid})` → `{question}` (1 вызов), шаг записан; `socratic.answer({user, id, qid, text})` → запись ответа, ребёнок переписывает финальный ответ через answers → повторный review scope=socratic; шагов ≤ 4 на qid; пост-фильтр: вопрос ЛЛМ содержит эталон (проверка подстроками из answer_bases.etalon) → отклонить, повторить генерацию (макс 2 раза).

- [ ] **Step 1: Тест пост-фильтра и лимита шагов** (мок llm): эталон в вопросе → повтор; 5-й шаг → 429.
- [ ] **Step 2: Реализация.**
- [ ] **Step 3: Коммит + push.**

---

### Task 8: Рефлексия, апрув, купон

**Files:**
- Create: `api/lib/handlers/finish.js`; Modify: `api/index.js`

**Interfaces:**
- Produces: `finish.reflect({user, id, answers})` — оценка ЛЛМ (scope=reflection), запись reflection_answers; `finish.approve(attempt)` — если нет нулей: купон (code 8-значный), status=approved, событие; `GET /coupons` — кабинет ребёнка (купоны + попытки).

- [ ] **Step 1: Тест: апрув только при нулях=0 и выполненной рефлексии; купон создаётся с amount=ставкой.**
- [ ] **Step 2: Реализация + curl.**
- [ ] **Step 3: Коммит + push.**

---

### Task 9: Iterate (подсказка-крючок → разбивка), экономика

**Files:**
- Create: `api/lib/handlers/iterate.js`; Modify: `api/index.js`, `api/seed.js` (фрагменты как мини-тексты)

**Interfaces:**
- Produces: `iterate.hint({user, id, qid})` — крючок из методологии (по правилу и типу вопроса; доступен всегда, событие hint); `iterate.next({user, id})` — iterations+1; при iterations ≥ 4: новый attempt с коротким фрагментом текста (pass_number+1, статус reading).

- [ ] **Step 1: Тест лестницы: 4 итерации → split. Step 2: Реализация. Step 3: curl. Step 4: Коммит + push.**

---

### Task 10: Админка API: ответы, экономика, вейт-лист, экспорт HTML

**Files:**
- Create: `api/lib/handlers/admin.js`, `api/lib/export.js`

**Interfaces:**
- Produces: `GET admin/answers?user_id=` → дословно все ответы, оценки, socratic_turns, events по попыткам; `GET admin/economy` → агрегация llm_reviews по дням (date, calls, tokens, rub) + по user + суммы + алёрт при превышении лимита; `GET admin/waitlist`, `POST admin/waitlist/approve {id}` → новый invite; `GET attempts/:id/export` → автономный HTML (стили inline, печать в PDF): шапка (ребёнок, уровень, ставка, даты), все ответы+оценки, сократовский диалог диалогом, рефлексия, тайминги, сумма руб.

- [ ] **Step 1: Тест экспорта: HTML содержит ответы, оценки, сумму. Step 2: Реализация. Step 3: curl + открыть export-HTML в браузере. Step 4: Коммит + push.**

---

### Task 11: Фронтенд — каркас и экраны

**Files:**
- Create: `app/index.html`, `app/app.js`, `app/style.css`

Экраны (роутинг по состоянию, без history API): **(1) вход/регистрация** (имя, пароль, код-приглашение; ошибка waitlist — понятный текст); **(2) выбор задания** — 2 карточки (правило, текст, поле «ставка, ₽», кнопка «Начать»; заблокированная карточка «Откроется завтра»); **(3) читалка+вопросы** — две вкладки «Текст»/«Вопросы», свободное переключение, таймер чтения, 5 полей с антипастом (JS: `input` listener, `paste` preventDefault, счётчик keydown), кнопка «Подсказка» всегда; **(4) результат** — карточки ✅/➕/❌, по ❌ — «Давай подумаем» + сократовский диалог (вопрос → поле ответа → «Переписать ответ»); **(5) рефлексия** — 2–3 вопроса; **(6) апрув** — анимация + купон (номинал, код, статус); **(7) кабинет** — купоны, история попыток. API-клиент: fetch на URL функции (константа в app.js), Bearer из localStorage. Стиль: Roblox — яркие плашки, крупные кнопки, без бежевого.

- [ ] **Step 1: style.css + каркас index.html (все экраны-заглушки, переключение видимости).**
- [ ] **Step 2: app.js — API-клиент + экраны 1–2 против живого бэка (curl пройденных эндпоинтов).**
- [ ] **Step 3: Экраны 3–6: читалка, антикопипаст, сократовский диалог, рефлексия, купон.**
- [ ] **Step 4: Кабинет. Step 5: `python3 -m http.server` в корне → полный проход руками в браузере (взрослым, на тестовом аккаунте). Step 6: Коммит + push.**

---

### Task 12: Контент: финальные тексты и вопросы 2 уровней + базы ответов

**Files:**
- Modify: `api/seed.js` (дополнить/заменить контент), данные в YDB через повторный seed

- [ ] **Step 1: Подобрать 1 рассказ по чек-листу §4 методологии (классика 5 класса, ~3–5 стр., программа 11-летки); вопросы 2 уровней (5+5) строго по типам Т1–Т5 и операциям; эталоны и кластеры формулировок; form_template для рефлексивных.**
- [ ] **Step 2: Пересид + ручной прогон обоих уровней взрослым в браузере (по сценарию из проектирования §4а), проверка оценок ЛЛМ на адекватность.**
- [ ] **Step 3: Коммит + push.**

---

### Task 13: E2E «в бою» + экономика факт

**Files:**
- Modify: `docs/` (финальная заметка о запуске)

- [ ] **Step 1: Полный цикл на проде: регистрация → 2 уровня → купон → export-HTML → admin/economy. Проверить: деньги в кабинете облака сходятся с admin/economy (раздел «Биллинг» → детализация за день).**
- [ ] **Step 2: Записать в README.md: живой URL функции, URL приложения, как вызвать админку, лимиты и конфиг.**
- [ ] **Step 3: Коммит + push. Отчёт пользователю.**

---

## Self-Review

- **Spec coverage:** TZ v4 §3 (цикл, античит, RAG-MVP, рефлексия) → Tasks 5–9; §5 кабинеты → Task 8, 11; §6 купон → Task 8; §7 регистрация/вейт-лист → Tasks 4, 10; §8 платформа (YDB, YandexGPT, бэкенд) → Tasks 1–3; §9 экономика+метрики → Tasks 6–10 (llm_reviews.cost, admin/economy); §10 Roblox → Task 11; §11 DoD → Task 13. Графика/рисовалка — вне MVP (фаза 2). Окно «следующий уровень не сразу» → delay_hours в levels + проверка в Task 4/8.
- **Placeholder scan:** контент вопросов Task 12 не кодируется в плане заранее — он берётся из docs/metodologiya.html §3.7 (это указано); остальное — код полный.
- **Type consistency:** имена repo-функций едины между Task 4–10; llm.complete → {text,tokensIn,tokensOut,costRub} используется в 6–8; rubric.finalMark/parseLlmJson — в 6; jwt.init из конфига в index.js.
