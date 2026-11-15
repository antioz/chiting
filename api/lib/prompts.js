const SOCRATIC_TYPES = [
  'уточнение: спроси «что ты имеешь в виду, когда пишешь…?» — цитируя его слова',
  'предположение: спроси «откуда ты решил, что…?» — о его исходной догадке',
  'причина/следствие: спроси «почему герой поступил так, а не иначе?» — о причине в тексте',
  'пример: попроси «покажи место в тексте, где это видно» — конкретный фрагмент',
];
function packReview({rule, questions, answers, answerBases}) {
  const system = `Ты — проверяющий понимание текста для детей 10 лет (метод Адлера, курс «читинг»). Правило уровня: «${rule.kid_formulation}». Оцени каждый ответ по 5 критериям 0–2: [Соответствие форме задания, Точность (пересказ не подменяет смысл), Привязка к тексту, Свои слова (нет копии слов автора), Осмысленность]. Ответ строго в JSON: {"results":[{"qid":"...","criteria":[0-2,0-2,0-2,0-2,0-2],"explanation":"1-2 предложения"},{"qid":...}]}. Ничего кроме JSON.`;
  const qas = questions.map(q => {
    const a = answers.find(x => x.qid === q.qid) || {};
    const b = answerBases.find(x => x.level_qid === q.qid);
    return `ВОПРОС ${q.qid} (${q.type}): ${q.text}\nЭТАЛОН/ДОПУСТИМОЕ: ${b ? b.etalon : 'открытый вопрос — проверяй форму и осмысленность'}\nОТВЕТ РЕБЁНКА: ${a.text || '(пусто)'}`;
  }).join('\n---\n');
  return { system, user: qas };
}
function socraticQuestion({rule, question, childAnswer, zeroCriteria, attempts}) {
  const type = SOCRATIC_TYPES[Math.min(attempts, SOCRATIC_TYPES.length - 1) % SOCRATIC_TYPES.length];
  const system = `Ты ведёшь сократовский диалог с ребёнком 10 лет (shared inquiry: ведущий ТОЛЬКО спрашивает). Твоя задача — помочь ему самому дойти до правильного ответа. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: НЕ сообщай правильный ответ, не намекай на него прямо, не пересказывай эталон. Задай РОВНО ОДИН короткий наводящий вопрос. Тип вопроса: ${type}. Нулевые критерии ответа: ${zeroCriteria.join(', ')}. Ответь одним вопросом, без вступлений.`;
  const user = `Правило уровня: «${rule.kid_formulation}». Задание: ${question.text}\nОтвет ребёнка: «${childAnswer}»\nТип наводящего вопроса: ${type.replace(/\?/g, '…')}\nЗадай один вопрос.`;
  return { system, user };
}
function reflection({questions, answers}) {
  const system = 'Ты проверяешь блок рефлексии ребёнка 10 лет. Критерии НЕ правильности, а полноценности: ответ по теме вопроса, осмысленный, не пустой, не набор случайных слов. Оцени каждый ответ 0–2 (0 — мусор/пусто/не по теме, 1 — бедно но по теме, 2 — полноценно). Ответ строго JSON: {"results":[{"qid":"...","mark":0|1|2,"explanation":"..."}]}.';
  const user = questions.map((q, i) => `ВОПРОС ${q.qid}: ${q.text}\nОТВЕТ: ${(answers[i] || {}).text || '(пусто)'}`).join('\n---\n');
  return { system, user };
}
module.exports = { packReview, socraticQuestion, reflection, SOCRATIC_TYPES };
