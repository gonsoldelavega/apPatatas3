(function(global){
  // Fusion de estado para sincronizacion entre dispositivos.
  // Estrategia: union por id, gana la marca de tiempo (updatedAt) mas reciente;
  // las borradas (tombstones en _deleted) ganan si su marca es >= a la de la entidad.
  const COLLECTION_KEYS = [
    "templates","clients","suppliers","products","purchases",
    "expenses","walletMovements","deliveryNotes","invoices","documents"
  ];

  function ts(value){
    const t = Date.parse(String(value || ""));
    return Number.isFinite(t) ? t : 0;
  }

  function tombstones(state){
    const map = (state && state._deleted && typeof state._deleted === "object") ? state._deleted : {};
    return map || {};
  }

  function mergeTombstones(a, b){
    const out = {};
    [a || {}, b || {}].forEach(map => {
      Object.keys(map || {}).forEach(key => {
        if(ts(map[key]) >= ts(out[key])) out[key] = map[key];
      });
    });
    return out;
  }

  function mergeCollection(localList, remoteList, deleted, key){
    const map = new Map();
    (Array.isArray(remoteList) ? remoteList : []).forEach(item => {
      if(item && item.id != null) map.set(item.id, item);
    });
    (Array.isArray(localList) ? localList : []).forEach(item => {
      if(!item || item.id == null) return;
      const existing = map.get(item.id);
      if(!existing){ map.set(item.id, item); return; }
      // Empate o local mas nuevo -> nos quedamos con el local (mantiene ediciones de este equipo).
      map.set(item.id, ts(item.updatedAt) >= ts(existing.updatedAt) ? item : existing);
    });
    const result = [];
    map.forEach((entity, id) => {
      const tomb = deleted[`${key}:${id}`];
      if(tomb && ts(tomb) >= ts(entity.updatedAt)) return; // borrada despues de su ultima edicion
      result.push(entity);
    });
    return result;
  }

  function mergeStates(local, remote){
    const safeLocal = local && typeof local === "object" ? local : {};
    const safeRemote = remote && typeof remote === "object" ? remote : {};
    const deleted = mergeTombstones(tombstones(safeLocal), tombstones(safeRemote));
    const localNewer = ts(safeLocal?._sync?.updatedAt || safeLocal?.settings?.lastSavedAt)
      >= ts(safeRemote?._sync?.updatedAt || safeRemote?.settings?.lastSavedAt);
    const base = localNewer ? safeLocal : safeRemote;

    const merged = { ...safeRemote, ...safeLocal };
    // Ajustes: del lado mas reciente, pero deviceId siempre el de este equipo.
    merged.settings = {
      ...(safeRemote.settings || {}),
      ...(localNewer ? (safeLocal.settings || {}) : (safeRemote.settings || {}))
    };
    if(safeLocal?.settings?.deviceId) merged.settings.deviceId = safeLocal.settings.deviceId;

    COLLECTION_KEYS.forEach(key => {
      merged[key] = mergeCollection(safeLocal[key], safeRemote[key], deleted, key);
    });

    merged._deleted = deleted;
    merged._sync = {
      version: 1,
      updatedAt: (base && base._sync && base._sync.updatedAt) || new Date().toISOString()
    };
    return merged;
  }

  // Firma de contenido (ids + marca por coleccion + tombstones) para decidir si hay
  // que volver a subir tras fusionar. Ignora _sync.updatedAt a proposito.
  function contentSignature(state){
    const safe = state && typeof state === "object" ? state : {};
    const parts = [];
    COLLECTION_KEYS.forEach(key => {
      const list = Array.isArray(safe[key]) ? safe[key] : [];
      const ids = list
        .filter(item => item && item.id != null)
        .map(item => `${item.id}@${ts(item.updatedAt)}`)
        .sort();
      parts.push(`${key}:${ids.join(",")}`);
    });
    const del = tombstones(safe);
    const delKeys = Object.keys(del).map(k => `${k}@${ts(del[k])}`).sort();
    parts.push(`_deleted:${delKeys.join(",")}`);
    return parts.join("|");
  }

  function statesEquivalent(a, b){
    return contentSignature(a) === contentSignature(b);
  }

  const api = { mergeStates, statesEquivalent, contentSignature, COLLECTION_KEYS };
  if(global) global.AppStateMerge = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
