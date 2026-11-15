const { ready } = require('./lib/db');
const C = require('./lib/config');

const routes = {}; // a -> async (params, ctx) => obj|Response

async function handler(event) {
  const p = event.queryStringParameters || event.queryStringParams || {};
  const a = p.a || '';
  const headersRaw = event.headers || {};
  const headersLow = {};
  for (const k of Object.keys(headersRaw)) headersLow[k.toLowerCase()] = headersRaw[k];
  const origin = headersLow['origin'] || '';
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
