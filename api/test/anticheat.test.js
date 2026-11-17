const test = require('node:test');
const assert = require('node:assert');
const ac = require('../lib/anticheat');
test('typedRatio: ручной ввод 1.0', () => assert.strictEqual(ac.typedRatio({text:'привет мир', keydown:10}), 1.0));
test('typedRatio: вставка половины', () => assert.strictEqual(ac.typedRatio({text:'привет мир', keydown:5}), 0.5));
test('isSuspicious: одинаковые ответы', () => assert.strictEqual(ac.isSuspicious([{text:'а'},{text:'а'}]), true));
test('isSuspicious: разные ручные ответы — ок', () => assert.strictEqual(ac.isSuspicious([{text:'а',keydown:1},{text:'б',keydown:1}]), false));
test('hasProfanity: мат и грубости ловятся регистронезависимо', () => {
  assert.strictEqual(ac.hasProfanity('нахер, не буду это писать'), true);
  assert.strictEqual(ac.hasProfanity('ПИЗДец какой-то'), true);
  assert.strictEqual(ac.hasProfanity('блядь'), true);
  assert.strictEqual(ac.hasProfanity('отвали, тупое задание'), false);
});
test('hasProfanity: бытовые слова «хуже/хуёво-семья» не ловятся ложно', () => {
  assert.strictEqual(ac.hasProfanity('было хуже, чем я думал'), false);
  assert.strictEqual(ac.hasProfanity(''), false);
  assert.strictEqual(ac.hasProfanity(null), false);
  assert.strictEqual(ac.hasProfanity('Это письмо о Ваньке, который просит деда забрать его'), false);
});
