import { readXlsx } from './xlsx.js';

export const MIN_INTERVAL_MS = 1100; // OpenStreetMap (Nominatim): máx. 1 búsqueda por segundo

// Quita acentos y pasa a minúsculas
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const HEADER_ALIASES = {
  name: ['nombre', 'nombre y apellidos', 'nombre completo', 'name'],
  type: ['tipo', 'tipo de caso', 'type'],
  address: ['direccion', 'domicilio', 'address'],
  city: ['ciudad', 'localidad', 'municipio', 'poblacion'],
};

// ---------- Lectura de archivos ----------

/** Lee un .xlsx o .csv y devuelve las filas como matriz de texto. */
export async function readTable(bytes, fileName = '') {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (isZip || /\.xlsx$/i.test(fileName)) return readXlsx(bytes);
  if (/\.xls$/i.test(fileName) && !isZip) {
    throw new Error('Los .xls antiguos no se pueden leer. En Excel: Guardar como → Libro de Excel (.xlsx).');
  }
  return parseCsv(decodeText(bytes));
}

/** UTF-8 si es válido; si no, Windows-1252 (CSV de Excel en español sin "UTF-8"). */
export function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** CSV con separador , o ; (el que más aparezca en la primera línea) y comillas. */
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------- Validación ----------

/**
 * Convierte las filas leídas en registros validados.
 * @param {string[][]} rows
 * @param {{key:string,label:string}[]} types
 * @param {{defaultCity?:string, existing?:{name:string,address:string}[]}} opts
 * @returns {{records: object[], error?: string}}
 */
export function buildRecords(rows, types, { defaultCity = '', existing = [] } = {}) {
  // Cabecera: primera fila que no esté vacía
  const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (headerIdx < 0) return { records: [], error: 'El archivo está vacío.' };

  const col = {};
  rows[headerIdx].forEach((h, i) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (col[field] === undefined && aliases.includes(n)) col[field] = i;
    }
  });
  const missing = ['name', 'type', 'address'].filter((f) => col[f] === undefined);
  if (missing.length) {
    const labels = { name: 'Nombre', type: 'Tipo', address: 'Dirección' };
    return {
      records: [],
      error: `No encuentro estas columnas en la primera fila: ${missing.map((f) => labels[f]).join(', ')}. Usa la plantilla.`,
    };
  }

  const typeByName = new Map();
  for (const t of types) {
    typeByName.set(norm(t.key.replace(/_/g, ' ')), t.key);
    typeByName.set(norm(t.label), t.key);
  }
  const validTypes = types.map((t) => t.label).join(', ');

  const finalAddress = (address, city) => {
    const c = String(city ?? '').trim() || defaultCity.trim();
    return c && address && !norm(address).includes(norm(c)) ? `${address}, ${c}` : address;
  };
  const dupKey = (name, address) => `${norm(name)}|${norm(address)}`;
  const seen = new Set(existing.map((p) => dupKey(p.name, p.address)));

  const get = (r, f) => (col[f] === undefined ? '' : String(r[col[f]] ?? '').trim());
  const records = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((c) => String(c ?? '').trim() === '')) continue; // fila vacía

    const errors = [];
    const name = get(r, 'name');
    const rawAddress = get(r, 'address');
    const rawType = get(r, 'type');

    if (!name) errors.push('Falta el nombre');
    else if (name.length > 255) errors.push('Nombre demasiado largo');

    if (!rawAddress) errors.push('Falta la dirección');
    const address = finalAddress(rawAddress, get(r, 'city'));
    if (address.length > 500) errors.push('Dirección demasiado larga');

    // Varios tipos en la misma celda: separados por coma, punto y coma, barra, «y» o «+»
    const found = [];
    if (!rawType) errors.push('Falta el tipo');
    else {
      const parts = rawType.split(/\s*(?:[,;/|+]|\sy\s)\s*/i).filter(Boolean);
      for (const part of parts) {
        const key = typeByName.get(norm(part.replace(/_/g, ' ')));
        if (!key) errors.push(`Tipo no válido «${part}» (válidos: ${validTypes})`);
        else if (!found.includes(key)) found.push(key);
      }
    }
    const type = found[0] ?? null;

    let duplicate = false;
    if (!errors.length) {
      const key = dupKey(name, address);
      duplicate = seen.has(key);
      seen.add(key);
    }

    records.push({ line: i + 1, name, type, types: found, address, errors, duplicate });
  }
  return { records };
}

// ---------- Ejecución ----------

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea las personas válidas una a una (respetando el límite de OpenStreetMap).
 * @param {object[]} records salida de buildRecords
 * @param {(data:object)=>Promise<any>} create crea una persona; lanza Error si falla
 * @param {{onProgress?:Function, shouldCancel?:()=>boolean, sleep?:Function, now?:()=>number, minIntervalMs?:number}} opts
 */
export async function runImport(records, create, opts = {}) {
  const { onProgress, shouldCancel, sleep = sleepReal, now = Date.now, minIntervalMs = MIN_INTERVAL_MS } = opts;
  const todo = records.filter((r) => !r.errors.length && !r.duplicate);
  const summary = { created: 0, skippedDuplicates: records.filter((r) => r.duplicate).length, failed: [], pending: [], cancelled: false, total: todo.length };

  for (let i = 0; i < todo.length; i++) {
    if (shouldCancel?.()) {
      summary.cancelled = true;
      summary.pending = todo.slice(i).map((r) => ({ ...r, reason: 'No se llegó a importar (cancelado)' }));
      break;
    }
    const rec = todo[i];
    const started = now();
    try {
      await create({ name: rec.name, address: rec.address, types: rec.types ?? [rec.type] });
      summary.created++;
    } catch (e) {
      summary.failed.push({ ...rec, reason: e.message || 'Error desconocido' });
    }
    onProgress?.({ done: i + 1, total: todo.length, created: summary.created, failed: summary.failed.length });

    // Espaciado entre búsquedas de dirección
    const wait = minIntervalMs - (now() - started);
    if (i < todo.length - 1 && wait > 0) await sleep(wait);
  }
  return summary;
}

/** CSV (separador ;, con BOM para que Excel lo abra bien) de las filas que fallaron, para corregirlas y reintentar. */
export function failedToCsv(records) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Nombre', 'Tipo', 'Dirección', 'Motivo'].map(esc).join(';')];
  for (const r of records) {
    const reason = r.reason ?? r.errors.join(' · ');
    lines.push([r.name, (r.types ?? (r.type ? [r.type] : [])).join(', '), r.address, reason].map(esc).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}
