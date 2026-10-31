import { useMemo, useRef, useState } from 'react';
import { buildRecords, failedToCsv, readTable, runImport } from '../importer';

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Importación masiva desde Excel (.xlsx) o CSV: vista previa, progreso y informe de errores
export default function Import({ types, people, onCreate }) {
  const [city, setCity] = useState('Elda');
  const [rawRows, setRawRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | preview | running | done
  const [progress, setProgress] = useState(null);
  const [frozen, setFrozen] = useState([]); // filas con las que se lanzó la importación
  const [summary, setSummary] = useState(null);
  const cancelRef = useRef(false);
  const inputRef = useRef(null);

  const typeByKey = useMemo(() => Object.fromEntries(types.map((t) => [t.key, t])), [types]);

  const parsed = useMemo(
    () => (rawRows ? buildRecords(rawRows, types, { defaultCity: city, existing: people }) : null),
    [rawRows, types, city, people]
  );
  const records = phase === 'preview' ? parsed?.records ?? [] : frozen;

  const ready = records.filter((r) => !r.errors.length && !r.duplicate);
  const withErrors = records.filter((r) => r.errors.length);
  const duplicates = records.filter((r) => r.duplicate);

  const reset = () => {
    setRawRows(null);
    setFileName('');
    setReadError('');
    setSummary(null);
    setProgress(null);
    setPhase('idle');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    try {
      const rows = await readTable(new Uint8Array(await file.arrayBuffer()), file.name);
      setRawRows(rows);
      setFileName(file.name);
      setPhase('preview');
    } catch (err) {
      setReadError(err.message);
    }
  };

  const start = async () => {
    cancelRef.current = false;
    setFrozen(parsed.records);
    setProgress({ done: 0, total: ready.length, created: 0, failed: 0 });
    setPhase('running');
    const s = await runImport(parsed.records, onCreate, {
      onProgress: setProgress,
      shouldCancel: () => cancelRef.current,
    });
    setSummary(s);
    setPhase('done');
  };

  const downloadProblems = () => {
    const rows = [...frozen.filter((r) => r.errors.length), ...summary.failed, ...summary.pending];
    download('personas-con-errores.csv', failedToCsv(rows));
  };

  return (
    <div className="import">
      <p className="muted">
        Sube un Excel (<b>.xlsx</b>) o CSV con las columnas <b>Nombre, Tipo, Dirección</b>.{' '}
        <a href="plantilla-personas.xlsx" download="plantilla-personas.xlsx">Descargar plantilla Excel</a>
      </p>

      <label className="form-row">
        Ciudad que se añade a las direcciones que no la lleven
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Elda" disabled={phase === 'running'} />
      </label>

      {(phase === 'idle' || phase === 'preview') && (
        <label className="file">
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.txt" onChange={onFile} />
        </label>
      )}
      {readError && <p className="error">{readError}</p>}

      {phase === 'preview' && parsed && (
        <>
          {parsed.error ? (
            <p className="error">{parsed.error}</p>
          ) : (
            <>
              <p>
                <b>{fileName}</b>: {records.length} filas →{' '}
                <span className="ok">{ready.length} listas</span>
                {duplicates.length > 0 && <>, {duplicates.length} ya existen</>}
                {withErrors.length > 0 && <>, <span className="error">{withErrors.length} con errores</span></>}
              </p>
              <PreviewTable records={records} typeByKey={typeByKey} />
              <p className="muted">
                Cada dirección tarda ~1 segundo en localizarse: {ready.length} personas ≈ {Math.max(1, Math.ceil((ready.length * 1.2) / 60))} min.
                Las filas con errores o repetidas no se importan.
              </p>
              <button type="button" className="primary" disabled={ready.length === 0} onClick={start}>
                Importar {ready.length} {ready.length === 1 ? 'persona' : 'personas'}
              </button>
            </>
          )}
        </>
      )}

      {phase === 'running' && progress && (
        <div>
          <progress value={progress.done} max={progress.total || 1} style={{ width: '100%' }} />
          <p>
            {progress.done} de {progress.total} — {progress.created} creadas
            {progress.failed > 0 && <>, <span className="error">{progress.failed} fallidas</span></>}
          </p>
          <p className="muted">No cierres la aplicación hasta que termine.</p>
          <button type="button" onClick={() => (cancelRef.current = true)}>Cancelar</button>
        </div>
      )}

      {phase === 'done' && summary && (
        <div>
          <p className={summary.failed.length ? '' : 'ok'}>
            {summary.cancelled ? 'Importación cancelada. ' : 'Importación terminada. '}
            <b>{summary.created}</b> creadas
            {summary.skippedDuplicates > 0 && <>, {summary.skippedDuplicates} repetidas omitidas</>}
            {withErrors.length > 0 && <>, {withErrors.length} filas con errores sin importar</>}
            {summary.failed.length > 0 && <>, <span className="error">{summary.failed.length} no se pudieron guardar</span></>}.
          </p>
          {summary.failed.length > 0 && (
            <ul className="failed">
              {summary.failed.slice(0, 20).map((f) => (
                <li key={f.line}>
                  Fila {f.line} · {f.name}: {f.reason}
                </li>
              ))}
              {summary.failed.length > 20 && <li>… y {summary.failed.length - 20} más (están en el informe).</li>}
            </ul>
          )}
          {(summary.failed.length > 0 || withErrors.length > 0 || summary.pending.length > 0) && (
            <button type="button" onClick={downloadProblems}>Descargar filas con problemas (CSV)</button>
          )}{' '}
          <button type="button" className="primary" onClick={reset}>Importar otro archivo</button>
        </div>
      )}
    </div>
  );
}

function PreviewTable({ records, typeByKey }) {
  const shown = records.slice(0, 100);
  return (
    <div className="preview">
      <table>
        <thead>
          <tr><th>Fila</th><th>Nombre</th><th>Tipo</th><th>Estado</th></tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const ts = (r.types ?? []).map((k) => typeByKey[k]).filter(Boolean);
            return (
              <tr key={r.line} className={r.errors.length ? 'bad' : r.duplicate ? 'dup' : ''}>
                <td>{r.line}</td>
                <td title={r.address}>{r.name || '—'}</td>
                <td>{ts.length ? ts.map((t) => <span key={t.key} className="tag"><span className="dot" style={{ background: t.color }} /> {t.label}</span>) : '—'}</td>
                <td>{r.errors.length ? r.errors.join(' · ') : r.duplicate ? 'Ya existe' : 'Lista'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {records.length > shown.length && <p className="muted">Mostrando las primeras {shown.length} de {records.length} filas.</p>}
    </div>
  );
}
