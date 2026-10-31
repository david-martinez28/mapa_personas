// En la versión de GitHub Pages (VITE_STATIC=1) no hay servidor: se usa api-local.js (datos en el navegador).
import * as local from './api-local.js';

export const STATIC = import.meta.env.VITE_STATIC === '1';

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Laravel devuelve { message, errors } en validaciones (422)
    const firstError = body.errors && Object.values(body.errors)[0]?.[0];
    throw new Error(firstError || body.message || `Error ${res.status}`);
  }
  return body;
}

export const getPeople = () => (STATIC ? local.getPeople() : request('/people'));
export const getTypes = () => (STATIC ? local.getTypes() : request('/types'));
export const createPerson = (data) =>
  STATIC ? local.createPerson(data) : request('/people', { method: 'POST', body: JSON.stringify(data) });
export const deletePerson = (id) => (STATIC ? local.deletePerson(id) : request(`/people/${id}`, { method: 'DELETE' }));
export const exportBackup = local.exportBackup;
export const importBackup = local.importBackup;
