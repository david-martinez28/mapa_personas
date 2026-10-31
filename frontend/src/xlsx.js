// Lector mínimo de .xlsx sin dependencias: un .xlsx es un zip con XML dentro.
// Usa DecompressionStream (navegadores modernos, Electron y Node >= 18).

const dec = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Devuelve { 'ruta/dentro/del.zip': () => Promise<Uint8Array> } leyendo el directorio central. */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Fin del directorio central (EOCD): se busca desde el final
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (no parece un zip).');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = {};

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Archivo .xlsx dañado.');
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    files[name] = async () => {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(start, start + compSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error(`Compresión no soportada en el .xlsx (método ${method}).`);
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(s) {
  return s
    .replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(\w+));/g, (m, hex, dec10, name) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (dec10) return String.fromCodePoint(parseInt(dec10, 10));
      return ENTITIES[name] ?? m;
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Texto de un bloque <si> o <is>: concatena todos los <t>, ignorando la fonética (<rPh>). */
function textOf(xml) {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += m[1] ?? '';
  return unescapeXml(out);
}

function colIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? ''));
}

function parseSheet(xml, shared) {
  const rows = [];
  let nextRow = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = /\br="(\d+)"/.exec(rm[1]);
    const rowIdx = rAttr ? Number(rAttr[1]) - 1 : nextRow;
    nextRow = rowIdx + 1;
    const cells = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const refM = /\br="([A-Za-z]+\d+)"/.exec(cm[1]);
      const col = refM ? colIndex(refM[1]) : nextCol;
      nextCol = col + 1;
      const type = /\bt="(\w+)"/.exec(cm[1])?.[1];
      const body = cm[2] ?? '';
      let value = '';
      if (type === 'inlineStr') value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
      else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (v !== undefined) {
          if (type === 's') value = shared[Number(v)] ?? '';
          else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'e') value = '';
          else value = unescapeXml(v); // números y fórmulas ya evaluadas ("str"): tal cual
        }
      }
      cells[col] = value;
    }
    for (let i = 0; i < cells.length; i++) cells[i] ??= '';
    rows[rowIdx] = cells;
  }
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return rows;
}

/**
 * Lee la PRIMERA hoja de un .xlsx.
 * @param {Uint8Array} bytes
 * @returns {Promise<string[][]>} filas (celdas como texto; vacías = '')
 */
export async function readXlsx(bytes) {
  const files = readZip(bytes);
  const text = async (name) => (files[name] ? dec.decode(await files[name]()) : null);

  const workbook = await text('xl/workbook.xml');
  if (!workbook) throw new Error('El archivo no parece un libro de Excel (.xlsx).');

  // Primera hoja según el orden del libro -> su ruta a través de las relaciones
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const firstSheet = /<sheet\b[^>]*?\br:id="([^"]+)"/.exec(workbook) ?? /<sheet\b[^>]*?\bid="([^"]+)"/.exec(workbook);
  const rels = await text('xl/_rels/workbook.xml.rels');
  if (firstSheet && rels) {
    for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      if (new RegExp(`\\bId="${firstSheet[1]}"`).test(m[1])) {
        const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
        if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      }
    }
  }

  const sheetXml = await text(sheetPath);
  if (!sheetXml) throw new Error('No se encontró la primera hoja del Excel.');
  const sharedXml = await text('xl/sharedStrings.xml');
  return parseSheet(sheetXml, sharedXml ? parseSharedStrings(sharedXml) : []);
}
