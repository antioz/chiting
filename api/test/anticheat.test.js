const test = require('node:test');
const assert = require('node:assert');
const ac = require('../lib/anticheat');
test('typedRatio: ручной ввод 1.0', () => assert.strictEqual(ac.typedRatio({text:'привет мир', keydown:10}), 1.0));
test('typedRatio: вставка половины', () => assert.strictEqual(ac.typedRatio({text:'привет мир', keydown:5}), 0.5));
test('isSuspicious: одинаковые ответы', () => assert.strictEqual(ac.isSuspicious([{text:'а'},{text:'а'}]), true));
test('isSuspicious: разные ручные ответы — ок', () => assert.strictEqual(ac.isSuspicious([{text:'а',keydown:1},{text:'б',keydown:1}]), false));
