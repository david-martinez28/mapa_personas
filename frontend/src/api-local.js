// Versión "solo navegador" (GitHub Pages): sin servidor. Los datos se guardan en este navegador
// (localStorage) y las direcciones se localizan directamente con Nominatim (OpenStreetMap, gratis).
import TYPES from './types.json' with { type: 'json' };

const DB_KEY = 'mapa-personas:v1';
const GEO_KEY = 'mapa-personas:geocache:v1';
const TYPE_KEYS = TYPES.map((t) => t.key);

// ---------- almacenamiento ----------
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('No se pudo guardar en este navegador (¿almacenamiento lleno o bloqueado?).');
  }
}

const emptyDb = () => ({ nextId: 1, people: [], sectors: [] });
const loadDb = () => {
  const db = readJson(DB_KEY, null);
  return db && Array.isArray(db.people) && Array.isArray(db.sectors) ? db : emptyDb();
};

// ---------- color por barrio (mismo CRC32 que las otras versiones) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(str) {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(str)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function sectorColor(name, city) {
  const h = crc32(`${name}|${city}`.toLowerCase()) % 360;
  const s = 0.65;
  const l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(Math.floor(h / 60), 5)];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// ---------- geocodificación (Nominatim: máx. 1 petición/segundo) ----------
const pick = (address = {}, keys) => keys.map((k) => address[k]).find(Boolean) ?? null;
let chain = Promise.resolve();
let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function geocode(text) {
  const key = text.trim().toLowerCase();
  const cache = readJson(GEO_KEY, {});
  if (cache[key]) return Promise.resolve(cache[key]);

  const run = chain.then(async () => {
    const wait = lastRequestAt + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const params = new URLSearchParams({
      q: text.trim(), format: 'jsonv2', limit: '1', addressdetails: '1', 'accept-language': 'es', countrycodes: 'es',
    });
    let res;
    try {
      res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' } });
    } catch {
      throw new Error('Sin conexión con OpenStreetMap. Comprueba tu conexión a internet.');
    }
    if (!res.ok) throw new Error(`OpenStreetMap respondió con error ${res.status}. Inténtalo de nuevo en un momento.`);

    const first = (await res.json())?.[0];
    if (!first) return null;
    const result = {
      lat: Number(first.lat),
      lng: Number(first.lon),
      barrio: pick(first.address, ['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough']),
      city: pick(first.address, ['city', 'town', 'village', 'municipality']),
    };
    const fresh = readJson(GEO_KEY, {});
    fresh[key] = result;
    try { localStorage.setItem(GEO_KEY, JSON.stringify(fresh)); } catch { /* caché llena: se ignora */ }
    return result;
  });
  chain = run.catch(() => {});
  return run;
}

// ---------- API (misma forma que api.js) ----------
const withSector = (db, p) => ({ ...p, sector: db.sectors.find((s) => s.id === p.sector_id) ?? null });
const byName = (a, b) => a.name.localeCompare(b.name, 'es');

export async function getTypes() {
  return TYPES;
}

export async function getPeople() {
  const db = loadDb();
  return db.people.map((p) => withSector(db, p)).sort(byName);
}

export async function createPerson(data) {
  const name = String(data?.name ?? '').trim();
  const address = String(data?.address ?? '').trim();
  const raw = Array.isArray(data?.types) ? data.types : data?.type ? [data.type] : [];
  const types = [...new Set(raw)];
  if (!name) throw new Error('El campo nombre es obligatorio.');
  if (!address) throw new Error('El campo dirección es obligatorio.');
  if (types.length === 0) throw new Error('Elige al menos un tipo.');
  if (types.some((t) => !TYPE_KEYS.includes(t))) throw new Error('Alguno de los tipos seleccionados no es válido.');

  const geo = await geocode(address);
  if (!geo) throw new Error('No se pudo localizar la dirección. Prueba a añadir calle, número, ciudad y código postal.');

  const db = loadDb();
  let sector = null;
  if (geo.barrio) {
    const city = geo.city ?? '';
    sector = db.sectors.find((s) => s.name === geo.barrio && s.city === city);
    if (!sector) {
      sector = { id: db.sectors.reduce((m, s) => Math.max(m, s.id), 0) + 1, name: geo.barrio, city, color: sectorColor(geo.barrio, city) };
      db.sectors.push(sector);
    }
  }
  const now = new Date().toISOString();
  const person = {
    id: db.nextId++, name, address, type: types[0], types,
    lat: geo.lat, lng: geo.lng, sector_id: sector?.id ?? null, created_at: now, updated_at: now,
  };
  db.people.push(person);
  writeJson(DB_KEY, db);
  return withSector(db, person);
}

export async function deletePerson(id) {
  const db = loadDb();
  db.people = db.people.filter((p) => p.id !== id);
  writeJson(DB_KEY, db);
  return null;
}

// ---------- copia de seguridad ----------
export function exportBackup() {
  return JSON.stringify({ app: 'mapa-personas', version: 1, ...loadDb() }, null, 2);
}

export function importBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es una copia de seguridad válida.');
  }
  if (data?.app !== 'mapa-personas' || !Array.isArray(data.people) || !Array.isArray(data.sectors)) {
    throw new Error('El archivo no es una copia de seguridad de esta aplicación.');
  }
  const nextId = Math.max(Number(data.nextId) || 1, data.people.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1);
  writeJson(DB_KEY, { nextId, people: data.people, sectors: data.sectors });
  return data.people.length;
}
