const test = require('node:test');
const assert = require('node:assert');
const jwt = require('../lib/jwt');
jwt.init('test-secret');
test('sign/verify roundtrip', () => { const t = jwt.sign({id:'u1',role:'child'}, 3600); assert.deepStrictEqual(jwt.verify(t), {id:'u1',role:'child'}); });
test('verify чужого секрета — null', () => { const t = jwt.sign({id:'x'}, 100); jwt.init('other'); assert.strictEqual(jwt.verify(t), null); jwt.init('test-secret'); });
test('verify мусора — null', () => assert.strictEqual(jwt.verify('abc.def'), null));
