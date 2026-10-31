// Quita acentos y pasa a minúsculas para buscar sin importar tildes
export const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const NO_BARRIO = 'Sin barrio';
export const FALLBACK_COLOR = '#6b7280';

export function typeMap(types) {
  return Object.fromEntries(types.map((t) => [t.key, t]));
}

// Tipos de una persona (puede tener varios). Admite datos antiguos con un solo "type".
export const typesOf = (p) => (Array.isArray(p.types) && p.types.length ? p.types : p.type ? [p.type] : []);

// ¿La persona cumple el texto de búsqueda y los tipos seleccionados? (tipos vacíos = todos)
export function matches(person, { text, types }) {
  if (types.size > 0 && !typesOf(person).some((t) => types.has(t))) return false;
  const q = normalize(text).trim();
  if (!q) return true;
  const haystack = normalize(
    [person.name, person.address, person.sector?.name].join(' ')
  );
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

// Resumen por barrio: [{ name, total, byType: { calle: 2, ... } }], de mayor a menor
// Cuántas personas hay de cada tipo (una persona con varios tipos cuenta en cada uno)
export function countByType(people) {
  const counts = {};
  for (const p of people) for (const t of typesOf(p)) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

export function summarize(people) {
  const rows = new Map();
  for (const p of people) {
    const name = p.sector?.name ?? NO_BARRIO;
    if (!rows.has(name)) rows.set(name, { name, total: 0, byType: {} });
    const row = rows.get(name);
    row.total += 1;
    for (const t of typesOf(p)) row.byType[t] = (row.byType[t] ?? 0) + 1;
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

// ---------- Personas en la misma dirección ----------

// Agrupa las personas que están en el mismo punto del mapa (~1 m). Mantiene el orden de aparición.
export function groupByLocation(people) {
  const groups = new Map();
  for (const p of people) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, { key, lat, lng, people: [] });
    groups.get(key).people.push(p);
  }
  return [...groups.values()];
}

// Reparto por tipo de un grupo: [{ key, color, n }], de más a menos personas
export function typeSlices(people, typeByKey) {
  const counts = new Map();
  for (const p of people) for (const t of typesOf(p)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, n]) => ({ key, n, color: typeByKey[key]?.color ?? FALLBACK_COLOR }))
    .sort((a, b) => b.n - a.n);
}

const f = (n) => Number(n.toFixed(2));

// Pin SVG. Una persona: pin del color de su tipo con punto blanco.
// Varias: la cabeza del pin es un gráfico circular por tipo y lleva el número de personas.
export function pinSvg({ size, slices, count }) {
  const base = slices[0]?.color ?? FALLBACK_COLOR;
  const head = 'M12 2C7.6 2 4 5.6 4 10c0 5.8 8 12 8 12s8-6.2 8-12c0-4.4-3.6-8-8-8z';
  let body = `<path d="${head}" fill="${base}" stroke="#fff" stroke-width="1.5"/>`;

  if (count <= 1 && slices.length <= 1) {
    body += '<circle cx="12" cy="10" r="3" fill="#fff"/>';
  } else {
    const cx = 12, cy = 10, r = 8;
    const total = slices.reduce((s, x) => s + x.n, 0);
    if (slices.length === 1) {
      body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${slices[0].color}"/>`;
    } else {
      let a0 = -Math.PI / 2;
      for (const s of slices) {
        const a1 = a0 + (s.n / total) * 2 * Math.PI;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const [x0, y0, x1, y1] = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
        body += `<path d="M${cx} ${cy}L${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}Z" fill="${s.color}" stroke="#fff" stroke-width=".6"/>`;
        a0 = a1;
      }
    }
    if (count > 1) {
      body +=
        `<circle cx="${cx}" cy="${cy}" r="5.6" fill="#fff"/>` +
        `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-weight="700" ` +
        `font-size="${count > 9 ? 7 : 8.5}" fill="#111827">${count}</text>`;
    } else {
      body += `<circle cx="${cx}" cy="${cy}" r="2.8" fill="#fff"/>`; // una persona con varios tipos
    }
  }
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${body}</svg>`;
}
