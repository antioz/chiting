const test = require('node:test');
const assert = require('node:assert');
const rubric = require('../lib/rubric');
test('итог 0: есть критерий = 0', () => { assert.deepStrictEqual(rubric.finalMark([0,2,2,2,2]), {total:8, mark:0}); });
test('итог 0: сумма <= 3', () => { assert.deepStrictEqual(rubric.finalMark([1,1,0,1,0]), {total:3, mark:0}); });
test('итог 1: нет нулей, сумма 4-6', () => { assert.deepStrictEqual(rubric.finalMark([1,2,1,1,1]), {total:6, mark:1}); });
test('итог 2: нет нулей, сумма >= 7', () => { assert.deepStrictEqual(rubric.finalMark([2,2,1,2,1]), {total:8, mark:2}); });
test('parseLlmJson вынимает JSON из markdown-обёртки', () => {
  const txt = 'Вот оценка:\n```json\n{"criteria":[2,1,2,2,1],"explanation":"хорошо"}\n```';
  assert.deepStrictEqual(rubric.parseLlmJson(txt), {criteria:[2,1,2,2,1], explanation:'хорошо'});
});
test('parseLlmJson null при мусоре', () => { assert.strictEqual(rubric.parseLlmJson('нет json'), null); });
