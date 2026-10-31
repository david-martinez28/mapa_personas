import { FALLBACK_COLOR, NO_BARRIO, summarize, typesOf } from '../utils';

// Resumen: para cada barrio, cuántas personas hay de cada tipo (siempre sobre todas las personas)
export default function Summary({ people, types }) {
  if (people.length === 0) return <p className="muted">Aún no hay datos para resumir.</p>;

  const rows = summarize(people);
  const totals = {};
  for (const p of people) for (const t of typesOf(p)) totals[t] = (totals[t] ?? 0) + 1;

  return (
    <div className="summary">
      <p className="muted">Una persona con varios tipos cuenta en cada uno de ellos.</p>
      <div className="chips legend-types">
        {types.map((t) => (
          <span key={t.key} className="chip static" style={{ borderColor: t.color }}>
            <span className="dot" style={{ background: t.color }} />
            {t.label} <b>{totals[t.key] ?? 0}</b>
          </span>
        ))}
      </div>

      <ul className="barrios">
        {rows.map((row) => (
          <li key={row.name}>
            <div className="barrio-head">
              <strong className={row.name === NO_BARRIO ? 'muted' : ''}>{row.name}</strong>
              <span>
                {row.total} {row.total === 1 ? 'persona' : 'personas'}
              </span>
            </div>

            {/* Barra apilada con un tramo por tipo */}
            <div className="bar" role="img" aria-label={`Reparto por tipo en ${row.name}`}>
              {types.map((t) =>
                row.byType[t.key] ? (
                  <span
                    key={t.key}
                    style={{ width: `${(row.byType[t.key] / row.total) * 100}%`, background: t.color }}
                    title={`${t.label}: ${row.byType[t.key]}`}
                  />
                ) : null
              )}
            </div>

            <ul className="breakdown">
              {types
                .filter((t) => row.byType[t.key])
                .map((t) => (
                  <li key={t.key}>
                    <span className="dot" style={{ background: t.color ?? FALLBACK_COLOR }} />
                    {row.byType[t.key]} {t.label.toLowerCase()}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
