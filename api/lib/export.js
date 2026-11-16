// HTML-экспорт полного отчёта (task-10): автономный документ без внешних ресурсов.
// Белый фон, холодный акцент, одна шкала шрифтов, печать в PDF через браузер.
const admin = require('./handlers/admin');

const ACCENT = '#1d4ed8';       // холодный синий
const ACCENT_SOFT = '#eef4fb';  // холодный светлый тон подложек
const LINE = '#d8e2ee';
const INK = '#17202b';
const MUTE = '#5b6b7c';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtTime(ms) {
  const d = new Date(Number(ms) || 0);
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour12: false });
}
function fmtDur(ms) { return ((Number(ms) || 0) / 1000).toFixed(1) + ' с'; }
function fmtRub(n) { return (Number(n) || 0).toFixed(2) + ' ₽'; }

function meta(label, value) {
  return `<div class="meta"><span class="meta-k">${esc(label)}</span><span class="meta-v">${value}</span></div>`;
}
function badge(text, tone) {
  return `<span class="badge${tone ? ' ' + tone : ''}">${esc(text)}</span>`;
}

// Вопросы с ответами и оценками
function sectionQuestions(b) {
  const rows = b.questions.map((q, i) => {
    const ans = q.answer;
    const mark = q.mark;
    const criteria = (q.criteria || []).map(c =>
      `<div class="crit"><span class="crit-k">${esc(c.name)}</span><span class="crit-v${c.value === 0 ? ' zero' : ''}">${c.value}/2</span></div>`).join('');
    const socratic = q.socratic.length
      ? `<div class="turns">${q.socratic.map(t => `
          <div class="turn"><div class="turn-q"><b>Шаг ${t.step} — вопрос ЛЛМ:</b> ${esc(t.question)}</div>
          ${t.answer ? `<div class="turn-a"><b>Ответ ребёнка:</b> ${esc(t.answer)}</div>` : ''}</div>`).join('')}</div>`
      : '';
    return `<section class="q">
      <div class="q-head">
        <span class="q-num">Вопрос ${i + 1}</span>
        <span class="q-type">${esc(q.type)}</span>
        ${q.zero ? badge('нулевой ответ', 'warn') : ''}
        ${mark ? badge('оценка ' + mark.mark + ' / ' + mark.total, mark.mark === 0 ? 'warn' : 'ok') : ''}
      </div>
      <p class="q-text">${esc(q.text)}</p>
      ${q.form_spec ? `<p class="q-spec">Форма: <code>${esc(JSON.stringify(q.form_spec))}</code></p>` : ''}
      <div class="answer">
        <div class="ans-k">Ответ ребёнка (дословно)</div>
        ${ans ? `<div class="ans-t">${esc(ans.text_raw)}</div>
        <div class="ans-m">набрано символов: ${ans.keydown} · вставок: ${ans.pasted ? 'да' : 'нет'} · время ответа: ${fmtDur(ans.t_answer)}</div>`
        : '<div class="ans-t mute">(нет ответа)</div>'}
      </div>
      ${criteria ? `<div class="crits">${criteria}</div>` : ''}
      ${mark && mark.explanation ? `<p class="expl"><b>Комментарий ЛЛМ:</b> ${esc(mark.explanation)}</p>` : ''}
      ${socratic}
    </section>`;
  }).join('');
  return `<h2>Вопросы и ответы</h2>${rows}`;
}

function sectionReflection(b) {
  if (!b.reflection.length) return '';
  const rows = b.reflection.map(r => `
    <section class="q">
      <div class="q-head">${badge('оценка ' + r.mark, r.mark === 0 ? 'warn' : 'ok')}</div>
      <p class="q-text">${esc(r.question)}</p>
      <div class="answer"><div class="ans-k">Ответ (дословно)</div><div class="ans-t">${esc(r.answer)}</div></div>
      ${r.explanation ? `<p class="expl"><b>Комментарий ЛЛМ:</b> ${esc(r.explanation)}</p>` : ''}
    </section>`).join('');
  return `<h2>Рефлексия</h2>${rows}`;
}

function sectionEvents(b) {
  if (!b.events.length) return '';
  const rows = b.events.map(e =>
    `<tr><td class="mono">${esc(fmtTime(e.t))}</td><td>${esc(e.type)}</td><td><code>${esc(JSON.stringify(e.payload))}</code></td></tr>`).join('');
  return `<h2>События и тайминги</h2><table><thead><tr><th>Время (МСК)</th><th>Тип</th><th>Данные</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sectionEconomy(b) {
  const scopes = b.llm.by_scope.map(s =>
    `<tr><td>${esc(s.scope)}</td><td>${esc(s.qid)}</td><td class="mono">${s.tokens_in}</td><td class="mono">${s.tokens_out}</td><td class="mono">${fmtRub(s.rub)}</td></tr>`).join('');
  return `<h2>Экономика попытки</h2>
    <div class="totals">
      ${meta('Вызовов ЛЛМ', String(b.llm.calls))}
      ${meta('Токены in / out', `${b.llm.tokens_in} / ${b.llm.tokens_out}`)}
      ${meta('Сумма', fmtRub(b.llm.rub))}
    </div>
    ${scopes ? `<table><thead><tr><th>Scope</th><th>Qid</th><th>Токены in</th><th>Токены out</th><th>Руб</th></tr></thead><tbody>${scopes}</tbody></table>` : ''}`;
}

function sectionHeader(b) {
  const a = b.attempt;
  const splitNote = a.split ? ` · разбивка: фрагмент «${a.split.fragment_title || a.split.fragment_id}»` : '';
  return `<header>
    <h1>Отчёт по прохождению</h1>
    <div class="totals">
      ${meta('Ребёнок', esc(b.user.login))}
      ${meta('Уровень', esc(b.level.id))}
      ${meta('Правило', esc(b.level.rule_kid || ''))}
      ${meta('Текст', esc(((b.level.text_author || '') + (b.level.text_author ? ' — ' : '') + (b.level.text_title || '')) || ''))}
      ${meta('Ставка', String(a.stake))}
      ${meta('Статус', badge(a.status, a.status === 'approved' ? 'ok' : ''))}
      ${meta('Проход', `№ ${a.pass_number} · итераций: ${a.iterations}${splitNote}`)}
      ${meta('Создан', esc(fmtTime(a.created_at)))}
      ${meta('Обновлён', esc(fmtTime(a.updated_at)))}
      ${b.coupon ? meta('Купон', esc(b.coupon.code) + ' · ' + b.coupon.amount + ' ₽ · ' + esc(b.coupon.status)) : ''}
    </div>
  </header>`;
}

function html(b) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Отчёт ${esc(b.user.login)} — ${esc(b.level.id)}</title>
<style>
  :root { --accent: ${ACCENT}; --soft: ${ACCENT_SOFT}; --line: ${LINE}; --ink: ${INK}; --mute: ${MUTE}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #ffffff; color: var(--ink);
         font: 15px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; }
  h2 { font-size: 17px; font-weight: 700; margin: 36px 0 14px; padding-bottom: 6px; border-bottom: 2px solid var(--accent); }
  p { margin: 8px 0; }
  code { font: 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft); padding: 1px 5px; border-radius: 4px; }
  .mono { font: 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .mute { color: var(--mute); }
  .totals { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px 24px; }
  .meta { display: flex; gap: 10px; justify-content: space-between; border-bottom: 1px solid var(--line); padding: 4px 0; }
  .meta-k { color: var(--mute); }
  .meta-v { text-align: right; }
  .badge { display: inline-block; padding: 1px 9px; border-radius: 999px; background: var(--soft); color: var(--accent);
           font-size: 12.5px; font-weight: 600; }
  .badge.ok { background: #e6f4ec; color: #166534; }
  .badge.warn { background: #fdeaea; color: #b91c1c; }
  .q { border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; margin: 14px 0; }
  .q-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .q-num { font-weight: 700; }
  .q-type { color: var(--mute); font-size: 12.5px; }
  .q-text { margin: 8px 0; }
  .q-spec { margin: 4px 0 10px; }
  .answer { background: var(--soft); border-radius: 8px; padding: 10px 14px; margin: 10px 0; }
  .ans-k { color: var(--mute); font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; }
  .ans-t { white-space: pre-wrap; margin-top: 4px; }
  .ans-m { color: var(--mute); font-size: 12.5px; margin-top: 6px; }
  .crits { margin: 10px 0 4px; }
  .crit { display: flex; justify-content: space-between; border-bottom: 1px dashed var(--line); padding: 3px 0; }
  .crit-v.zero { color: #b91c1c; font-weight: 600; }
  .expl { margin-top: 8px; }
  .turns { margin-top: 12px; border-left: 3px solid var(--accent); padding-left: 12px; }
  .turn { margin: 8px 0; }
  .turn-q, .turn-a { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
  th { font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--mute); }
  @media print { main { padding: 0; } .q { break-inside: avoid; } }
</style>
</head>
<body><main>
${sectionHeader(b)}
${sectionQuestions(b)}
${sectionReflection(b)}
${sectionEvents(b)}
${sectionEconomy(b)}
</main></body></html>`;
}

// Маршрут export: админ — любой attempt, ребёнок — только свой (иначе 403).
async function route({ attempt_id }, ctx) {
  if (!attempt_id) return { status: 400, body: { error: 'validation' } };
  const attempt = await admin.reportBundle(attempt_id);
  if (!attempt) return { status: 404, body: { error: 'not_found' } };
  if (ctx.user.role !== 'admin' && attempt.attempt.user_id !== ctx.user.id) {
    return { status: 403, body: { error: 'forbidden' } };
  }
  return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html(attempt) };
}

module.exports = { html, route };
