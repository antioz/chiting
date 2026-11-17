function typedRatio(a) { return a.text.length === 0 ? 0 : Math.min(1, (a.keydown || 0) / a.text.length); }
function isSuspicious(answers) {
  const texts = answers.map(a => (a.text || '').trim()).filter(Boolean);
  if (texts.length === 0) return true;
  const uniq = new Set(texts.map(t => t.toLowerCase()));
  if (uniq.size < texts.length) return true; // одинаковые ответы на разные вопросы
  if (texts.some((t, i) => t.length > 40 && (answers[i].pasted || typedRatio(answers[i]) < 0.9))) return true;
  return false;
}
// Пошаговый флоу (task-14): одиночный ответ проверяем только на вставку/скорость печати —
// сравнивать с другими вопросами не с чем (uniq-эвристика пакета здесь неприменима).
function isSuspiciousSingle(a) {
  const t = (a.text || '').trim();
  if (!t) return true;
  if (t.length > 40 && (a.pasted || typedRatio(a) < 0.9)) return true;
  return false;
}
module.exports = { typedRatio, isSuspicious, isSuspiciousSingle };

// Детерминированный стоп-лист грубостей (task-17): ответ с матом — mark 0 без вызова
// ЛЛМ в review-question (и принудительный 0 в reflect). Закрывает класс «мусор с
// грубостью» независимо от настроения модели: раньше модель могла дать 1 «по теме,
// но с неприемлемым выражением». Подстроки покрывают склонения; «хуже/хуево» НЕ ловим
// (корень 'хуе' без слово-границ создаёт ложные срабатывания на бытовых словах).
const PROFANITY = ['нахер', 'нахуй', 'нахуя', 'пизд', 'бляд', 'блять', 'бляц', 'ебан', 'ебат', 'еблан', 'заеб', 'выеб', 'пидор', 'пидр', 'шлюх', 'залуп', 'дроч', 'мудак', 'мудил', 'гандон', 'сука', 'суки', 'сучк', 'хуй', 'хуя'];
function hasProfanity(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return false;
  return PROFANITY.some(w => s.includes(w));
}
module.exports.hasProfanity = hasProfanity;
