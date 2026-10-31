import { useState } from 'react';

export default function PersonForm({ types, onCreate }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const toggle = (key) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const submit = async (e) => {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Elige al menos un tipo.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const person = await onCreate({
        name: name.trim(),
        address: address.trim(),
        types: types.map((t) => t.key).filter((k) => selected.includes(k)),
      });
      setResult(person);
      setName('');
      setSelected([]);
      setAddress('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="form">
      <label>
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
      </label>

      <fieldset className="types-field">
        <legend>Tipos (puede tener varios)</legend>
        <div className="chips">
          {types.map((t) => {
            const on = selected.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                style={{ borderColor: t.color, ...(on ? { background: t.color, color: '#fff' } : {}) }}
                aria-pressed={on}
                onClick={() => toggle(t.key)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label>
        Dirección
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Calle, número, Elda"
          required
          maxLength={500}
        />
      </label>

      <button type="submit" disabled={loading || types.length === 0}>
        {loading ? 'Localizando…' : 'Añadir persona'}
      </button>

      {error && <p className="error">{error}</p>}
      {result && (
        <p className="ok">
          {result.name} añadida en{' '}
          <strong>{result.sector ? `el barrio ${result.sector.name}` : 'un punto sin barrio conocido en OpenStreetMap'}</strong>
        </p>
      )}
    </form>
  );
}
