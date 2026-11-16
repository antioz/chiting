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
// Пакетный формат ответа packReview: {"results":[{"qid","criteria":[0-2 x5],"explanation"}]}.
// Строгость та же: ровно 5 критериев со значениями 0–2, без markdown вокруг JSON (кроме обёртки ```).
function parseLlmResults(text) {
  const m = String(text).match(/\{[\s\S]*"results"[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!Array.isArray(o.results) || o.results.length === 0) return null;
    const results = o.results.map(r => ({
      qid: String(r.qid || ''),
      criteria: r.criteria,
      explanation: String(r.explanation || '').slice(0, 2000),
    }));
    if (results.some(r => !r.qid || !Array.isArray(r.criteria) || r.criteria.length !== 5 || !r.criteria.every(x => [0, 1, 2].includes(x)))) return null;
    return results;
  } catch { return null; }
}
// Формат ответа блока рефлексии (task-8): {"results":[{"qid","mark":0|1|2,"explanation"}]}.
// Тотолерантный к урезанному ответу ЛЛМ: если JSON оборван — пробуем отрезать по
// последнему закрывающему '}' и распарсить то, что успело прийти (§экономика: ответ может быть урезан).
function parseLlmReflectionResults(text) {
  let s = String(text || '');
  const m = s.match(/\{[\s\S]*"results"[\s\S]*\}/);
  if (!m) return null;
  s = m[0];
  // Ответ мог быть урезан по токенам: пробуем как есть, с закрытыми скобками,
  // и с отрезанием недописанной последней записи.
  const lastEntry = s.lastIndexOf('}');
  const candidates = [s, s + ']}'];
  if (lastEntry > 0) candidates.push(s.slice(0, lastEntry + 1) + ']}');
  for (const c of candidates) {
    try {
      const o = JSON.parse(c);
      if (!Array.isArray(o.results) || o.results.length === 0) return null;
      const results = o.results.map(r => ({
        qid: String(r.qid || ''),
        mark: Number(r.mark),
        explanation: String(r.explanation || '').slice(0, 2000),
      }));
      if (results.some(r => !r.qid || ![0, 1, 2].includes(r.mark))) return null;
      return results;
    } catch { /* следующий кандидат */ }
  }
  return null;
}
module.exports = { finalMark, parseLlmJson, parseLlmResults, parseLlmReflectionResults };
