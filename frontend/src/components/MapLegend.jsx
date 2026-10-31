import { typesOf } from '../utils';
// Leyenda flotante sobre el mapa: color de cada tipo y cuántos puntos se ven de cada uno
export default function MapLegend({ types, people }) {
  if (types.length === 0) return null;

  const counts = {};
  for (const p of people) for (const t of typesOf(p)) counts[t] = (counts[t] ?? 0) + 1;

  return (
    <div className="map-legend" aria-label="Leyenda de colores por tipo">
      {types.map((t) => (
        <div key={t.key} className="map-legend-row">
          <span className="pin-dot" style={{ background: t.color }} />
          {t.label} <b>{counts[t.key] ?? 0}</b>
        </div>
      ))}
    </div>
  );
}
