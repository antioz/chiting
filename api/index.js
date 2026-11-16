const { ready } = require('./lib/db');
const C = require('./lib/config');
const jwt = require('./lib/jwt');
const repo = require('./lib/repo');
const auth = require('./lib/handlers/auth');
const attempts = require('./lib/handlers/attempts');
const review = require('./lib/handlers/review');

// SECRET из env функции; jwt.init при холодном старте (index.js грузится один раз на инстанс).
jwt.init(process.env.SECRET || C.secret);

const routes = {}; // a -> async (params, ctx) => obj|Response

// Маршруты без авторизации: регистрация, логин, health.
const PUBLIC = new Set(['register', 'login', 'health']);

routes.register = p => auth.register(p);
routes.login = p => auth.login(p);
routes.health = async () => ({ body: { ok: true, rubric_version: C.rubricVersion } });

// Attempt-контур: создание, приём ответов, события чтения. Все — только со своим attempt (иначе 404).
routes['attempt-create'] = (p, ctx) => attempts.create({ user: ctx.user, level_id: p.level_id, stake: p.stake });
routes['attempt-answers'] = (p, ctx) => attempts.answers({ user: ctx.user, id: p.id, answers: p.answers });
routes['attempt-event'] = (p, ctx) => attempts.event({ user: ctx.user, id: p.id, type: p.type, payload: p.payload });

// Оценка пакета ответов ЛЛМ (task-6): лимит llmCallsLimit вызовов на attempt, статус socratic/reflection.
routes['review'] = (p, ctx) => review.pack({ user: ctx.user, id: p.id });

// Список уровней для ребёнка: правило (kid_formulation), текст, delay_hours и доступность
// по времени последнего approved-прохода (§6 методологии: проход = правило на текст).
routes.levels = async (_p, ctx) => {
  const list = await repo.levels();
  const out = [];
  for (const l of list) {
    const last = await repo.lastApprovedAttempt(ctx.user.id, l.id);
    const delayMs = Number(l.delay_hours) * 3600 * 1000;
    const locked = !!last && (Date.now() - Number(last.updated_at)) < delayMs;
    out.push({
      id: l.id, rule_code: l.rule_code, rule: l.rule_kid,
      text_id: l.text_id, text_title: l.text_title, text_author: l.text_author,
      full_source_url: l.text_full_source_url || null,
      delay_hours: Number(l.delay_hours),
      available: !locked,
      available_at: locked ? Number(last.updated_at) + delayMs : null,
    });
  }
  return { body: { levels: out } };
};

async function handler(event) {
  const p = event.queryStringParameters || event.queryStringParams || {};
  const a = p.a || '';
  const headersRaw = event.headers || {};
  const headersLow = {};
  for (const k of Object.keys(headersRaw)) headersLow[k.toLowerCase()] = headersRaw[k];
  const origin = headersLow['origin'] || '';
  const cors = C.siteOrigins.some(o => origin.startsWith(o)) ? origin : C.siteOrigins[0];
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': cors, 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Auth-Token', 'Access-Control-Allow-Methods': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    await ready();
    const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};
    const fn = routes[a];
    if (!fn) return { statusCode: 404, headers, body: JSON.stringify({ error: 'not_found' }) };
    // Middleware auth: всё, кроме register/login/health — только по JWT.
    // ВАЖНО: заголовок Authorization: Bearer перехватывает платформа Yandex Cloud Functions
    // (пытается валидировать его как IAM-токен и отвечает платформенным 403) — поэтому
    // токен приложения принимаем в X-Auth-Token, Authorization — запасной вариант.
    const ctx = { event, user: null };
    if (!PUBLIC.has(a)) {
      const bearer = /^Bearer\s+(.+)$/i.exec(headersLow['authorization'] || '');
      const token = headersLow['x-auth-token'] || (bearer && bearer[1]);
      const payload = token && jwt.verify(token);
      if (!payload) return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
      ctx.user = { id: payload.id, role: payload.role };
      if (a.startsWith('admin') && payload.role !== 'admin') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'forbidden' }) };
      }
    }
    const out = await fn({ ...p, ...body }, ctx);
    const payload = out && out.body !== undefined ? out.body : out;
    return { statusCode: out.status || 200, headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'internal' }) };
  }
}
module.exports.handler = handler;
module.exports.routes = routes; // тесты и регистрация маршрутов
