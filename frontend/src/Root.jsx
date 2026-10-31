import { useState } from 'react';
import { STATIC } from './api';
import { isUnlocked, markUnlocked } from './auth';
import Lock from './components/Lock.jsx';
import App from './App.jsx';

// En la versión web se pide contraseña antes de mostrar la app; en Docker/escritorio entra directamente.
export default function Root() {
  const [unlocked, setUnlocked] = useState(() => !STATIC || isUnlocked());
  if (!unlocked) return <Lock onUnlock={() => setUnlocked(true)} />;
  return <App onLock={STATIC ? () => { markUnlocked(false); setUnlocked(false); } : undefined} />;
}
