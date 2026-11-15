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
