import test from 'node:test';
import assert from 'node:assert/strict';

// Navegador simulado
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let calls = 0;
globalThis.fetch = async (url) => {
  calls++;
  const q = new URL(url).searchParams.get('q');
  const body = q.includes('Nada') ? [] : [{ lat: '38.48', lon: '-0.79', address: { suburb: 'Barrio Uno', town: 'Elda' } }];
  return { ok: true, status: 200, json: async () => body };
};
const realNow = Date.now;
const api = await import('../src/api-local.js');

test('crear, listar, sector, caché de geocodificación y borrar', async () => {
  const a = await api.createPerson({ name: 'Ana', address: 'Calle A 1, Elda', types: ['sin_hogar', 'dependencia'] });
  assert.equal(a.sector.name, 'Barrio Uno');
  assert.deepEqual(a.types, ['sin_hogar', 'dependencia']);
  assert.match(a.sector.color, /^#[0-9a-f]{6}$/);
  const b = await api.createPerson({ name: 'Beto', address: 'calle a 1, elda', type: 'absentismo' });
  assert.equal(calls, 1, 'misma dirección: sin segunda petición');
  assert.equal(b.sector_id, a.sector_id);
  assert.deepEqual((await api.getPeople()).map((p) => p.name), ['Ana', 'Beto']);
  await api.deletePerson(a.id);
  assert.equal((await api.getPeople()).length, 1);
});

test('validación y dirección no encontrada', async () => {
  await assert.rejects(api.createPerson({ name: 'X', address: 'Y', types: [] }), /al menos un tipo/);
  await assert.rejects(api.createPerson({ name: 'X', address: 'Y', types: ['otro'] }), /no es válido/);
  await assert.rejects(api.createPerson({ name: '', address: 'Y', types: ['sin_hogar'] }), /nombre/);
  await assert.rejects(api.createPerson({ name: 'X', address: 'Nada 1', types: ['sin_hogar'] }), /No se pudo localizar/);
});

test('copia de seguridad: exportar y restaurar', async () => {
  const json = api.exportBackup();
  store.clear();
  assert.equal((await api.getPeople()).length, 0);
  assert.equal(api.importBackup(json), 1);
  assert.equal((await api.getPeople())[0].name, 'Beto');
  assert.throws(() => api.importBackup('{"x":1}'), /no es una copia/);
  assert.throws(() => api.importBackup('no json'), /no es una copia/);
});
