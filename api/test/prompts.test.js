const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/prompts');
const rule = { kid_formulation: 'Скажи суть одним предложением' };
const questions = [{qid:'q1', text:'О чём текст одной фразой?', type:'сжатие'}];
const answers = [{qid:'q1', text:'О мальчике который украл'}];
const bases = [{level_qid:'q1', etalon:'О встрече, изменившей мальчика'}];
test('packReview включает правило, вопросы, ответы, эталон', () => {
  const p = P.packReview({rule, questions, answers, answerBases: bases});
  assert.match(p.system, /Скажи суть одним предложением/);
  assert.match(p.user, /q1/);
  assert.match(p.user, /О мальчике который украл/);
  assert.match(p.user, /О встрече, изменившей мальчика/);
});
test('socraticQuestion: запрет ответа + цитирование + один вопрос', () => {
  const p = P.socraticQuestion({rule, question: questions[0], childAnswer: 'О мальчике', zeroCriteria: ['Точность'], attempts: 0});
  assert.match(p.system, /НЕ сообщай правильный ответ/);
  assert.match(p.user, /О мальчике/);
  assert.strictEqual((p.user.match(/\?/g) || []).length, 1);
});
test('типы сократовских вопросов цикличны', () => {
  const t = i => P.socraticQuestion({rule, question: questions[0], childAnswer: 'x', zeroCriteria: ['Точность'], attempts: i}).user;
  assert.match(t(0), /что ты имеешь в виду|уточни/i);
  assert.match(t(1), /откуда ты решил|почему ты так решил/i);
  assert.match(t(2), /почему|следствие/i);
  assert.match(t(3), /покажи место в тексте/i);
});
