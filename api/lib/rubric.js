function finalMark(criteria) {
  const total = criteria.reduce((a, b) => a + b, 0);
  if (criteria.includes(0) || total <= 3) return { total, mark: 0 };
  if (total >= 7) return { total, mark: 2 };
  return { total, mark: 1 };
}
// Нормализация оценки: принимаем числа 0/1/2 и числовые строки "0"/"1"/"2" (и 0.0 → 0).
// Отвергаем NaN, дробные 0.5, значения вне 0–2, пустые строки. Возвращаем число или null.
function normScore(x) {
  if (typeof x === 'string') {
    x = x.trim();
    if (x === '') return null;
  }
  const n = Number(x);
  if (!Number.isInteger(n) || n < 0 || n > 2) return null;
  return n;
}
function normCriteria(arr) {
  if (!Array.isArray(arr) || arr.length !== 5) return null;
  const out = arr.map(normScore);
  return out.includes(null) ? null : out;
}
// Запасной разбор: JSON сломан (оборванная строка и т.п.) — тянем criteria и explanation
// регэкспами. Числа и числовые строки через normScore, мусор → null.
function salvageCriteria(s) {
  const cm = s.match(/"criteria"\s*:\s*\[([^\]]*)/);
  if (!cm) return null;
  const parts = cm[1].split(',').map(p => p.replace(/["\s\]]/g, '')).filter(p => p !== '');
  const criteria = normCriteria(parts);
  if (!criteria) return null;
  const em = s.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
  let explanation = '';
  if (em) { try { explanation = JSON.parse('"' + em[1] + '"'); } catch { explanation = em[1]; } }
  return { criteria, explanation: String(explanation || '').slice(0, 2000) };
}
// yandexgpt-lite иногда рвёт JSON на границе токенов (нет финальной '}'). Парсим с
// автодозакрытием: ищем от первой '{' с "criteria" до конца, снимаем ```-обёртку,
// пробуем JSON.parse и до 3 недостающих закрывающих символов из ['}', '"', ']'].
function parseLlmJson(text) {
  let s = String(text).replace(/```(?:json)?/g, ' ');
  const start = s.search(/\{[\s\S]*"criteria"/);
  if (start < 0) return null;
  s = s.slice(start).trim();
  const tryParse = (candidate) => {
    try {
      const o = JSON.parse(candidate);
      const criteria = normCriteria(o.criteria);
      if (!criteria) return null;
      return { criteria, explanation: String(o.explanation || '').slice(0, 2000) };
    } catch { return null; }
  };
  const closers = ['', '}', '"}', '"]', '"}]', '"}]}'];
  for (const c of closers) {
    const r = tryParse(s + c);
    if (r) return r;
  }
  // JSON не собрался никак — пробуем вытащить criteria/explanation регэкспами.
  return salvageCriteria(s);
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
      criteria: normCriteria(r.criteria),
      explanation: String(r.explanation || '').slice(0, 2000),
    }));
    if (results.some(r => !r.qid || !r.criteria)) return null;
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
        mark: normScore(r.mark),
        explanation: String(r.explanation || '').slice(0, 2000),
      }));
      if (results.some(r => !r.qid || r.mark === null)) return null;
      return results;
    } catch { /* следующий кандидат */ }
  }
  return null;
}
module.exports = { finalMark, parseLlmJson, parseLlmResults, parseLlmReflectionResults };
