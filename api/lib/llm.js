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
