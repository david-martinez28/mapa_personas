import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '../api';

// Solo en la versión web (GitHub Pages): los datos viven en este navegador, así que se ofrece copia de seguridad.
export default function Backup({ onRestored, onLock }) {
  const inputRef = useRef(null);
  const [msg, setMsg] = useState('');

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportBackup()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `copia-mapa-personas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Esto reemplaza los datos actuales de este navegador por los de la copia. ¿Continuar?')) return;
    try {
      const n = importBackup(await file.text());
      setMsg(`Copia restaurada: ${n} personas.`);
      onRestored();
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <div className="backup">
      <p className="muted">Los datos se guardan solo en este navegador. Haz copias de seguridad.</p>
      <div className="chips">
        <button type="button" onClick={download}>Descargar copia</button>
        <button type="button" onClick={() => inputRef.current?.click()}>Restaurar copia</button>
        {onLock && <button type="button" onClick={onLock}>Bloquear</button>}
      </div>
      <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={restore} />
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
