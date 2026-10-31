import { useCallback, useEffect, useMemo, useState } from 'react';
import { STATIC, createPerson, deletePerson, getPeople, getTypes } from './api';
import { matches, typeMap } from './utils';
import MapView from './components/MapView.jsx';
import PersonForm from './components/PersonForm.jsx';
import PeopleList from './components/PeopleList.jsx';
import Filters from './components/Filters.jsx';
import Summary from './components/Summary.jsx';
import MapLegend from './components/MapLegend.jsx';
import Import from './components/Import.jsx';
import Backup from './components/Backup.jsx';

const TABS = [
  ['personas', 'Personas'],
  ['resumen', 'Resumen'],
  ['anadir', 'Añadir'],
  ['importar', 'Importar'],
];

export default function App({ onLock }) {
  const [people, setPeople] = useState([]);
  const [types, setTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('personas');
  const [filter, setFilter] = useState({ text: '', types: new Set() });

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([getPeople(), getTypes()]);
      setPeople(p);
      setTypes(t);
      setLoadError('');
    } catch (e) {
      setLoadError(`No se pudieron cargar los datos: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byKey = useMemo(() => typeMap(types), [types]);
  const visible = useMemo(() => people.filter((p) => matches(p, filter)), [people, filter]);
  const filterKey = `${filter.text}|${[...filter.types].sort().join(',')}`;

  const handleCreate = async (data) => {
    const person = await createPerson(data); // lanza Error si la dirección no se encuentra
    setPeople((prev) => [...prev, person].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(person.id);
    return person;
  };

  // Para importaciones masivas: crea la persona sin seleccionarla (el mapa no salta de una a otra)
  const handleCreateQuiet = async (data) => {
    const person = await createPerson(data);
    setPeople((prev) => [...prev, person].sort((a, b) => a.name.localeCompare(b.name)));
    return person;
  };

  const handleDelete = async (id) => {
    await deletePerson(id);
    setPeople((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Mapa de personas</h1>
        {loadError && <p className="error">{loadError}</p>}

        <nav className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>

        {tab === 'anadir' && <PersonForm types={types} onCreate={handleCreate} />}

        {/* Siempre montado (solo oculto) para no perder el progreso si se cambia de pestaña mientras importa */}
        <div hidden={tab !== 'importar'}>
          <Import types={types} people={people} onCreate={handleCreateQuiet} />
        </div>

        {tab === 'personas' && (
          <>
            <Filters types={types} people={people} filter={filter} onChange={setFilter} />
            <p className="muted count">
              {visible.length === people.length
                ? `${people.length} personas`
                : `${visible.length} de ${people.length} personas`}
            </p>
            <PeopleList
              people={visible}
              typeByKey={byKey}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={handleDelete}
            />
          </>
        )}

        {tab === 'resumen' && <Summary people={people} types={types} />}

        {STATIC && <Backup onRestored={load} onLock={onLock} />}
      </aside>

      <main className="map-wrap">
        <MapView
          people={visible}
          typeByKey={byKey}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filterKey={filterKey}
        />
        <MapLegend types={types} people={visible} />
      </main>
    </div>
  );
}
