import { useState } from 'react';
import { MIN_LENGTH, checkPassword, hasPassword, resetEverything, setPassword } from '../auth';

// Pantalla de acceso: la primera vez pide crear una contraseña; después, introducirla.
export default function Lock({ onUnlock }) {
  const [first, setFirst] = useState(!hasPassword());
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (first) {
        if (pass !== again) throw new Error('Las contraseñas no coinciden.');
        await setPassword(pass);
        onUnlock();
      } else if (await checkPassword(pass)) {
        onUnlock();
      } else {
        throw new Error('Contraseña incorrecta.');
      }
    } catch (err) {
      setError(err.message);
      setPass('');
      setAgain('');
    } finally {
      setBusy(false);
    }
  };

  const forgot = () => {
    if (!window.confirm('No se puede recuperar la contraseña. Para empezar de nuevo se BORRARÁN todas las personas guardadas en este navegador (puedes restaurar una copia de seguridad después). ¿Borrar todo?')) return;
    resetEverything();
    setFirst(true);
    setError('');
  };

  return (
    <div className="lock">
      <form className="form lock-box" onSubmit={submit}>
        <h1>Mapa de personas</h1>
        <p className="muted">{first ? 'Crea una contraseña para proteger el acceso en este navegador.' : 'Introduce la contraseña para entrar.'}</p>
        <label>
          Contraseña
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus required
            minLength={first ? MIN_LENGTH : undefined} autoComplete={first ? 'new-password' : 'current-password'} />
        </label>
        {first && (
          <label>
            Repite la contraseña
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" />
          </label>
        )}
        <button type="submit" disabled={busy}>{busy ? 'Comprobando…' : first ? 'Crear contraseña y entrar' : 'Entrar'}</button>
        {error && <p className="error">{error}</p>}
        {!first && <button type="button" className="link" onClick={forgot}>He olvidado la contraseña</button>}
      </form>
    </div>
  );
}
