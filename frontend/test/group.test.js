import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByLocation, typeSlices, pinSvg, matches, summarize, typesOf } from '../src/utils.js';

const types = { a: { color: '#111111' }, b: { color: '#222222' } };
const P = (id, type, lat, lng) => ({ id, type, lat, lng });

test('agrupa por coordenadas iguales y deja sueltas las demás', () => {
  const g = groupByLocation([P(1, 'a', '38.47780', '-0.79180'), P(2, 'b', 38.4778, -0.7918), P(3, 'a', 38.5, -0.8)]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].people.map((p) => p.id), [1, 2]);
  assert.equal(g[1].people.length, 1);
});

test('pin de una persona: punto blanco, sin número', () => {
  const svg = pinSvg({ size: 30, slices: typeSlices([P(1, 'a', 0, 0)], types), count: 1 });
  assert.match(svg, /r="3"/);
  assert.doesNotMatch(svg, /<text/);
});

test('pin de grupo: número y reparto por tipos, sin NaN', () => {
  const people = [P(1, 'a', 0, 0), P(2, 'a', 0, 0), P(3, 'b', 0, 0)];
  const svg = pinSvg({ size: 30, slices: typeSlices(people, types), count: 3 });
  assert.match(svg, />3<\/text>/);
  assert.match(svg, /#111111/);
  assert.match(svg, /#222222/);
  assert.doesNotMatch(svg, /NaN/);
});

test('grupo de un solo tipo: círculo sólido', () => {
  const people = [P(1, 'b', 0, 0), P(2, 'b', 0, 0)];
  const svg = pinSvg({ size: 30, slices: typeSlices(people, types), count: 2 });
  assert.match(svg, /<circle cx="12" cy="10" r="8" fill="#222222"/);
});

test('persona con varios tipos: filtro, resumen y pin', () => {
  const p = { id: 1, type: 'a', types: ['a', 'b'], name: 'X', address: 'Y', lat: 0, lng: 0 };
  assert.deepEqual(typesOf({ type: 'a' }), ['a']);
  assert.ok(matches(p, { text: '', types: new Set(['b']) }));
  assert.ok(!matches(p, { text: '', types: new Set(['c']) }));
  assert.deepEqual(summarize([p])[0].byType, { a: 1, b: 1 });
  assert.equal(summarize([p])[0].total, 1);
  const svg = pinSvg({ size: 30, slices: typeSlices([p], types), count: 1 });
  assert.match(svg, /#111111/);
  assert.match(svg, /#222222/);
  assert.doesNotMatch(svg, /<text|NaN/);
});
