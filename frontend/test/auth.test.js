import test from 'node:test';
import assert from 'node:assert/strict';

const mk = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i], _m: m }; };
globalThis.localStorage = new Proxy(mk(), { ownKeys: (t) => [...t._m.keys()], getOwnPropertyDescriptor: (t, k) => (t._m.has(k) ? { enumerable: true, configurable: true, value: t._m.get(k) } : undefined) });
globalThis.sessionStorage = mk();
const auth = await import('../src/auth.js');

test('crear, comprobar, bloquear y restablecer', async () => {
  assert.equal(auth.hasPassword(), false);
  await assert.rejects(auth.setPassword('123'), /al menos/);
  await auth.setPassword('secreta1');
  assert.ok(auth.hasPassword());
  assert.ok(auth.isUnlocked());
  auth.markUnlocked(false);
  assert.ok(!auth.isUnlocked());
  assert.equal(await auth.checkPassword('mala'), false);
  assert.ok(!auth.isUnlocked());
  assert.equal(await auth.checkPassword('secreta1'), true);
  assert.ok(auth.isUnlocked());
  assert.ok(!JSON.stringify([...localStorage._m.values()]).includes('secreta1'), 'no se guarda en claro');
  localStorage.setItem('mapa-personas:v1', '{}');
  auth.resetEverything();
  assert.equal(auth.hasPassword(), false);
  assert.equal(localStorage.getItem('mapa-personas:v1'), null);
});
