// Юнит-тест общего детектора отказа llm.isRefusal (task-17): регистронезависимость,
// маркеры по ТЗ, «прости(те)» только отдельным словом, пустая строка — не отказ.
const test = require('node:test');
const assert = require('node:assert');
const { isRefusal } = require('../lib/llm');

test('isRefusal: основные маркеры отказа', () => {
  assert.strictEqual(isRefusal('Я не могу обсуждать эту тему.'), true);
  assert.strictEqual(isRefusal('Мы не можем продолжать этот разговор.'), true);
  assert.strictEqual(isRefusal('Извините, но это неприемлемо.'), true);
  assert.strictEqual(isRefusal('Давай поговорим о другой теме.'), true);
  assert.strictEqual(isRefusal('Давайте поговорим о чём-нибудь ещё.'), true);
  assert.strictEqual(isRefusal('Эта тема касается внешней политики.'), true);
  assert.strictEqual(isRefusal('Прости, но я не буду это комментировать.'), true);
  assert.strictEqual(isRefusal('Простите, такие вопросы я не обсуждаю.'), true);
});

test('isRefusal: регистронезависимость', () => {
  assert.strictEqual(isRefusal('Я НЕ МОГУ обсуждать это.'), true);
  assert.strictEqual(isRefusal('ИЗВИНИТЕ, давайте поговорим о другом.'), true);
  assert.strictEqual(isRefusal('Неприемлемо.'), true);
});

test('isRefusal: «простил/простая» — не отказ (слово целиком)', () => {
  assert.strictEqual(isRefusal('Герой простил обиду и пошёл дальше?'), false);
  assert.strictEqual(isRefusal('Простая мольба, ничего сложного?'), false);
});

test('isRefusal: нормальный вопрос/текст — не отказ', () => {
  assert.strictEqual(isRefusal('Почему герой просит о помощи?'), false);
  assert.strictEqual(isRefusal(''), false);
  assert.strictEqual(isRefusal(null), false);
  assert.strictEqual(isRefusal(undefined), false);
  assert.strictEqual(isRefusal('Ответ неверный, попробуй ещё раз.'), false);
});

test('isRefusal: каноничные тексты degraded — не отказ (не ловятся сами себя)', () => {
  const { DEGRADED_QUESTION_EXPLANATION, DEGRADED_REFLECTION_EXPLANATION } = require('../lib/llm');
  assert.strictEqual(isRefusal(DEGRADED_QUESTION_EXPLANATION), false);
  assert.strictEqual(isRefusal(DEGRADED_REFLECTION_EXPLANATION), false);
});
