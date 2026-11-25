/**
 * Gonsol Drive Organizer
 *
 * Procesa facturas de compra escaneadas en Drive:
 * - OCR gratis mediante conversion temporal a Google Docs.
 * - Extrae campos principales con reglas.
 * - Evita duplicados.
 * - Registra en Google Sheets.
 * - Mueve a 02_COMPRAS/<AÑO>/<TRIMESTRE>.
 *
 * Requiere habilitar el servicio avanzado Drive API en Apps Script.
 */

const GONSOL_CONFIG = {
  inputFolderId: '1ETAzvmssbDM7cLDUEy89quY0xEnNecd4',
  purchasesRootFolderId: '1Q627xLAkvxB_MqUMCYPsTXRKoJIOvMvR',
  masterSpreadsheetId: '1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU',
  registrySheetName: 'REGISTRO',
  monthlyPurchasesSheetName: 'COMPRAS_MENSUAL',
  reviewFolderName: 'REVISAR_MANUALMENTE',
  duplicatesFolderName: 'DUPLICADOS',
  maxFilesPerRun: 20,
  ocrLanguage: 'es',
  paidStatus: 'pagado',
  minConfidence: 0.8
};

/**
 * Token opcional para el endpoint web (doGet). Si se deja vacio, el endpoint
 * responde sin pedir clave (URL larga e impredecible). Si se pone un valor,
 * habra que llamar con ?key=ESE_VALOR. Mantener en blanco salvo que se quiera
 * endurecer; en ese caso, poner el mismo valor en Vercel/app.
 */
const REGISTRY_WEBAPP_TOKEN = '';

/**
 * Endpoint web: publica el registro maestro (REGISTRO!A2:V) como JSON para que
 * la app lo lea sin necesidad de iniciar sesion de Google en el movil.
 *
 * Despliegue (una sola vez): Apps Script -> Implementar -> Nueva implementacion
 * -> Aplicacion web -> Ejecutar como: Yo -> Quien tiene acceso: Cualquier usuario.
 * Copiar la URL .../exec resultante.
 *
 * Devuelve: { ok:true, rows:[[...]], count, generatedAt }
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (REGISTRY_WEBAPP_TOKEN && String(params.key || '') !== REGISTRY_WEBAPP_TOKEN) {
      return jsonOutput_({ ok: false, error: 'unauthorized' });
    }
    // La lectura del Registro Maestro sirve también como punto de auto-reparación
    // del calendario. El fallo de autorización se informa, pero NUNCA rompe
    // la lectura del registro.
    var scheduler = ensurePurchaseInvoiceScheduleFromWeb_();
    var ss = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId);
    var sheet = ss.getSheetByName(GONSOL_CONFIG.registrySheetName);
    if (!sheet) {
      return jsonOutput_({ ok: false, error: 'registry_sheet_not_found' });
    }
    var lastRow = sheet.getLastRow();
    var rows = [];
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
      var tz = ss.getSpreadsheetTimeZone() || 'Europe/Madrid';
      rows = values.map(function (row) {
        return row.map(function (cell) {
          if (cell instanceof Date) {
            return Utilities.formatDate(cell, tz, 'yyyy-MM-dd');
          }
          return cell;
        });
      });
    }
    return jsonOutput_({
      ok: true,
      rows: rows,
      count: rows.length,
      source: 'apps-script-webapp',
      scheduler: scheduler,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function ensurePurchaseInvoiceScheduleFromWeb_() {
  try {
    importAnyInvoiceFromGmail_();
  } catch (error) {
    console.error('Gmail (cualquier proveedor) fallo: ' + error);
  }
  try {
    applyClaudeResolutions_();
  } catch (error) {
    console.error('Aplicar resoluciones de Claude fallo: ' + error);
  }
  try {
    ensurePurchaseInvoiceSchedule_();
    var triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === 'processPurchaseInvoicesDaily';
    });
    return {
      ok: triggers.length === 4,
      triggerCount: triggers.length,
      scheduleVersion: PropertiesService.getScriptProperties()
        .getProperty('purchaseInvoiceTriggerScheduleVersion') || ''
    };
  } catch (error) {
    var authRequired = true;
    try {
      var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, GONSOL_REQUIRED_SCOPES);
      authRequired = String(authInfo.getAuthorizationStatus()) !== 'NOT_REQUIRED';
    } catch (_) {}
    console.error('Auto-reparacion de triggers pendiente: ' + error);
    return {
      ok: false,
      authorizationRequired: authRequired,
      error: String(error && error.message ? error.message : error)
    };
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Importacion de facturas desde Gmail: GAYCA envia por email los mismos PDF que
 * antes habia que escanear. El agente los coge del correo, los deja en la bandeja
 * de Drive y el resto del flujo (OCR -> REGISTRO -> archivo por mes) sigue igual.
 *
 * - Solo correos posteriores a `after` (evita reimportar meses ya contabilizados).
 * - Los hilos procesados se etiquetan (processedLabel) para no repetirlos.
 * - IMPORTANTE: desde que esto este activo, las facturas de GAYCA NO se escanean
 *   a mano (llegarian duplicadas: el numero FV del email no casa con el del escaneo).
 * - Tras desplegar, hay que abrir el editor de Apps Script y ejecutar una funcion
 *   una vez para autorizar el permiso nuevo de Gmail.
 */
const GONSOL_GMAIL_IMPORT = {
  enabled: true,
  processedLabel: 'FACTURAS_IMPORTADAS',
  auditSheetName: 'IMPORT_EMAIL_LOG',
  after: '2026/07/01',
  senders: [
    'gayca@frutasypatatasgayca.com',
    'facturaelectronicasolred@facturasolred.repsol.com'
  ],
  maxThreadsPerRun: 100
};

/**
 * Ejecutar UNA VEZ a mano tras desplegar con permisos nuevos: fuerza la pantalla
 * de autorización (incluye Gmail y Drive). No modifica nada; solo pide los permisos.
 */
function autorizarPermisos() {
  var gmailNoLeidos = GmailApp.getInboxUnreadCount();
  var carpetaRaiz = DriveApp.getRootFolder().getName();
  Logger.log('Autorización OK · Gmail no leídos: ' + gmailNoLeidos + ' · Drive raíz: ' + carpetaRaiz);
  return { gmailNoLeidos: gmailNoLeidos, carpetaRaiz: carpetaRaiz };
}

/**
 * Importa únicamente facturas PDF de remitentes autorizados. La etiqueta de Gmail
 * es la marca humana/persistente de "ya procesado" y el log por messageId+SHA256
 * y por SHA256 evita reingestas incluso si el proveedor reenvía el mismo PDF.
 */
function importInvoicesFromGmail_() {
  if (!GONSOL_GMAIL_IMPORT.enabled) return { imported: 0, alreadyKnown: 0 };

  const label = GmailApp.getUserLabelByName(GONSOL_GMAIL_IMPORT.processedLabel)
    || GmailApp.createLabel(GONSOL_GMAIL_IMPORT.processedLabel);
  const inputFolder = DriveApp.getFolderById(GONSOL_CONFIG.inputFolderId);
  const spreadsheet = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId);
  let auditSheet = spreadsheet.getSheetByName(GONSOL_GMAIL_IMPORT.auditSheetName);
  if (!auditSheet) auditSheet = spreadsheet.insertSheet(GONSOL_GMAIL_IMPORT.auditSheetName);
  ensureEmailImportAuditHeader_(auditSheet);
  const known = buildEmailImportIndex_(auditSheet);
  const now = new Date();
  const summary = { imported: 0, alreadyKnown: 0, scannedThreads: 0, importedFiles: [] };

  GONSOL_GMAIL_IMPORT.senders.forEach(function(sender) {
    const query = 'from:' + sender
      + ' has:attachment filename:pdf'
      + ' after:' + GONSOL_GMAIL_IMPORT.after
      + ' -label:' + GONSOL_GMAIL_IMPORT.processedLabel;
    const threads = GmailApp.search(query, 0, GONSOL_GMAIL_IMPORT.maxThreadsPerRun);
    summary.scannedThreads += threads.length;

    threads.forEach(function(thread) {
      let handled = false;
      thread.getMessages().forEach(function(message) {
        message.getAttachments({ includeInlineImages: false, includeAttachments: true }).forEach(function(attachment) {
          const name = String(attachment.getName() || '');
          if (!/\.pdf$/i.test(name)) return;
          const bytes = attachment.getBytes();
          const digest = sha256Hex_(bytes);
          const sourceKey = message.getId() + ':' + digest;
          handled = true;

          if (known.sourceKeys[sourceKey] || known.digests[digest]) {
            summary.alreadyKnown++;
            return;
          }

          const stagedName = 'EMAIL_' + message.getId() + '_' + name;
          const file = inputFolder.createFile(attachment.copyBlob().setName(stagedName));
          auditSheet.appendRow([
            sourceKey,
            message.getId(),
            Utilities.formatDate(message.getDate(), 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss'),
            message.getFrom(),
            message.getSubject(),
            name,
            digest,
            file.getId(),
            file.getUrl(),
            'importado',
            Utilities.formatDate(now, 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss')
          ]);
          known.sourceKeys[sourceKey] = true;
          known.digests[digest] = true;
          summary.imported++;
          summary.importedFiles.push(stagedName);
        });
      });
      if (handled) thread.addLabel(label);
    });
  });

  console.log('Gmail import: ' + JSON.stringify(summary, null, 2));
  return summary;
}

function ensureEmailImportAuditHeader_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow([
    'Clave origen', 'ID mensaje Gmail', 'Fecha correo', 'Remitente', 'Asunto',
    'Nombre adjunto', 'SHA-256', 'ID archivo Drive', 'Enlace Drive', 'Estado', 'Importado el'
  ]);
  sheet.setFrozenRows(1);
}

function buildEmailImportIndex_(sheet) {
  const index = { sourceKeys: {}, digests: {} };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return index;
  sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues().forEach(function(row) {
    if (row[0]) index.sourceKeys[row[0]] = true;
    if (row[6]) index.digests[row[6]] = true;
  });
  return index;
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(byte) {
      const value = byte < 0 ? byte + 256 : byte;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}

const GONSOL_MONTHS = [
  '01_ENERO',
  '02_FEBRERO',
  '03_MARZO',
  '04_ABRIL',
  '05_MAYO',
  '06_JUNIO',
  '07_JULIO',
  '08_AGOSTO',
  '09_SEPTIEMBRE',
  '10_OCTUBRE',
  '11_NOVIEMBRE',
  '12_DICIEMBRE'
];

/**
 * NIF(s) del propio negocio (aparecen como CLIENTE en las facturas de compra).
 * Se excluyen al buscar el NIF del proveedor para no confundirlos.
 */
const GONSOL_CLIENT_NIFS = ['45313973V'];

/**
 * Perfiles de proveedores habituales. Permiten extraer proveedor, NIF y numero
 * de factura de forma determinista en lugar de depender de heuristicas genericas.
 */
const GONSOL_SUPPLIERS = [
  {
    key: 'GAYCA',
    name: 'FRUTAS Y PATATAS GAYCA, S.A.',
    nif: 'A04037677',
    defaultConcept: 'PATATAS AGRIA',
    defaultCategory: 'Materia prima',
    defaultIva: 4,
    detect: function(upper, upperFileName) {
      return /GAYCA|FRUTAS\s+Y\s+PATATAS/.test(upper)
        || /A04037677/.test(upper)
        || /GAYCA/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      // Formato actual impreso por GAYCA: 006/0002.171.
      var current = upper.match(/\b006\s*\/\s*0002\s*[.]\s*\d{3,4}\b/);
      if (current) return current[0].replace(/\s+/g, '');
      // Formato historico: FV006-00000996.
      var legacy = upper.match(/FV\s*\d{2,4}\s*[-\/]?\s*\d{4,}/);
      return legacy ? legacy[0].replace(/\s+/g, '') : '';
    }
  },
  {
    key: 'FRUTCAYCAZ',
    name: 'J. EXPOSITO CAZORLA E HIJOS, S.L.',
    nif: 'B04854154',
    defaultConcept: '',
    defaultCategory: 'Materia prima',
    defaultIva: 4,
    detect: function(upper, upperFileName) {
      return /FRUT[A-Z]*CAYCAZ|FRUT[A-Z]*GAYCAZ|EXPOSITO|CAZORLA\s+E\s+HIJOS/.test(upper)
        || /B04854154/.test(upper)
        || /FRUT[A-Z]*CAYCAZ|FRUT[A-Z]*GAYCAZ/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      // Ej: 26004132. Numero numerico, preferimos el que va junto a "FACTURA".
      var near = upper.match(/FACTURA[^\d]{0,20}(\d{6,9})/);
      if (near) return near[1];
      var loose = upper.match(/\b(2[5-9]\d{6})\b/);
      return loose ? loose[1] : '';
    }
  },
  {
    key: 'HIGIENLAB',
    name: 'HIGIENLAB 2020 S.L.',
    nif: 'B42743211',
    defaultConcept: '',
    defaultCategory: 'Envases',
    defaultIva: 21,
    detect: function(upper, upperFileName) {
      return /HIGIENLAB/.test(upper)
        || /B42743211/.test(upper)
        || /HIGIENLAB/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      // Ej: 26F00973
      var match = upper.match(/\b(\d{2}F\d{4,7})\b/);
      return match ? match[1] : '';
    }
  },
  {
    key: 'SALCEDO',
    name: 'PATATAS SALCEDO, S.L.',
    nif: 'B04368288',
    defaultConcept: 'PATATAS AGRIA',
    defaultCategory: 'Materia prima',
    defaultIva: 4,
    detect: function(upper, upperFileName) {
      return /PATATAS\s+SALCEDO|SALCEDO,?\s*S\.?\s*L|CAMINO\s+DE\s+LA\s+GOLETA/.test(upper)
        || /B04368288/.test(upper.replace(/[^A-Z0-9]/g, ''))
        || /SALCEDO/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      // Ej: 02/060891. El numero de factura va tras la palabra FACTURA.
      var near = upper.match(/FACTURA[^\d]{0,12}(\d{2}\/\d{6})/);
      if (near) return near[1];
      var loose = upper.match(/\b(0\d\/\d{6})\b/);
      return loose ? loose[1] : '';
    }
  },
  {
    key: 'SOLRED',
    name: 'SOLRED, S.A. (Repsol)',
    nif: '',
    defaultConcept: 'Combustible',
    defaultCategory: 'Combustible',
    defaultIva: 21,
    detect: function(upper, upperFileName) {
      return /SOLRED|REPSOL|CAMPSA|PETRONOR/.test(upper)
        || /SOLRED|REPSOL/.test(upperFileName);
    },
    invoiceNumber: function(text, upper) {
      var match = upper.match(/FACTURA[^\d]{0,20}(\d{6,})/);
      return match ? match[1] : '';
    }
  }
];

function processPurchaseInvoicesDaily() {
  // La ingesta de Gmail debe ejecutarse aunque la reparacion del calendario
  // necesite una nueva autorizacion. Un fallo de ScriptApp nunca debe bloquear
  // la recogida de facturas ya autorizada.
  try {
    importInvoicesFromGmail_();
  } catch (error) {
    console.error('Gmail import fallo (se continua con la bandeja): ' + error);
  }
  try {
    ensurePurchaseInvoiceSchedule_();
  } catch (error) {
    console.error('Reparacion del calendario de triggers fallo (se continua): ' + error);
  }
  const inputFolder = DriveApp.getFolderById(GONSOL_CONFIG.inputFolderId);
  const reviewFolder = getOrCreateChildFolder_(inputFolder, GONSOL_CONFIG.reviewFolderName);
  const duplicateFolder = getOrCreateChildFolder_(reviewFolder, GONSOL_CONFIG.duplicatesFolderName);
  const sheet = SpreadsheetApp
    .openById(GONSOL_CONFIG.masterSpreadsheetId)
    .getSheetByName(GONSOL_CONFIG.registrySheetName);

  if (!sheet) {
    throw new Error('No existe la hoja ' + GONSOL_CONFIG.registrySheetName);
  }

  const duplicateIndex = buildDuplicateIndex_(sheet);
  const files = inputFolder.getFiles();
  const results = [];
  let processed = 0;

  while (files.hasNext() && processed < GONSOL_CONFIG.maxFilesPerRun) {
    const file = files.next();
    if (!isSupportedInvoiceFile_(file)) {
      continue;
    }

    processed++;
    try {
      const result = processOnePurchaseInvoice_(file, sheet, duplicateIndex, reviewFolder, duplicateFolder);
      results.push(result);
    } catch (error) {
      moveFileToFolder_(file, reviewFolder);
      results.push({
        fileName: file.getName(),
        status: 'error',
        error: String(error && error.message ? error.message : error)
      });
    }
  }

  try {
    archiveReviewedRegistryFiles_();
  } catch (error) {
    console.error('Archivar documentos revisados fallo: ' + error);
  }
  rebuildMonthlyPurchasesSummary_(sheet);
  reorganizePurchasesByMonth_();

  console.log(JSON.stringify(results, null, 2));
  return results;
}

/**
 * Mueve a su subcarpeta de mes las facturas que hayan quedado sueltas
 * directamente dentro de un trimestre (02_COMPRAS/<anio>/T#/<archivo>).
 * El mes se deduce del prefijo de fecha del nombre (AAAA-MM-DD_...).
 * Se ejecuta cada dia (auto-reparacion) y tambien se puede lanzar a mano.
 */
function reorganizePurchasesByMonth_() {
  const root = DriveApp.getFolderById(GONSOL_CONFIG.purchasesRootFolderId);
  const moved = [];
  const years = root.getFolders();
  while (years.hasNext()) {
    const yearFolder = years.next();
    const quarters = yearFolder.getFolders();
    while (quarters.hasNext()) {
      const quarterFolder = quarters.next();
      if (!/^T[1-4]$/.test(quarterFolder.getName())) continue;
      const looseFiles = [];
      const files = quarterFolder.getFiles();
      while (files.hasNext()) looseFiles.push(files.next());
      looseFiles.forEach(function(file) {
        const match = file.getName().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return;
        const monthIndex = Number(match[2]) - 1;
        if (monthIndex < 0 || monthIndex > 11) return;
        const monthName = GONSOL_MONTHS[monthIndex];
        const monthFolder = getOrCreateChildFolder_(quarterFolder, monthName);
        file.moveTo(monthFolder);
        moved.push({ file: file.getName(), to: monthName });
      });
    }
  }
  if (moved.length) console.log('Reorganizadas por mes: ' + JSON.stringify(moved, null, 2));
  return moved;
}

function processOnePurchaseInvoice_(file, sheet, duplicateIndex, reviewFolder, duplicateFolder) {
  const text = ocrFileToText_(file);
  const extracted = extractPurchaseInvoiceData_(text, file.getName());
  const now = new Date();

  // Lo que el lector no entiende NO se registra: se deja a Claude para que lo explique
  // (hoja REVISION_CLAUDE) y se archiva en la carpeta de revision.
  let reason = '';
  if (extracted.isCredit) reason = 'Devolucion, abono o rectificativa: hay que decidir como registrarla';
  else if (!extracted.supplierKnown) reason = 'Proveedor desconocido (' + (extracted.provider || 'sin nombre') + ')';
  else if (!extracted.amountsCoherent) reason = 'Importes no coherentes (base + IVA distinto del total)';
  else if (extracted.confidence < GONSOL_CONFIG.minConfidence || extracted.requiresReview) reason = 'Datos insuficientes: ' + (extracted.observations || 'faltan campos');
  if (reason) {
    queueForClaude_(file, reason, text, file.getDescription() ? 'Gmail' : 'Drive');
    moveFileToFolder_(file, reviewFolder);
    return { fileName: file.getName(), status: 'queued', reason: reason };
  }

  const duplicateKey = makeDuplicateKey_(extracted.provider, extracted.invoiceNumber, extracted.total);
  if (duplicateIndex[duplicateKey]) {
    moveFileToFolder_(file, duplicateFolder);
    return { fileName: file.getName(), status: 'duplicate', duplicateKey: duplicateKey };
  }

  const destination = getDestinationFolder_(extracted.year, extracted.quarter, extracted.month);
  const newName = buildPurchaseFileName_(extracted);
  file.setName(newName);
  moveFileToFolder_(file, destination);

  appendRegistryRow_(sheet, buildRegistryRow_(extracted, file, now, 'sí', 'OCR automatico'));
  duplicateIndex[duplicateKey] = true;

  return {
    fileName: newName,
    status: 'registered',
    folder: destination.getName(),
    confidence: extracted.confidence
  };
}

const GONSOL_TRIGGER_SCHEDULE_VERSION = 'v4';
const GONSOL_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/script.scriptapp'
];

function setupDailyPurchaseInvoiceTrigger() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, GONSOL_REQUIRED_SCOPES);
  installPurchaseInvoiceTriggers_();
  PropertiesService.getScriptProperties()
    .setProperty('purchaseInvoiceTriggerScheduleVersion', GONSOL_TRIGGER_SCHEDULE_VERSION);
}

function bootstrapPurchasePipeline() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, GONSOL_REQUIRED_SCOPES);
  setupDailyPurchaseInvoiceTrigger();
  const gmail = importInvoicesFromGmail_();
  const processing = processPurchaseInvoicesDaily();
  return {
    ok: true,
    triggerCount: ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === 'processPurchaseInvoicesDaily';
    }).length,
    gmail: gmail,
    processed: processing.length
  };
}

function purchasePipelineHealth() {
  const auth = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, GONSOL_REQUIRED_SCOPES);
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'processPurchaseInvoicesDaily';
  });
  return {
    ok: true,
    authorizationStatus: String(auth.getAuthorizationStatus()),
    authorizedScopes: auth.getAuthorizedScopes ? auth.getAuthorizedScopes() : [],
    triggerCount: triggers.length,
    scheduleVersion: PropertiesService.getScriptProperties()
      .getProperty('purchaseInvoiceTriggerScheduleVersion') || '',
    processedLabel: GONSOL_GMAIL_IMPORT.processedLabel
  };
}

function ensurePurchaseInvoiceSchedule_() {
  const versionKey = 'purchaseInvoiceTriggerScheduleVersion';
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(versionKey) === GONSOL_TRIGGER_SCHEDULE_VERSION) return;
  installPurchaseInvoiceTriggers_();
  props.setProperty(versionKey, GONSOL_TRIGGER_SCHEDULE_VERSION);
}

function installPurchaseInvoiceTriggers_() {
  deleteTriggersForFunction_('processPurchaseInvoicesDaily');
  [8, 12, 16, 20].forEach(function(hour) {
    ScriptApp
      .newTrigger('processPurchaseInvoicesDaily')
      .timeBased()
      .atHour(hour)
      .nearMinute(0)
      .everyDays(1)
      .inTimezone('Europe/Madrid')
      .create();
  });
}

function testPurchaseInvoiceOcrOnly() {
  const folder = DriveApp.getFolderById(GONSOL_CONFIG.inputFolderId);
  const files = folder.getFiles();
  if (!files.hasNext()) {
    throw new Error('No hay archivos en la carpeta de entrada.');
  }
  const file = files.next();
  const text = ocrFileToText_(file);
  console.log(text.slice(0, 4000));
  return text;
}

function rebuildPurchaseMonthlySummary() {
  const spreadsheet = SpreadsheetApp.openById(GONSOL_CONFIG.masterSpreadsheetId);
  const registrySheet = spreadsheet.getSheetByName(GONSOL_CONFIG.registrySheetName);
  if (!registrySheet) {
    throw new Error('No existe la hoja ' + GONSOL_CONFIG.registrySheetName);
  }
  rebuildMonthlyPurchasesSummary_(registrySheet);
}

/**
 * Recuperacion puntual de compras del 2T 2026 que no estaban en el registro.
 * Datos leidos manualmente del PDF (precisos). Cada factura entra en SU mes.
 * Se puede ejecutar varias veces: no duplica (control por proveedor+numero+total).
 * Cuando ya esten registradas, esta funcion se puede borrar.
 */
function importBacklogT2_2026() {
  const sheet = SpreadsheetApp
    .openById(GONSOL_CONFIG.masterSpreadsheetId)
    .getSheetByName(GONSOL_CONFIG.registrySheetName);
  if (!sheet) {
    throw new Error('No existe la hoja ' + GONSOL_CONFIG.registrySheetName);
  }

  const backlog = [
    {
      fileId: '1OAsstG-W7REl9ccb9puitzW0JQEZHn-a',
      date: '2026-04-25',
      number: '26003435',
      provider: 'J. EXPOSITO CAZORLA E HIJOS, S.L.',
      nif: 'B04854154',
      concept: 'LECHUGA B.2UND.LUCAS',
      category: 'Materia prima',
      base: 14.00,
      ivaPercent: 4,
      ivaAmount: 0.56,
      total: 14.56
    },
    {
      fileId: '1HMz692UXG4IRy0fru5kq9B-RPeAtTu2h',
      date: '2026-04-30',
      number: '26003572',
      provider: 'J. EXPOSITO CAZORLA E HIJOS, S.L.',
      nif: 'B04854154',
      concept: 'PATATA AGRIA NUEVA',
      category: 'Materia prima',
      base: 63.00,
      ivaPercent: 4,
      ivaAmount: 2.52,
      total: 65.52
    }
  ];

  const duplicateIndex = buildDuplicateIndex_(sheet);
  const now = new Date();
  const results = [];

  backlog.forEach(function(item) {
    const key = makeDuplicateKey_(item.provider, item.number, item.total);
    if (duplicateIndex[key]) {
      results.push({ number: item.number, status: 'ya_existe' });
      return;
    }
    const parts = item.date.split('-');
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const data = {
      dateText: item.date,
      type: 'compra',
      subtype: 'factura',
      invoiceNumber: item.number,
      provider: item.provider,
      nif: item.nif,
      concept: item.concept,
      category: item.category,
      base: item.base,
      ivaPercent: item.ivaPercent,
      ivaAmount: item.ivaAmount,
      total: item.total,
      status: GONSOL_CONFIG.paidStatus,
      paymentMethod: '',
      month: GONSOL_MONTHS[dateObj.getMonth()],
      quarter: 'T' + (Math.floor(dateObj.getMonth() / 3) + 1),
      year: String(dateObj.getFullYear()),
      observations: ''
    };

    let file;
    try {
      file = DriveApp.getFileById(item.fileId);
    } catch (error) {
      file = { getUrl: function() { return ''; }, getName: function() { return item.number + '.pdf'; } };
    }

    appendRegistryRow_(sheet, buildRegistryRow_(data, file, now, 'sí', 'Recuperada manualmente (no estaba en el registro)'));
    duplicateIndex[key] = true;
    results.push({ number: item.number, status: 'anadida' });
  });

  rebuildMonthlyPurchasesSummary_(sheet);
  console.log(JSON.stringify(results, null, 2));
  return results;
}

function ocrFileToText_(file) {
  const tempName = 'OCR_TMP_' + file.getName() + '_' + new Date().getTime();
  const resource = {
    name: tempName,
    mimeType: MimeType.GOOGLE_DOCS
  };

  const tempDoc = Drive.Files.copy(resource, file.getId(), {
    ocrLanguage: GONSOL_CONFIG.ocrLanguage,
    supportsAllDrives: true
  });

  Utilities.sleep(1500);

  try {
    const doc = DocumentApp.openById(tempDoc.id);
    return normalizeText_(doc.getBody().getText());
  } finally {
    DriveApp.getFileById(tempDoc.id).setTrashed(true);
  }
}

function extractPurchaseInvoiceData_(text, originalFileName) {
  const clean = normalizeText_(text);
  const upper = clean.toUpperCase();
  const profile = detectSupplier_(upper, originalFileName);

  const date = extractDate_(clean, originalFileName);
  // Terna base + IVA = total coherente (con el IVA impreso): mas fiable que las etiquetas del OCR.
  const solved = solveAmounts_(clean, profile ? profile.defaultIva : '');
  const total = solved ? solved.total : extractTotal_(clean);
  const tax = solved
    ? { base: solved.base, ivaPercent: solved.ivaPercent, ivaAmount: solved.ivaAmount }
    : extractTax_(clean, total, profile ? profile.defaultIva : '');
  const provider = profile ? profile.name : extractProvider_(clean, upper, originalFileName);
  const nif = extractSupplierNif_(upper, profile);
  const invoiceNumber = extractInvoiceNumber_(clean, upper, profile);

  let concept = extractConcept_(upper);
  if ((!concept || concept === 'Compra') && profile && profile.defaultConcept) {
    concept = profile.defaultConcept;
  }
  let category = classifyPurchaseCategory_(upper);
  if (!category && profile && profile.defaultCategory) {
    category = profile.defaultCategory;
  }

  const year = date ? String(date.getFullYear()) : '';
  const month = date ? GONSOL_MONTHS[date.getMonth()] : '';
  const quarter = date ? 'T' + (Math.floor(date.getMonth() / 3) + 1) : '';

  const supplierKnown = !!profile;
  const missing = [];
  if (!date) missing.push('fecha');
  if (!provider) missing.push('proveedor');
  if (!invoiceNumber) missing.push('numero');
  if (!total) missing.push('total');

  // Una factura sin numero, fecha, proveedor o total no entra en el registro
  // definitivo aunque el remitente sea conocido. Se deriva a revision para evitar
  // compras ambiguas y duplicados imposibles de reconciliar en FactuPapa Next.
  const requiresReview = missing.length > 0;

  const confidence = calculateConfidence_(missing, nif, tax.base, category, supplierKnown);

  let observations = '';
  if (missing.length) {
    observations = 'Faltan datos: ' + missing.join(', ');
  }
  if (supplierKnown && !requiresReview && missing.length) {
    observations = 'Proveedor reconocido (' + profile.key + '). Revisar: ' + missing.join(', ');
  }

  return {
    date: date,
    dateText: date ? formatDate_(date) : '',
    type: 'compra',
    subtype: 'factura',
    invoiceNumber: invoiceNumber || '',
    provider: provider || '',
    nif: nif || '',
    concept: concept || 'Compra',
    category: category || 'Materia prima',
    base: tax.base || '',
    ivaPercent: tax.ivaPercent || '',
    ivaAmount: tax.ivaAmount || '',
    total: total || '',
    status: GONSOL_CONFIG.paidStatus,
    paymentMethod: '',
    month: month,
    quarter: quarter,
    year: year,
    confidence: confidence,
    requiresReview: requiresReview,
    observations: observations,
    supplierKnown: supplierKnown,
    isCredit: /DEVOLUCI[ÓO]N|ABONO|RECTIFICATIVA|NOTA\s+DE\s+CR[ÉE]DITO/.test(upper),
    amountsCoherent: !!solved,
    validNif: !!(nif && validNif_(nif))
  };
}

function detectSupplier_(upper, fileName) {
  const upperFileName = String(fileName || '').toUpperCase();
  // Version compacta del texto (solo letras/numeros): el OCR a menudo devuelve el
  // NIF con puntos, guiones o espacios ("B-42.743.211") y el test literal fallaba.
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  const suppliers = allSuppliers_();
  for (let i = 0; i < suppliers.length; i++) {
    const supplier = suppliers[i];
    if (supplier.detect(upper, upperFileName)) return supplier;
    if (supplier.nif && compact.indexOf(supplier.nif) !== -1) return supplier;
  }
  return null;
}

function extractSupplierNif_(upper, profile) {
  // Si conocemos el proveedor, su NIF es la fuente mas fiable.
  if (profile && profile.nif) return profile.nif;

  const found = [];
  const regex = /\b([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z])\b/g;
  let match;
  while ((match = regex.exec(upper)) !== null) {
    found.push(match[1]);
  }
  // Segunda pasada sobre el texto compactado: captura NIF con separadores
  // ("B-42.743.211", "B 42743211") que la primera pasada no ve.
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  const compactRegex = /([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J])/g;
  while ((match = compactRegex.exec(compact)) !== null) {
    if (found.indexOf(match[1]) === -1) found.push(match[1]);
  }
  // Descarta los NIF propios (cliente) para no confundirlos con el proveedor.
  const filtered = found.filter(function(nif) {
    return GONSOL_CLIENT_NIFS.indexOf(nif) === -1 && !isOwnNif_(nif) && validNif_(nif);
  });
  return filtered[0] || '';
}

function extractDate_(text, fileName) {
  // Preferimos la fecha de emision (junto a "FECHA"), no la de vencimiento o lote.
  const near = text.match(/FECHA[^\d]{0,15}(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/i);
  if (near) {
    const issueDate = new Date(Number(near[3]), Number(near[2]) - 1, Number(near[1]));
    if (isValidDate_(issueDate)) return issueDate;
  }

  const candidates = [];
  const sources = [text, fileName || ''];
  sources.forEach(function(source) {
    const patterns = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2})/g,
      /(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
      /(\d{1,2})\s+(ene|enero|feb|febrero|mar|marzo|abr|abril|may|mayo|jun|junio|jul|julio|ago|agosto|sep|septiembre|oct|octubre|nov|noviembre|dic|diciembre)\s+(20\d{2})/gi
    ];

    let match;
    while ((match = patterns[0].exec(source)) !== null) {
      candidates.push(new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    }
    while ((match = patterns[1].exec(source)) !== null) {
      candidates.push(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
    while ((match = patterns[2].exec(source)) !== null) {
      candidates.push(new Date(Number(match[3]), monthNameToNumber_(match[2]), Number(match[1])));
    }
  });

  return candidates.filter(isValidDate_)[0] || null;
}

function extractTotal_(text) {
  // Preferimos el importe etiquetado como TOTAL FACTURA / TOTAL A PAGAR
  // (evita coger por error el numero de unidades o el "Bruto").
  const labeled = text.match(/(?:TOTAL\s*FACTURA|IMPORTE\s*TOTAL|TOTAL\s*A\s*PAGAR)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/i);
  if (labeled) {
    const labeledValue = parseMoney_(labeled[1]);
    if (labeledValue !== '') return labeledValue;
  }
  const patterns = [
    /(?:TOTAL\s*(?:FACTURA)?|IMPORTE\s*TOTAL|TOTAL\s*A\s*PAGAR)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi,
    /(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})\s*(?:EUR|EUROS|€)/gi
  ];
  return maxMoneyMatch_(text, patterns);
}

function extractTax_(text, total, defaultIvaPercent) {
  let ivaPercent = extractIvaPercent_(text);
  let ivaAmount = extractIvaAmount_(text);
  let base = extractBase_(text);

  // Para alimentacion el IVA habitual es 4%: si no se lee, usamos el del proveedor.
  if (ivaPercent === '' && defaultIvaPercent !== '' && defaultIvaPercent != null) {
    ivaPercent = defaultIvaPercent;
  }

  if (!base && total && ivaPercent !== '') {
    base = roundMoney_(Number(total) / (1 + Number(ivaPercent) / 100));
  }

  if (base && total) {
    const computedIva = roundMoney_(Number(total) - Number(base));
    if (!ivaAmount || ivaAmount >= Number(base) * 0.5 || Math.abs(Number(ivaAmount) - computedIva) > 0.05) {
      ivaAmount = computedIva;
    }
    if (ivaPercent === '') {
      ivaPercent = inferIvaPercent_(base, total);
    }
  }

  return {
    base: base,
    ivaPercent: ivaPercent,
    ivaAmount: ivaAmount || (base && total ? roundMoney_(Number(total) - Number(base)) : '')
  };
}

function inferIvaPercent_(base, total) {
  if (!base || !total) return '';
  const calculated = ((Number(total) / Number(base)) - 1) * 100;
  const commonRates = [4, 10, 21];
  for (let i = 0; i < commonRates.length; i++) {
    if (Math.abs(calculated - commonRates[i]) <= 0.35) return commonRates[i];
  }
  return roundMoney_(calculated);
}

function extractBase_(text) {
  const patterns = [
    /(?:BASE\s*IMPONIBLE|BI|BASE)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi,
    /(?:SUBTOTAL|IMPORTE\s*NETO)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi
  ];
  return maxMoneyMatch_(text, patterns);
}

function extractIvaAmount_(text) {
  const patterns = [
    /(?:CUOTA\s*IVA|IVA)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/gi
  ];
  return maxMoneyMatch_(text, patterns);
}

function extractIvaPercent_(text) {
  const match = text.match(/(?:IVA|I\.V\.A\.)[^\d]{0,20}(4|10|21)(?:[,.]00)?\s*%/i)
    || text.match(/\b(4|10|21)(?:[,.]00)?\s*%\s*(?:IVA|I\.V\.A\.)/i);
  return match ? Number(match[1]) : '';
}

function extractProvider_(text, upper, fileName) {
  if (/GAYCA|FRUTAS\s+Y\s+PATATAS/i.test(upper) || /FRUTGAYCAZ|FRITGAYCAZ|FRUTGAYCA/i.test(fileName || '')) {
    return 'FRUTAS Y PATATAS GAYCA, S.A.';
  }

  const lines = text.split('\n').map(function(line) { return line.trim(); }).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    // Se saltan las lineas de texto legal/registral que el OCR confunde con el nombre
    // ("Empresa inscrita en el Registro Mercantil...", "Tomo... Folio... Hoja...").
    if (/INSCRITA|REGISTRO\s+MERCANTIL|TOMO\s|FOLIO\s|HOJA\s|DOMICILIO\s+SOCIAL/i.test(line)) continue;
    if (line.length >= 4 && /[A-ZÁÉÍÓÚÑ]/.test(line) && !/FACTURA|ALBARAN|FECHA|NIF|CIF/i.test(line)) {
      return cleanName_(line);
    }
  }
  return cleanName_((fileName || '').replace(/\.[^.]+$/, ''));
}

function extractNif_(upper) {
  const match = upper.match(/\b([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J])\b/)
    || upper.match(/\b(\d{8}[A-Z])\b/);
  return match ? match[1] : '';
}

function extractInvoiceNumber_(text, upper, profile) {
  // Extractor especifico del proveedor (mas fiable que las reglas genericas).
  if (profile && typeof profile.invoiceNumber === 'function') {
    const specific = profile.invoiceNumber(text, upper);
    if (specific) return sanitizeInvoiceNumber_(specific);
  }

  const patterns = [
    /(?:FACTURA|N[ºO]\s*FACTURA|NUM(?:ERO)?\s*FACTURA|SERIE\s*\/?\s*N[ºO])[:\s#-]{0,12}([A-Z0-9][A-Z0-9\/._-]{3,})/i,
    /\b(FV[A-Z0-9\/._-]{4,})\b/i,
    /\b(FAC[-\/]?\d{1,6}[-\/]?\d{0,4})\b/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]) || upper.match(patterns[i]);
    if (match) return sanitizeInvoiceNumber_(match[1]);
  }
  return '';
}

function extractConcept_(upper) {
  if (/PATATA|AGRIA|MONALISA|KENNEBEC/.test(upper)) return 'PATATAS AGRIA';
  if (/BOLSA|ENVASE|VACIO|VACÍO/.test(upper)) return 'ENVASES';
  if (/CAJA|LIMPIEZA|CONSUMIBLE/.test(upper)) return 'MATERIAL AUXILIAR';
  return 'Compra';
}

function classifyPurchaseCategory_(upper) {
  if (/PATATA|AGRIA|MONALISA|KENNEBEC|FRUTA|VERDURA/.test(upper)) return 'Materia prima';
  if (/BOLSA|ENVASE|VACIO|VACÍO|PLASTICO|PLÁSTICO/.test(upper)) return 'Envases';
  if (/CAJA|LIMPIEZA|CONSUMIBLE|GUANTE|ETIQUETA/.test(upper)) return 'Material auxiliar';
  return 'Materia prima';
}

function buildRegistryRow_(data, file, registeredAt, reviewed, observations) {
  return [
    data.dateText,
    Utilities.formatDate(registeredAt, 'Europe/Madrid', 'dd/MM/yyyy HH:mm:ss'),
    data.type,
    data.subtype,
    data.invoiceNumber,
    data.provider,
    data.nif,
    data.concept,
    data.category,
    toSpanishMoney_(data.base),
    data.ivaPercent,
    toSpanishMoney_(data.ivaAmount),
    toSpanishMoney_(data.total),
    data.status,
    data.paymentMethod,
    data.month,
    data.quarter,
    data.year,
    file.getUrl(),
    file.getName(),
    reviewed,
    observations || data.observations || ''
  ];
}

function appendRegistryRow_(sheet, row) {
  sheet.appendRow(row);
}

function rebuildMonthlyPurchasesSummary_(registrySheet) {
  const spreadsheet = registrySheet.getParent();
  const summarySheet = getOrCreateSheet_(spreadsheet, GONSOL_CONFIG.monthlyPurchasesSheetName);
  const values = registrySheet.getDataRange().getDisplayValues();
  const monthGroups = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (normalizeKey_(row[2]) !== 'COMPRA') continue;

    const month = row[15] || monthFromDateText_(row[0]);
    const year = row[17] || yearFromDateText_(row[0]);
    if (!month || !year) continue;

    const key = year + '-' + month;
    if (!monthGroups[key]) {
      monthGroups[key] = {
        year: year,
        month: month,
        rows: [],
        baseTotal: 0,
        ivaTotal: 0,
        finalTotal: 0
      };
    }

    const base = parseMoney_(row[9]) || 0;
    const iva = parseMoney_(row[11]) || 0;
    const total = parseMoney_(row[12]) || 0;

    monthGroups[key].rows.push([
      row[0],
      row[4],
      row[5],
      row[7],
      row[8],
      toSpanishMoney_(base),
      row[10],
      toSpanishMoney_(iva),
      toSpanishMoney_(total),
      row[18],
      row[19]
    ]);
    monthGroups[key].baseTotal += base;
    monthGroups[key].ivaTotal += iva;
    monthGroups[key].finalTotal += total;
  }

  const output = [[
    'Resumen mensual de compras',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Actualizado',
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm:ss')
  ]];

  const sortedKeys = Object.keys(monthGroups).sort();
  sortedKeys.forEach(function(key) {
    const group = monthGroups[key];
    output.push(['']);
    output.push([group.month + ' ' + group.year]);
    output.push([
      'Fecha documento',
      'Serie / Nº',
      'Proveedor',
      'Concepto',
      'Categoría',
      'Base imponible',
      'IVA %',
      'Cuota IVA',
      'Total',
      'Ruta / enlace Drive',
      'Nombre archivo'
    ]);
    group.rows.sort(function(a, b) {
      return String(a[0]).localeCompare(String(b[0]));
    }).forEach(function(row) {
      output.push(row);
    });
    output.push([
      'TOTAL ' + group.month,
      '',
      '',
      '',
      '',
      toSpanishMoney_(group.baseTotal),
      '',
      toSpanishMoney_(group.ivaTotal),
      toSpanishMoney_(group.finalTotal),
      '',
      ''
    ]);
  });

  summarySheet.clear();
  if (output.length) {
    summarySheet.getRange(1, 1, output.length, 11).setValues(padRows_(output, 11));
  }
  formatMonthlyPurchasesSummary_(summarySheet, output.length);
}

function buildDuplicateIndex_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const index = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const provider = row[5];
    const invoiceNumber = row[4];
    const total = parseMoney_(row[12]);
    const key = makeDuplicateKey_(provider, invoiceNumber, total);
    if (key !== '||') index[key] = true;
  }
  return index;
}

function makeDuplicateKey_(provider, invoiceNumber, total) {
  return [
    normalizeKey_(provider),
    normalizeKey_(invoiceNumber),
    total === '' ? '' : Number(total).toFixed(2)
  ].join('|');
}

function getDestinationFolder_(year, quarter, month) {
  const purchasesRoot = DriveApp.getFolderById(GONSOL_CONFIG.purchasesRootFolderId);
  const yearFolder = getOrCreateChildFolder_(purchasesRoot, String(year));
  const quarterFolder = getOrCreateChildFolder_(yearFolder, quarter);
  if (!month) return quarterFolder;
  return getOrCreateChildFolder_(quarterFolder, month);
}

function getOrCreateChildFolder_(parentFolder, childName) {
  const folders = parentFolder.getFoldersByName(childName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(childName);
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function formatMonthlyPurchasesSummary_(sheet, rowCount) {
  if (rowCount < 1) return;

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 11)
    .setFontWeight('bold')
    .setBackground('#1f4e79')
    .setFontColor('#ffffff');

  const values = sheet.getRange(1, 1, rowCount, 11).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    const rowNumber = i + 1;
    const firstCell = values[i][0];
    if (/^\d{2}_[A-ZÁÉÍÓÚÑ]+ \d{4}$/.test(firstCell)) {
      sheet.getRange(rowNumber, 1, 1, 11)
        .mergeAcross()
        .setFontWeight('bold')
        .setBackground('#d9eaf7')
        .setFontColor('#000000');
    } else if (firstCell === 'Fecha documento') {
      sheet.getRange(rowNumber, 1, 1, 11)
        .setFontWeight('bold')
        .setBackground('#eeeeee');
    } else if (String(firstCell).indexOf('TOTAL ') === 0) {
      sheet.getRange(rowNumber, 1, 1, 11)
        .setFontWeight('bold')
        .setBackground('#fff2cc');
    }
  }

  sheet.getRange(1, 6, rowCount, 1).setNumberFormat('#,##0.00');
  sheet.getRange(1, 8, rowCount, 1).setNumberFormat('#,##0.00');
  sheet.getRange(1, 9, rowCount, 1).setNumberFormat('#,##0.00');
  sheet.autoResizeColumns(1, 11);
}

function padRows_(rows, width) {
  return rows.map(function(row) {
    const copy = row.slice();
    while (copy.length < width) copy.push('');
    return copy.slice(0, width);
  });
}

function monthFromDateText_(dateText) {
  const date = parseRegistryDate_(dateText);
  return date ? GONSOL_MONTHS[date.getMonth()] : '';
}

function yearFromDateText_(dateText) {
  const date = parseRegistryDate_(dateText);
  return date ? String(date.getFullYear()) : '';
}

function parseRegistryDate_(dateText) {
  const text = String(dateText || '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return null;
}

function moveFileToFolder_(file, destinationFolder) {
  file.moveTo(destinationFolder);
}

function buildPurchaseFileName_(data) {
  const provider = slugFilePart_(shortProviderName_(data.provider));
  const number = slugFilePart_(data.invoiceNumber);
  const total = toSpanishMoney_(data.total);
  return data.dateText + '_FACTURA_COMPRA_' + provider + '_' + number + '_' + total + '.pdf';
}

function shortProviderName_(provider) {
  if (/GAYCA/i.test(provider)) return 'GAYCA';
  return provider || 'PROVEEDOR';
}

function isSupportedInvoiceFile_(file) {
  const mime = file.getMimeType();
  return [
    MimeType.PDF,
    MimeType.JPEG,
    MimeType.PNG,
    MimeType.GIF,
    MimeType.TIFF
  ].indexOf(mime) !== -1;
}

function deleteTriggersForFunction_(functionName) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function maxMoneyMatch_(text, patterns) {
  const amounts = [];
  patterns.forEach(function(pattern) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const amount = parseMoney_(match[1]);
      if (amount !== '') amounts.push(amount);
    }
  });
  if (!amounts.length) return '';
  return roundMoney_(Math.max.apply(null, amounts));
}

function parseMoney_(value) {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? roundMoney_(number) : '';
}

function toSpanishMoney_(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toFixed(2).replace('.', ',');
}

function roundMoney_(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatDate_(date) {
  return Utilities.formatDate(date, 'Europe/Madrid', 'yyyy-MM-dd');
}

function isValidDate_(date) {
  return date instanceof Date && !isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2100;
}

function monthNameToNumber_(name) {
  const normalized = String(name).toLowerCase();
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const longNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const index = longNames.indexOf(normalized);
  if (index >= 0) return index;
  return names.indexOf(normalized.slice(0, 3));
}

function calculateConfidence_(missing, nif, base, category, supplierKnown) {
  let confidence = 1;
  confidence -= missing.length * 0.18;
  if (!nif) confidence -= 0.07;
  if (!base) confidence -= 0.08;
  if (!category) confidence -= 0.05;
  // Proveedor reconocido: proveedor y NIF son fiables, sube la confianza.
  if (supplierKnown) confidence += 0.2;
  return Math.max(0, Math.min(1, roundMoney_(confidence)));
}

function normalizeText_(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeKey_(value) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}

function cleanName_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-zÁÉÍÓÚÜÑ0-9]+|[^A-Za-zÁÉÍÓÚÜÑ0-9.]+$/g, '')
    .trim();
}

function sanitizeInvoiceNumber_(value) {
  return String(value || '')
    .replace(/[^\w\/.-]/g, '')
    .replace(/_{2,}/g, '_')
    .toUpperCase();
}

function slugFilePart_(value) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/* ====================================================================
 * Bucle con Claude (el despliegue solo publica Code.gs, por eso va aqui)
 * ==================================================================== */

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
  newerThan: '30d',
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
      .filter(function(url) { return /factura|invoice|\.pdf|download|descarg/i.test(url); }).slice(0, 5);
    if (links.length) queueEmailLinkForClaude_(thread, message, links);
    thread.addLabel(label);
  });
  if (imported.length) console.log('Gmail (cualquier proveedor): ' + JSON.stringify(imported));
  return imported;
}
