import { typesOf } from '../utils';
// Buscador de texto + filtro por tipo (chips de color con su contador)
export default function Filters({ types, people, filter, onChange }) {
  const counts = {};
  for (const p of people) for (const t of typesOf(p)) counts[t] = (counts[t] ?? 0) + 1;

  const toggle = (key) => {
    const next = new Set(filter.types);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange({ ...filter, types: next });
  };

  const active = filter.text || filter.types.size > 0;

  return (
    <div className="filters">
      <input
        type="search"
        placeholder="Buscar por nombre, dirección o barrio…"
        value={filter.text}
        onChange={(e) => onChange({ ...filter, text: e.target.value })}
      />
      <div className="chips">
        {types.map((t) => {
          const on = filter.types.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              className={`chip ${on ? 'on' : ''}`}
              style={on ? { background: t.color, borderColor: t.color, color: '#fff' } : { borderColor: t.color }}
              onClick={() => toggle(t.key)}
              title={on ? 'Quitar filtro' : 'Filtrar por este tipo'}
            >
              <span className="dot" style={{ background: on ? '#fff' : t.color }} />
              {t.label} <b>{counts[t.key] ?? 0}</b>
            </button>
          );
        })}
      </div>
      {active && (
        <button type="button" className="link" onClick={() => onChange({ text: '', types: new Set() })}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
