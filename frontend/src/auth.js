// Contraseña de acceso (versión web). La contraseña se elige la primera vez, en cada navegador, y solo se
// guarda su huella (PBKDF2-SHA256 con sal aleatoria). Es un candado de acceso a la app, NO cifra los datos.
const KEY = 'mapa-personas:auth:v1';
const SESSION = 'mapa-personas:unlocked';
const ITERATIONS = 200000;
export const MIN_LENGTH = 6;

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v?.salt && v?.hash ? v : null;
  } catch {
    return null;
  }
}

export const hasPassword = () => read() !== null;

export async function setPassword(password) {
  if (String(password).length < MIN_LENGTH) throw new Error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  localStorage.setItem(KEY, JSON.stringify({ salt: toHex(salt), hash, iterations: ITERATIONS }));
  markUnlocked(true);
}

export async function checkPassword(password) {
  const a = read();
  if (!a) return false;
  const hash = await derive(password, fromHex(a.salt), a.iterations ?? ITERATIONS);
  if (hash.length !== a.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ a.hash.charCodeAt(i);
  if (diff === 0) markUnlocked(true);
  return diff === 0;
}

export function markUnlocked(value) {
  try {
    if (value) sessionStorage.setItem(SESSION, '1');
    else sessionStorage.removeItem(SESSION);
  } catch { /* sin sessionStorage: se pedirá la contraseña en cada recarga */ }
}

export function isUnlocked() {
  try {
    return hasPassword() && sessionStorage.getItem(SESSION) === '1';
  } catch {
    return false;
  }
}

// «Olvidé la contraseña»: no hay forma de recuperarla; se borran los datos de este navegador y se empieza de cero.
export function resetEverything() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('mapa-personas:')) localStorage.removeItem(k);
    sessionStorage.removeItem(SESSION);
  } catch { /* nada */ }
}
