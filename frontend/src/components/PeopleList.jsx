import { FALLBACK_COLOR, NO_BARRIO, typesOf } from '../utils';

export default function PeopleList({ people, typeByKey, selectedId, onSelect, onDelete }) {
  if (people.length === 0) return <p className="muted">No hay personas que coincidan.</p>;

  return (
    <ul className="people">
      {people.map((p) => {
        const ts = typesOf(p);
        return (
          <li key={p.id} className={p.id === selectedId ? 'active' : ''}>
            <button className="row" onClick={() => onSelect(p.id)}>
              <span className="dots">
                {ts.map((k) => (
                  <span key={k} className="dot" style={{ background: typeByKey[k]?.color ?? FALLBACK_COLOR }} />
                ))}
              </span>
              <span>
                <strong>{p.name}</strong>
                <small>
                  {ts.map((k) => typeByKey[k]?.label ?? k).join(', ')} · {p.sector?.name ?? NO_BARRIO}
                </small>
              </span>
            </button>
            <button
              className="del"
              title="Eliminar"
              onClick={() => window.confirm(`¿Eliminar a ${p.name}?`) && onDelete(p.id)}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
