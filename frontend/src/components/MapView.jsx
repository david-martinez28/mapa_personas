import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FALLBACK_COLOR, NO_BARRIO, groupByLocation, pinSvg, typeSlices, typesOf } from '../utils';

const DEFAULT_CENTER = [38.4778, -0.7918]; // Elda (Alicante)

// Pin del color del tipo; si hay varias personas en el mismo punto, lleva su número y un reparto por tipos
function pinIcon(group, typeByKey, selected) {
  const size = selected ? 38 : 30;
  return L.divIcon({
    className: 'pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
    html: pinSvg({ size, slices: typeSlices(group.people, typeByKey), count: group.people.length }),
  });
}

// Encuadra los puntos visibles al cargar y cada vez que cambia el filtro; vuela hasta la persona seleccionada
function ViewController({ people, selected, filterKey }) {
  const map = useMap();
  const lastKey = useRef(null);

  useEffect(() => {
    if (people.length === 0) return;
    // Primera carga con datos, o cambio de filtro
    if (lastKey.current === null || lastKey.current !== filterKey) {
      map.fitBounds(people.map((p) => [p.lat, p.lng]), { padding: [50, 50], maxZoom: 16 });
      lastKey.current = filterKey;
    }
  }, [people, filterKey, map]);

  useEffect(() => {
    if (selected) map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 16));
  }, [selected, map]);

  return null;
}

function PersonDetails({ person, typeByKey }) {
  return (
    <div className="person-details">
      <strong>{person.name}</strong>
      <br />
      {typesOf(person).map((k) => (
        <span key={k} className="tag">
          <span className="dot" style={{ background: typeByKey[k]?.color ?? FALLBACK_COLOR }} />{' '}
          {typeByKey[k]?.label ?? k}
        </span>
      ))}
      <br />
      {person.address}
      <br />
      Barrio: {person.sector?.name ?? NO_BARRIO}
    </div>
  );
}

// Popup de un punto con varias personas: lista para cambiar entre ellas
function GroupPopup({ group, typeByKey, selectedId }) {
  const map = useMap();
  const [activeId, setActiveId] = useState(group.people[0].id);

  // Si se elige a alguien desde la lista lateral, el popup muestra a esa persona
  useEffect(() => {
    if (group.people.some((p) => p.id === selectedId)) setActiveId(selectedId);
  }, [selectedId, group]);

  const active = group.people.find((p) => p.id === activeId) ?? group.people[0];

  // El contenido cambia de tamaño: pedir a Leaflet que recoloque el popup
  useEffect(() => {
    const popup = map._popup;
    if (popup && typeof popup.update === 'function') popup.update();
  }, [map, active.id]);

  return (
    <div className="group-popup">
      <div className="group-title">{group.people.length} personas en esta dirección</div>
      <ul className="group-list">
        {group.people.map((p) => {
          return (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === active.id ? 'on' : ''}
                onClick={() => setActiveId(p.id)}
                aria-pressed={p.id === active.id}
              >
                <span className="dots">
                  {typesOf(p).map((k) => (
                    <span key={k} className="dot" style={{ background: typeByKey[k]?.color ?? FALLBACK_COLOR }} />
                  ))}
                </span>
                <span className="gname">{p.name}</span>
                <span className="gtype">{typesOf(p).map((k) => typeByKey[k]?.label ?? k).join(', ')}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <PersonDetails person={active} typeByKey={typeByKey} />
    </div>
  );
}

export default function MapView({ people, typeByKey, selectedId, onSelect, filterKey }) {
  const selected = useMemo(() => people.find((p) => p.id === selectedId), [people, selectedId]);
  const groups = useMemo(() => groupByLocation(people), [people]);
  const groupOfPerson = useMemo(() => {
    const m = new Map();
    for (const g of groups) for (const p of g.people) m.set(p.id, g.key);
    return m;
  }, [groups]);
  const markerRefs = useRef({});

  // Abre el popup del punto de la persona seleccionada desde la lista lateral
  useEffect(() => {
    const key = groupOfPerson.get(selectedId);
    if (key && markerRefs.current[key]) markerRefs.current[key].openPopup();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={14} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {groups.map((g) => {
        const single = g.people.length === 1;
        const p = g.people[0];
        return (
          <Marker
            key={g.key}
            position={[g.lat, g.lng]}
            icon={pinIcon(g, typeByKey, g.people.some((x) => x.id === selectedId))}
            ref={(m) => {
              if (m) markerRefs.current[g.key] = m;
              else delete markerRefs.current[g.key];
            }}
            eventHandlers={single ? { click: () => onSelect(p.id) } : undefined}
          >
            <Popup minWidth={single ? undefined : 240}>
              {single ? (
                <PersonDetails person={p} typeByKey={typeByKey} />
              ) : (
                <GroupPopup group={g} typeByKey={typeByKey} selectedId={selectedId} />
              )}
            </Popup>
          </Marker>
        );
      })}

      <ViewController people={people} selected={selected} filterKey={filterKey} />
    </MapContainer>
  );
}
