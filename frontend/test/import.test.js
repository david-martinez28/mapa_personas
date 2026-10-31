import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readXlsx } from '../src/xlsx.js';
import { readTable, buildRecords, runImport, failedToCsv, parseCsv } from '../src/importer.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => new Uint8Array(readFileSync(join(here, 'fixtures', name)));
const TYPES = [
  { key: 'absentismo', label: 'Absentismo' },
  { key: 'dependencia', label: 'Dependencia' },
  { key: 'renta_valenciana', label: 'Renta valenciana' },
  { key: 'sin_hogar', label: 'Sin hogar' },
];
const build = (rows, opts = { defaultCity: 'Elda' }) => buildRecords(rows, TYPES, opts);

describe('lector .xlsx', () => {
  for (const f of ['openpyxl.xlsx', 'libreoffice.xlsx']) {
    test(`${f}: lee la primera hoja con tildes, símbolos y números como texto`, async () => {
      const rows = await readXlsx(load(f));
      assert.deepEqual(rows[0].slice(0, 4), ['Nombre', 'Teléfono', 'Tipo', 'Dirección']);
      assert.equal(rows[1][0], 'Ana Pérez');
      assert.equal(rows[1][1], '600123456'); // numérico en Excel, texto aquí
      assert.equal(rows[2][0], 'Luis & Hijos <S.L.>');
      assert.equal(rows[3][0], 'Marta Ñandú');
      assert.ok(!JSON.stringify(rows).includes('debe'), 'no debe leer otras hojas');
    });
  }

  for (const f of ['manual.xlsx', 'manual-stored.xlsx']) {
    test(`${f}: hoja correcta por relaciones, celdas salteadas, inlineStr, rich text, entidades`, async () => {
      const rows = await readXlsx(load(f));
      assert.ok(!JSON.stringify(rows).includes('equivocada'), 'eligió la hoja equivocada');
      assert.deepEqual(rows[0], ['Nombre', 'Teléfono', 'Tipo', 'Dirección', 'Ciudad']);
      assert.deepEqual(rows[1], []); // fila 2 inexistente
      assert.deepEqual(rows[2], ['Rosa & Co', '699888777', 'Dependencia', 'Calle Pablo Iglesias 21']);
      assert.equal(rows[3][0], 'Julián'); // texto enriquecido, sin la fonética
      assert.equal(rows[3][4], 'Petrer');
      assert.equal(rows[4][0], 'Con tilde ñ'); // &#241;
      assert.equal(rows[4][5], 'TRUE'); // booleano
      assert.equal(rows[4][6], ''); // error (#N/A) -> vacío
    });
  }

  test('rechaza archivos que no son xlsx', async () => {
    await assert.rejects(readXlsx(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])), /no es un \.xlsx válido/);
  });

  test('la plantilla descargable es legible: solo cabecera, sin filas', async () => {
    const rows = await readXlsx(new Uint8Array(readFileSync(join(here, '..', 'public', 'plantilla-personas.xlsx'))));
    assert.deepEqual(rows[0], ['Nombre', 'Tipo', 'Dirección']);
    const { records, error } = build(rows);
    assert.equal(error, undefined);
    assert.equal(records.length, 0);
  });
});

describe('CSV', () => {
  test('Excel en español (; y Windows-1252)', async () => {
    const rows = await readTable(load('excel-es.csv'), 'datos.csv');
    assert.deepEqual(rows[0], ['Nombre', 'Teléfono', 'Tipo', 'Dirección']);
    assert.equal(rows[3][0], 'Marta Ñandú');
  });
  test('UTF-8 con BOM (,)', async () => {
    const rows = await readTable(load('utf8-bom.csv'), 'datos.csv');
    assert.equal(rows[0][0], 'Nombre'); // sin BOM pegado
  });
  test('comillas, separadores y saltos de línea dentro de celdas', () => {
    assert.deepEqual(parseCsv('a;b\r\n"x;1";"di ""hola""\nlinea2"\r\n'), [['a', 'b'], ['x;1', 'di "hola"\nlinea2']]);
  });
  test('.xls antiguo -> mensaje claro', async () => {
    await assert.rejects(readTable(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'viejo.xls'), /\.xlsx/);
  });
});

describe('validación de filas (mismo resultado desde cualquier origen)', () => {
  for (const f of ['openpyxl.xlsx', 'libreoffice.xlsx', 'excel-es.csv', 'utf8-bom.csv']) {
    test(f, async () => {
      const { records, error } = build(await readTable(load(f), f));
      assert.equal(error, undefined);
      assert.equal(records.length, 8);

      const ok = records.filter((r) => !r.errors.length && !r.duplicate);
      assert.deepEqual(ok.map((r) => r.name), ['Ana Pérez', 'Luis & Hijos <S.L.>', 'Marta Ñandú', 'Pedro']); // 'Pedro' trae un teléfono raro: esa columna se ignora
      assert.deepEqual(
        { ...ok[0], errors: undefined, line: undefined, duplicate: undefined },
        { name: 'Ana Pérez', type: 'sin_hogar', types: ['sin_hogar'], address: 'Calle Colón 5, Elda', errors: undefined, line: undefined, duplicate: undefined }
      );
      assert.ok(!('phone' in ok[0]), 'el teléfono ya no existe');
      assert.equal(ok[2].type, 'renta_valenciana'); // "Renta Valenciana" con mayúsculas
      assert.equal(ok[1].type, 'dependencia');

      // Errores con la línea real de la hoja (la fila 1 es la cabecera)
      const bad = records.filter((r) => r.errors.length).map((r) => [r.line, r.errors[0]]);
      assert.deepEqual(bad.map((b) => b[0]), [6, 7, 8]);
      assert.match(bad[0][1], /Falta el tipo/);
      assert.match(bad[1][1], /Tipo no válido «Otro».*Absentismo, Dependencia/);
      assert.match(bad[2][1], /Falta el nombre/);

      // Duplicada dentro del propio archivo (mayúsculas, acentos y "ELDA" distintos)
      const dup = records.find((r) => r.line === 9);
      assert.equal(dup.duplicate, true);
    });
  }

  test('detecta duplicados contra personas ya existentes', async () => {
    const rows = await readXlsx(load('openpyxl.xlsx'));
    const { records } = build(rows, { defaultCity: 'Elda', existing: [{ name: 'MARTA ÑANDÚ', address: 'calle nueva 27, elda' }] });
    assert.equal(records[2].duplicate, true);
    assert.equal(records[0].duplicate, false);
  });

  test('columna Ciudad propia tiene prioridad sobre la ciudad por defecto; sin ciudad no se añade nada', async () => {
    const { records } = build(await readXlsx(load('manual.xlsx')));
    assert.equal(records.length, 3);
    assert.equal(records[0].address, 'Calle Pablo Iglesias 21, Elda'); // por defecto
    assert.equal(records[1].address, 'Calle Colón 11, Petrer'); // columna Ciudad
    assert.equal(records[2].address, 'Calle San Roque 8, Elda'); // ya la lleva: no se duplica
    const sin = build(await readXlsx(load('manual.xlsx')), { defaultCity: '' }).records;
    assert.equal(sin[0].address, 'Calle Pablo Iglesias 21');
  });

  test('faltan columnas obligatorias -> error explicativo', () => {
    const { error, records } = build([['Nombre', 'Teléfono'], ['Ana', '600']]);
    assert.equal(records.length, 0);
    assert.match(error, /Tipo, Dirección/);
    assert.match(build([[], ['', '']]).error, /vacío/);
  });

  test('acepta clave interna, variantes de cabecera e ignora columnas desconocidas (p. ej. un Teléfono antiguo)', () => {
    const { records } = build([['NOMBRE Y APELLIDOS', 'Móvil', 'Tipo de caso', 'Domicilio'], ['A', '600 000 000', 'sin_hogar', 'C/ Mayor 1']]);
    assert.equal(records[0].type, 'sin_hogar');
    assert.equal(records[0].errors.length, 0);
    assert.ok(!('phone' in records[0]));
  });
});

describe('ejecución de la importación', () => {
  const recs = (n) => Array.from({ length: n }, (_, i) => ({ line: i + 2, name: `P${i}`, type: 'sin_hogar', address: `Calle ${i}`, errors: [], duplicate: false }));

  test('crea las válidas, salta duplicadas y errores, y recoge los fallos de la API', async () => {
    const records = [...recs(4), { ...recs(1)[0], name: 'Dup', duplicate: true }, { ...recs(1)[0], name: 'Mala', errors: ['x'] }];
    const created = [];
    const progress = [];
    const s = await runImport(
      records,
      async (d) => {
        if (d.name === 'P2') throw new Error('No se pudo localizar la dirección.');
        created.push(d.name);
      },
      { sleep: async () => {}, onProgress: (p) => progress.push(p) }
    );
    assert.deepEqual(created, ['P0', 'P1', 'P3']);
    assert.equal(s.created, 3);
    assert.equal(s.skippedDuplicates, 1);
    assert.equal(s.failed.length, 1);
    assert.equal(s.failed[0].name, 'P2');
    assert.match(s.failed[0].reason, /No se pudo localizar/);
    assert.deepEqual(progress.at(-1), { done: 4, total: 4, created: 3, failed: 1 });
  });

  test('deja al menos 1,1 s entre inicios de búsqueda y no espera tras la última', async () => {
    let t = 0;
    const sleeps = [];
    await runImport(recs(3), async () => { t += 300; }, { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
    assert.deepEqual(sleeps, [800, 800]); // 300 ms de petición + 800 de espera = 1100
  });

  test('si la petición ya tardó más de 1,1 s no espera de más', async () => {
    let t = 0;
    const sleeps = [];
    await runImport(recs(2), async () => { t += 1500; }, { now: () => t, sleep: async (ms) => { sleeps.push(ms); } });
    assert.deepEqual(sleeps, []);
  });

  test('se puede cancelar', async () => {
    let n = 0;
    const s = await runImport(recs(5), async () => { n++; }, { sleep: async () => {}, shouldCancel: () => n >= 2 });
    assert.equal(n, 2);
    assert.equal(s.cancelled, true);
    assert.equal(s.created, 2);
    assert.deepEqual(s.pending.map((r) => r.name), ['P2', 'P3', 'P4']); // las que no llegaron a importarse
    assert.match(s.pending[0].reason, /cancelado/);
  });

  test('informe de errores en CSV para Excel', () => {
    const csv = failedToCsv([{ name: 'A "B"', type: 'sin_hogar', address: 'Calle 1', errors: [], reason: 'Falló; y mucho' }]);
    assert.ok(csv.startsWith('\uFEFF"Nombre";"Tipo";"Dirección";"Motivo"'));
    assert.match(csv, /"A ""B""";"sin_hogar";"Calle 1";"Falló; y mucho"/);
  });
});

test('varios tipos en una celda', () => {
  const types = [{ key: 'sin_hogar', label: 'Sin hogar' }, { key: 'dependencia', label: 'Dependencia' }, { key: 'renta_valenciana', label: 'Renta valenciana' }];
  const rows = [['Nombre', 'Tipo', 'Dirección'], ['A', 'Sin hogar, Dependencia', 'Calle 1'], ['B', 'dependencia y renta valenciana', 'Calle 2'], ['C', 'Sin hogar / Otro', 'Calle 3']];
  const { records } = buildRecords(rows, types);
  assert.deepEqual(records[0].types, ['sin_hogar', 'dependencia']);
  assert.deepEqual(records[1].types, ['dependencia', 'renta_valenciana']);
  assert.ok(records[2].errors.length);
});
