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
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const alt = data.result.alternatives[0];
  const tokensIn = Number(data.result.usage.inputTextTokens || 0);
  const tokensOut = Number(data.result.usage.completionTokens || 0);
  return { text: alt.message.text, tokensIn, tokensOut, costRub: ((tokensIn + tokensOut) / 1000) * C.tokenPriceRubPer1k };
}

// Маркеры отказа модели (yandexgpt-lite отказывается обсуждать грубый/сексуальный
// мусор в ответе ребёнка). Регистронезависимо. Общий детектор: используется в
// сократовском цикле (вместо своей копии маркеров) и в review-question/reflect
// для degraded-ответов. «прости(те)» — только отдельным словом («простил» не ловим).
const REFUSAL_MARKERS = ['не могу', 'не можем', 'извините', 'другую тему', 'внешн', 'политик', 'неприемлем'];
function isRefusal(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return false;
  if (REFUSAL_MARKERS.some(m => s.includes(m))) return true;
  if (/давай(те)?\s+поговорим/.test(s)) return true;
  if (/(^|[^\p{L}\p{N}])прости(те)?([^\p{L}\p{N}]|$)/u.test(s)) return true;
  return false;
}

// Каноничные тексты для degraded-ответов (отказ модели / непарс после retry).
// Показываемые ребёнку explanation — ТОЛЬКО эти заготовленные тексты: никакого
// эха его грубостей и никакого текста самой модели.
const DEGRADED_QUESTION_EXPLANATION = 'Такой ответ не подойдёт — напиши о том, что есть в тексте, своими словами.';
const DEGRADED_REFLECTION_EXPLANATION = 'Напиши, пожалуйста, свой ответ: что ты думаешь по этому вопросу, своими словами.';

module.exports = { complete, isRefusal, DEGRADED_QUESTION_EXPLANATION, DEGRADED_REFLECTION_EXPLANATION };
