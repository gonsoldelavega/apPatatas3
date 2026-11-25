/**
 * Bucle con Claude: el organizador lee y registra solo; lo que no entiende lo deja en la hoja
 * REVISION_CLAUDE y Claude lo explica (escribe la resolucion). En la siguiente pasada el
 * organizador la aplica: registra, renombra y archiva.
 *
 * Hojas del libro maestro:
 *  - PROVEEDORES: proveedores que el lector reconoce. Se amplia sin tocar codigo (columnas
 *    "Palabras clave", "Concepto por defecto", "IVA por defecto", "Remitentes", "Patron n. factura").
 *  - REVISION_CLAUDE: cola de documentos que el lector no ha sabido interpretar.
 */

const GONSOL_REVIEW = {
  sheetName: 'REVISION_CLAUDE',
  headers: ['Fecha', 'Origen', 'Archivo', 'Enlace', 'Motivo', 'Texto leido', 'Estado', 'Resolucion (JSON)', 'Aplicado el'],
  col: { date: 0, origin: 1, file: 2, link: 3, reason: 4, text: 5, status: 6, resolution: 7, applied: 8 },
  suppliersSheetName: 'PROVEEDORES',
  maxTextChars: 3000
};

/* ---------- Importes y NIF ---------- */

/**
 * Busca en el texto una terna base + IVA = total coherente (IVA 4, 10 o 21 %) cuyo importe de IVA
 * tambien aparezca impreso. Es mucho mas fiable que fiarse de las etiquetas del OCR.
 * Devuelve { base, ivaPercent, ivaAmount, total } o null.
 */
function solveAmounts_(text, preferredIva) {
  const regex = /(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)/g;
  const found = [];
  let match;
  while ((match = regex.exec(String(text || ''))) !== null) {
    const value = parseMoney_(match[1]);
    if (value !== '' && value > 0 && found.indexOf(value) === -1) found.push(value);
  }
  const rates = [4, 10, 21];
  let best = null;
  for (let t = 0; t < found.length; t++) {
    for (let b = 0; b < found.length; b++) {
      if (found[b] >= found[t]) continue;
      for (let r = 0; r < rates.length; r++) {
        const iva = roundMoney_(found[b] * rates[r] / 100);
        if (Math.abs(found[b] + iva - found[t]) > 0.02) continue;
        const printed = found.some(function(value) { return Math.abs(value - iva) <= 0.02; });
        if (!printed) continue;
        const score = found[t] * 10 + (preferredIva !== '' && Number(preferredIva) === rates[r] ? 1 : 0);
        if (!best || score > best.score) {
          best = { base: found[b], ivaPercent: rates[r], ivaAmount: roundMoney_(found[t] - found[b]), total: found[t], score: score };
        }
      }
    }
  }
  return best ? { base: best.base, ivaPercent: best.ivaPercent, ivaAmount: best.ivaAmount, total: best.total } : null;
}

/** Formato de NIF/CIF/NIE espanol (y letra de control del NIF/NIE). */
function validNif_(value) {
  const nif = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return validCifControl_(nif);
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  if (/^\d{8}[A-Z]$/.test(nif)) return letters.charAt(Number(nif.slice(0, 8)) % 23) === nif.charAt(8);
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
    const n = Number(String('XYZ'.indexOf(nif.charAt(0))) + nif.slice(1, 8));
    return letters.charAt(n % 23) === nif.charAt(8);
  }
  return false;
}

/** Digito/letra de control del CIF: descarta lecturas del OCR que solo "parecen" un CIF (p. ej. una fecha). */
function validCifControl_(cif) {
  const digits = cif.slice(1, 8);
  let even = 0;
  let odd = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(digits.charAt(i));
    if (i % 2 === 0) {
      const doubled = n * 2;
      odd += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      even += n;
    }
  }
  const control = (10 - ((even + odd) % 10)) % 10;
  const last = cif.charAt(8);
  const letter = 'JABCDEFGHI'.charAt(control);
  const first = cif.charAt(0);
  if ('KPQRSNW'.indexOf(first) !== -1) return last === letter;
  if ('ABEH'.indexOf(first) !== -1) return last === String(control);
  return last === String(control) || last === letter;
}

/** El OCR lee a veces la letra del NIF propio mal (45313973U en lugar de V): se compara por los digitos. */
function isOwnNif_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return GONSOL_CLIENT_NIFS.some(function(own) { return digits.indexOf(own.replace(/\D/g, '')) !== -1; });
}

/* ---------- Proveedores desde la hoja PROVEEDORES ---------- */

var gonsolSheetSuppliersCache_ = null;

function sheetSuppliers_() {
  if (gonsolSheetSuppliersCache_) return gonsolSheetSuppliersCache_;
  gonsolSheetSuppliersCache_ = [];
  try {
    const sheet = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId).getSheetByName(GONSOL_REVIEW.suppliersSheetName);
    if (!sheet || sheet.getLastRow() < 2) return gonsolSheetSuppliersCache_;
    const values = sheet.getDataRange().getValues();
    const head = values[0].map(function(cell) { return normalizeKey_(cell); });
    const idx = function() {
      for (let a = 0; a < arguments.length; a++) {
        const position = head.indexOf(normalizeKey_(arguments[a]));
        if (position !== -1) return position;
      }
      return -1;
    };
    const c = {
      name: idx('Razón social', 'Razon social', 'Proveedor'),
      alias: idx('Proveedor'),
      nif: idx('CIF/NIF', 'NIF'),
      category: idx('Categoría habitual', 'Categoria habitual'),
      keywords: idx('Palabras clave'),
      concept: idx('Concepto por defecto'),
      iva: idx('IVA por defecto'),
      senders: idx('Remitentes'),
      numberPattern: idx('Patrón nº factura', 'Patron n. factura', 'Patron factura')
    };
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const name = c.name >= 0 ? String(row[c.name] || '').trim() : '';
      const nif = c.nif >= 0 ? String(row[c.nif] || '').toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
      if (!name && !nif) continue;
      const keywords = (c.keywords >= 0 ? String(row[c.keywords] || '') : '')
        .split(/[;,|]/).map(function(word) { return normalizeKey_(word); }).filter(Boolean);
      const senders = (c.senders >= 0 ? String(row[c.senders] || '') : '')
        .split(/[;,\s]+/).map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
      let numberRegex = null;
      if (c.numberPattern >= 0 && row[c.numberPattern]) {
        try { numberRegex = new RegExp(String(row[c.numberPattern]), 'i'); } catch (e) { numberRegex = null; }
      }
      gonsolSheetSuppliersCache_.push(makeSheetSupplier_({
        name: name,
        nif: nif,
        category: c.category >= 0 ? String(row[c.category] || '').trim() : '',
        concept: c.concept >= 0 ? String(row[c.concept] || '').trim() : '',
        iva: c.iva >= 0 && row[c.iva] !== '' ? Number(String(row[c.iva]).replace(',', '.').replace('%', '')) : '',
        keywords: keywords,
        senders: senders,
        numberRegex: numberRegex
      }));
    }
  } catch (error) {
    console.error('No se pudo leer PROVEEDORES: ' + error);
  }
  return gonsolSheetSuppliersCache_;
}

function makeSheetSupplier_(p) {
  return {
    key: normalizeKey_(p.name).slice(0, 20) || p.nif,
    name: p.name,
    nif: p.nif,
    defaultConcept: p.concept,
    defaultCategory: p.category || 'Materia prima',
    defaultIva: p.iva === '' || isNaN(p.iva) ? '' : p.iva,
    senders: p.senders,
    fromSheet: true,
    detect: function(upper, upperFileName) {
      const compact = normalizeKey_(upper);
      if (p.nif && compact.indexOf(p.nif) !== -1) return true;
      if (p.keywords.some(function(word) { return word && (compact.indexOf(word) !== -1 || normalizeKey_(upperFileName).indexOf(word) !== -1); })) return true;
      return false;
    },
    invoiceNumber: function(text, upper) {
      if (!p.numberRegex) return '';
      const found = String(text || '').match(p.numberRegex);
      return found ? (found[1] || found[0]) : '';
    }
  };
}

/** Proveedores conocidos: los de codigo mas los que se anaden en la hoja PROVEEDORES. */
function allSuppliers_() {
  return GONSOL_SUPPLIERS.concat(sheetSuppliers_());
}

/** Anade un proveedor nuevo a PROVEEDORES para que el lector lo reconozca la proxima vez. */
function learnSupplier_(r) {
  const sheet = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId).getSheetByName(GONSOL_REVIEW.suppliersSheetName);
  if (!sheet) return;
  const required = ['Palabras clave', 'Concepto por defecto', 'IVA por defecto', 'Remitentes', 'Patrón nº factura'];
  let head = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
  required.forEach(function(name) {
    if (head.map(normalizeKey_).indexOf(normalizeKey_(name)) === -1) {
      sheet.getRange(1, head.length + 1).setValue(name);
      head.push(name);
    }
  });
  const find = function(name) { return head.map(normalizeKey_).indexOf(normalizeKey_(name)); };
  const nifColumn = find('CIF/NIF');
  const wanted = String(r.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (wanted && nifColumn >= 0 && sheet.getLastRow() >= 2) {
    const nifs = sheet.getRange(2, nifColumn + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < nifs.length; i++) {
      if (String(nifs[i][0]).toUpperCase().replace(/[^A-Z0-9]/g, '') === wanted) return;
    }
  }
  const row = head.map(function() { return ''; });
  const put = function(name, value) { const p = find(name); if (p >= 0) row[p] = value; };
  put('Proveedor', r.proveedor || '');
  put('Razón social', r.proveedor || '');
  put('CIF/NIF', r.nif || '');
  put('Categoría habitual', r.categoria || '');
  put('Palabras clave', r.palabrasClave || '');
  put('Concepto por defecto', r.concepto || '');
  put('IVA por defecto', r.ivaPct !== undefined ? r.ivaPct : '');
  put('Remitentes', r.remitentes || '');
  put('Patrón nº factura', r.patronNumero || '');
  put('Observaciones', 'Aprendido con Claude el ' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy'));
  sheet.appendRow(row);
  gonsolSheetSuppliersCache_ = null;
}

/* ---------- Cola de revision ---------- */

function reviewSheet_() {
  const ss = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId);
  let sheet = ss.getSheetByName(GONSOL_REVIEW.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(GONSOL_REVIEW.sheetName);
    sheet.getRange(1, 1, 1, GONSOL_REVIEW.headers.length).setValues([GONSOL_REVIEW.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Deja un documento en la cola para que Claude lo explique. No duplica el mismo archivo. */
function queueForClaude_(file, reason, text, origin) {
  const sheet = reviewSheet_();
  const link = file.getUrl();
  if (sheet.getLastRow() >= 2) {
    const links = sheet.getRange(2, GONSOL_REVIEW.col.link + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < links.length; i++) {
      if (String(links[i][0]) === link) return false;
    }
  }
  const description = (file.getDescription && file.getDescription()) || '';
  const context = description ? '[' + description + '] ' : '';
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'),
    origin || 'Drive',
    file.getName(),
    link,
    reason,
    (context + String(text || '')).slice(0, GONSOL_REVIEW.maxTextChars),
    'pendiente',
    '',
    ''
  ]);
  return true;
}

/** Anota en la cola un correo sin PDF (enlace de descarga, etc.). */
function queueEmailLinkForClaude_(thread, message, links) {
  const sheet = reviewSheet_();
  const link = thread.getPermalink();
  if (sheet.getLastRow() >= 2) {
    const existing = sheet.getRange(2, GONSOL_REVIEW.col.link + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < existing.length; i++) {
      if (String(existing[i][0]) === link) return false;
    }
  }
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'),
    'Gmail (sin adjunto)',
    message.getSubject(),
    link,
    'Correo de factura sin PDF adjunto: descarga desde enlace o datos en el cuerpo',
    ('De: ' + message.getFrom() + ' | ' + message.getPlainBody().replace(/\s+/g, ' ') + ' | Enlaces: ' + links.join(' ')).slice(0, GONSOL_REVIEW.maxTextChars),
    'pendiente',
    '',
    ''
  ]);
  return true;
}

/**
 * Aplica las resoluciones que Claude ha escrito en REVISION_CLAUDE (Estado = "resuelto"):
 * registra la compra, renombra y archiva el documento y, si se pide, aprende el proveedor.
 * Resolucion (JSON): { fecha, proveedor, nif, numero, concepto, categoria, base, ivaPct, iva, total,
 *   pago, notas, aprender, palabrasClave, remitentes, patronNumero } o { descartar: true, notas }.
 */
function applyClaudeResolutions_() {
  const ss = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId);
  const queue = ss.getSheetByName(GONSOL_REVIEW.sheetName);
  if (!queue || queue.getLastRow() < 2) return [];
  const registry = ss.getSheetByName(GONSOL_CONFIG.registrySheetName);
  const duplicateIndex = buildDuplicateIndex_(registry);
  const values = queue.getRange(2, 1, queue.getLastRow() - 1, GONSOL_REVIEW.headers.length).getValues();
  const results = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (String(row[GONSOL_REVIEW.col.status]).toLowerCase() !== 'resuelto') continue;
    const line = i + 2;
    const mark = function(status, detail) {
      queue.getRange(line, GONSOL_REVIEW.col.status + 1).setValue(status);
      queue.getRange(line, GONSOL_REVIEW.col.applied + 1).setValue(
        Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm') + (detail ? ' · ' + detail : '')
      );
    };
    try {
      const r = JSON.parse(String(row[GONSOL_REVIEW.col.resolution]));
      if (r.descartar) {
        mark('descartado', r.notas || '');
        results.push({ line: line, status: 'descartado' });
        continue;
      }
      const result = registerResolvedDocument_(row[GONSOL_REVIEW.col.link], r, registry, duplicateIndex);
      if (r.aprender) learnSupplier_(r);
      mark(result === 'duplicate' ? 'duplicado' : 'aplicado', result === 'duplicate' ? 'ya estaba en REGISTRO' : '');
      results.push({ line: line, status: result });
    } catch (error) {
      mark('error', String(error && error.message ? error.message : error).slice(0, 200));
      results.push({ line: line, status: 'error' });
    }
  }
  if (results.length) rebuildMonthlyPurchasesSummary_(registry);
  return results;
}

function fileIdFromUrl_(url) {
  const match = String(url || '').match(/\/d\/([A-Za-z0-9_-]+)/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}

function parseResolutionDate_(value) {
  const text = String(value || '').trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function registerResolvedDocument_(link, r, registry, duplicateIndex) {
  const date = parseResolutionDate_(r.fecha);
  if (!date || !isValidDate_(date)) throw new Error('fecha no valida');
  const total = parseMoney_(r.total);
  if (total === '') throw new Error('falta el total');
  let base = r.base !== undefined && r.base !== '' ? parseMoney_(r.base) : '';
  let ivaAmount = r.iva !== undefined && r.iva !== '' ? parseMoney_(r.iva) : '';
  const ivaPercent = r.ivaPct !== undefined && r.ivaPct !== '' ? Number(String(r.ivaPct).replace(',', '.')) : '';
  if (base === '' && ivaPercent !== '') base = roundMoney_(Number(total) / (1 + ivaPercent / 100));
  if (ivaAmount === '' && base !== '') ivaAmount = roundMoney_(Number(total) - Number(base));
  if (base !== '' && ivaAmount !== '' && Math.abs(Number(base) + Number(ivaAmount) - Number(total)) > 0.05) {
    throw new Error('base + IVA no suma el total');
  }
  const nif = String(r.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!r.proveedor) throw new Error('falta el proveedor');
  const data = {
    date: date,
    dateText: formatDate_(date),
    type: 'compra',
    subtype: r.subtipo || 'factura',
    invoiceNumber: sanitizeInvoiceNumber_(r.numero || ''),
    provider: String(r.proveedor),
    nif: nif,
    concept: r.concepto || 'Compra',
    category: r.categoria || 'Materia prima',
    base: base,
    ivaPercent: ivaPercent === '' ? '' : ivaPercent + '%',
    ivaAmount: ivaAmount,
    total: total,
    status: r.pago || GONSOL_CONFIG.paidStatus,
    paymentMethod: r.metodoPago || '',
    month: GONSOL_MONTHS[date.getMonth()],
    quarter: 'T' + (Math.floor(date.getMonth() / 3) + 1),
    year: String(date.getFullYear())
  };
  const duplicateKey = makeDuplicateKey_(data.provider, data.invoiceNumber, data.total);
  if (duplicateIndex[duplicateKey]) return 'duplicate';
  const fileId = fileIdFromUrl_(link);
  if (!fileId) throw new Error('enlace sin archivo de Drive');
  const file = DriveApp.getFileById(fileId);
  const destination = getDestinationFolder_(data.year, data.quarter, data.month);
  file.setName(buildPurchaseFileName_(data).replace(/\.pdf$/i, '') + '.' + (/\.([A-Za-z0-9]+)$/.exec(file.getName()) || [0, 'pdf'])[1].toLowerCase());
  moveFileToFolder_(file, destination);
  appendRegistryRow_(registry, buildRegistryRow_(data, file, new Date(), 'sí', 'Resuelto con Claude' + (r.notas ? ' · ' + r.notas : '')));
  duplicateIndex[duplicateKey] = true;
  return 'registered';
}

/**
 * Archiva los documentos que ya estan registrados y revisados en REGISTRO pero siguen en la bandeja
 * o en REVISAR_MANUALMENTE: los mueve a 02_COMPRAS/<anio>/<trimestre>/<mes> con el nombre estandar.
 */
function archiveReviewedRegistryFiles_() {
  const sheet = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId).getSheetByName(GONSOL_CONFIG.registrySheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const input = DriveApp.getFolderById(GONSOL_CONFIG.inputFolderId);
  const review = getOrCreateChildFolder_(input, GONSOL_CONFIG.reviewFolderName);
  const awaiting = {};
  awaiting[input.getId()] = true;
  awaiting[review.getId()] = true;
  const values = sheet.getDataRange().getDisplayValues();
  const moved = [];
  for (let i = 1; i < values.length && moved.length < 20; i++) {
    const row = values[i];
    if (String(row[2]).toLowerCase() !== 'compra' || !/^s[ií]$/i.test(String(row[20]))) continue;
    const id = fileIdFromUrl_(row[18]);
    if (!id) continue;
    try {
      const file = DriveApp.getFileById(id);
      const parents = file.getParents();
      let pending = false;
      while (parents.hasNext()) { if (awaiting[parents.next().getId()]) pending = true; }
      if (!pending) continue;
      const date = parseRegistryDate_(row[0]);
      if (!date) continue;
      const total = parseMoney_(row[12]);
      const data = {
        dateText: formatDate_(date),
        provider: row[5],
        invoiceNumber: sanitizeInvoiceNumber_(row[4]),
        total: total
      };
      const extension = (/\.([A-Za-z0-9]+)$/.exec(file.getName()) || [0, 'pdf'])[1].toLowerCase();
      const name = buildPurchaseFileName_(data).replace(/\.pdf$/i, '') + '.' + extension;
      const destination = getDestinationFolder_(String(date.getFullYear()), 'T' + (Math.floor(date.getMonth() / 3) + 1), GONSOL_MONTHS[date.getMonth()]);
      file.setName(name);
      moveFileToFolder_(file, destination);
      sheet.getRange(i + 1, 20).setValue(name);
      moved.push(name);
    } catch (error) {
      console.error('No se pudo archivar ' + row[18] + ': ' + error);
    }
  }
  return moved;
}

/* ---------- Gmail: cualquier proveedor ---------- */

const GONSOL_GMAIL_ANY = {
  enabled: true,
  newerThan: '10d',
  invoiceWords: '(factura OR invoice OR "nuevo documento" OR recibo)',
  maxThreadsPerRun: 20,
  maxPdfBytes: 15 * 1024 * 1024
};

/**
 * Trae a la bandeja de Drive los PDF de cualquier correo reciente que parezca una factura
 * (no solo de los remitentes conocidos). Los correos de factura sin PDF (enlace de descarga)
 * se dejan en REVISION_CLAUDE. El hilo queda etiquetado para no repetirse.
 */
function importAnyInvoiceFromGmail_() {
  if (!GONSOL_GMAIL_ANY.enabled) return [];
  const label = GmailApp.getUserLabelByName(GONSOL_GMAIL_IMPORT.processedLabel)
    || GmailApp.createLabel(GONSOL_GMAIL_IMPORT.processedLabel);
  const inputFolder = DriveApp.getFolderById(GONSOL_CONFIG.inputFolderId);
  const base = GONSOL_GMAIL_ANY.invoiceWords + ' newer_than:' + GONSOL_GMAIL_ANY.newerThan
    + ' -label:' + GONSOL_GMAIL_IMPORT.processedLabel + ' -in:sent -in:drafts';
  const imported = [];

  GmailApp.search(base + ' has:attachment filename:pdf', 0, GONSOL_GMAIL_ANY.maxThreadsPerRun).forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      message.getAttachments({ includeInlineImages: false, includeAttachments: true }).forEach(function(attachment) {
        const name = attachment.getName();
        if (!/\.pdf$/i.test(name) || attachment.getSize() > GONSOL_GMAIL_ANY.maxPdfBytes) return;
        const storedName = 'EMAIL_' + message.getId().slice(0, 8) + '_' + name;
        if (inputFolder.getFilesByName(storedName).hasNext()) return;
        const file = inputFolder.createFile(attachment.copyBlob().setName(storedName));
        file.setDescription('Correo de ' + message.getFrom() + ' · ' + message.getSubject() + ' · ' + message.getDate().toISOString().slice(0, 10));
        imported.push(storedName);
      });
    });
    thread.addLabel(label);
  });

  GmailApp.search(base + ' -has:attachment', 0, GONSOL_GMAIL_ANY.maxThreadsPerRun).forEach(function(thread) {
    const message = thread.getMessages()[thread.getMessageCount() - 1];
    const links = (message.getPlainBody().match(/https?:\/\/[^\s)>\]]+/g) || [])
      .filter(function(url) { return /factura|invoice|\.pdf|download|descarg|view/i.test(url); }).slice(0, 5);
    if (links.length) queueEmailLinkForClaude_(thread, message, links);
    thread.addLabel(label);
  });
  if (imported.length) console.log('Gmail (cualquier proveedor): ' + JSON.stringify(imported));
  return imported;
}
