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
test('parseLlmJson: оборванный JSON без финальной } принимается', () => {
  const txt = '{"criteria":[1,2,1,0,2],"explanation":"обрезано на границе токенов';
  assert.deepStrictEqual(rubric.parseLlmJson(txt), {criteria:[1,2,1,0,2], explanation:'обрезано на границе токенов'});
});
test('parseLlmJson: числовые строки "0"/"2" в criteria принимаются', () => {
  const txt = '{"criteria":[0,"0","1","2",2],"explanation":"ок"}';
  assert.deepStrictEqual(rubric.parseLlmJson(txt), {criteria:[0,0,1,2,2], explanation:'ок'});
});
test('parseLlmJson: оборванная строка "0 в конце массива лечится salvage', () => {
  const txt = '{"criteria":[0,"0","0","0","0],"explanation":"строки вместо чисел"}';
  assert.deepStrictEqual(rubric.parseLlmJson(txt), {criteria:[0,0,0,0,0], explanation:'строки вместо чисел'});
});
test('parseLlmJson: "3" строкой отклоняется', () => {
  assert.strictEqual(rubric.parseLlmJson('{"criteria":[0,1,2,"3",0],"explanation":"x"}'), null);
});
test('parseLlmJson: 0.5 отклоняется', () => {
  assert.strictEqual(rubric.parseLlmJson('{"criteria":[0,1,2,0.5,0],"explanation":"x"}'), null);
});
test('parseLlmJson: criteria строкой "0,0,0" (не массив) → null', () => {
  assert.strictEqual(rubric.parseLlmJson('{"criteria":"0,0,0","explanation":"x"}'), null);
  assert.strictEqual(rubric.parseLlmJson('{"criteria":["0,0,0"],"explanation":"x"}'), null);
});
test('parseLlmJson: 0.0 принимается как 0', () => {
  assert.deepStrictEqual(rubric.parseLlmJson('{"criteria":[0.0,1,2,1,0],"explanation":"x"}'), {criteria:[0,1,2,1,0], explanation:'x'});
});
test('parseLlmResults: числовые строки в criteria принимаются', () => {
  const r = rubric.parseLlmResults('{"results":[{"qid":"q1","criteria":["1",2,"0",1,2],"explanation":"ок"}]}');
  assert.deepStrictEqual(r, [{qid:'q1', criteria:[1,2,0,1,2], explanation:'ок'}]);
});
test('parseLlmResults: мусор в criteria → null', () => {
  assert.strictEqual(rubric.parseLlmResults('{"results":[{"qid":"q1","criteria":[1,2,"x",1,2],"explanation":"ок"}]}'), null);
});
test('parseLlmReflectionResults: mark числовой строкой принимается', () => {
  const r = rubric.parseLlmReflectionResults('{"results":[{"qid":"q1","mark":"2","explanation":"ок"}]}');
  assert.deepStrictEqual(r, [{qid:'q1', mark:2, explanation:'ок'}]);
});
test('parseLlmReflectionResults: mark вне 0–2 → null', () => {
  assert.strictEqual(rubric.parseLlmReflectionResults('{"results":[{"qid":"q1","mark":"3","explanation":"ок"}]}'), null);
});
