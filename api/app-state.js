import { get, put } from "@vercel/blob";

const PATHNAME = "shared-state/app-state.json";
const SYNC_VERSION = 1;
const COLLECTION_KEYS = ["templates","clients","suppliers","products","purchases","expenses","deliveryNotes","invoices","documents"];

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token, If-None-Match");
  response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  response.setHeader("Cache-Control", "no-store");
}

function log(step, details = {}) {
  console.log("[app-state]", step, details);
}

function logInvalidTimestamp(field, rawValue) {
  console.warn("[app-state] invalid-timestamp", { field, rawValue });
}

function checkToken(request) {
  const expected = process.env.APP_SYNC_TOKEN;
  const provided = request.headers["x-sync-token"];
  log("auth-debug", {
    envTokenPresent: !!expected,
    envTokenLength: expected ? expected.length : 0,
    headerPresent: !!provided,
    headerLength: provided ? provided.length : 0
  });
  if (!expected) return { ok: false, status: "missing-secret" };
  if (!provided) return { ok: false, status: "missing-header" };
  if (provided !== expected) return { ok: false, status: "mismatch" };
  return { ok: true };
}

function isValidTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed);
}

function safeIso(value, fallback = "", field = "timestamp") {
  if (value === undefined) {
    const now = new Date();
    return Number.isFinite(now.getTime()) ? now.toISOString() : fallback;
  }
  if (!isValidTimestamp(value)) {
    if (value !== "" && value !== null && value !== undefined) logInvalidTimestamp(field, value);
    return fallback;
  }
  return new Date(value).toISOString();
}

function syncScore(value) {
  if (!isValidTimestamp(value)) {
    if (value !== "" && value !== null && value !== undefined) logInvalidTimestamp("syncScore", value);
    return 0;
  }
  return Date.parse(String(value).trim());
}

function normalizeState(state) {
  if (!state || typeof state !== "object") return null;
  return {
    ...state,
    _sync: {
      version: Number(state?._sync?.version || SYNC_VERSION),
      updatedAt: safeIso(state?._sync?.updatedAt || state?.settings?.lastSavedAt || "", "", "state._sync.updatedAt")
    }
  };
}

function isStructurallyValid(state) {
  if (!state || typeof state !== "object") return false;
  if (!state.settings || typeof state.settings !== "object") return false;
  return COLLECTION_KEYS.every(key => Array.isArray(state[key]));
}

function isMeaningful(state) {
  if (!isStructurallyValid(state)) return false;
  return COLLECTION_KEYS.some(key => (state[key] || []).length > 0);
}

async function readStoredState(ifNoneMatch) {
  const result = await get(PATHNAME, {
    access: "private",
    ifNoneMatch: ifNoneMatch || undefined
  });
  if (!result) return null;
  if (result.statusCode === 304) {
    return {
      statusCode: 304,
      etag: result.blob?.etag || ""
    };
  }
  const payload = await new Response(result.stream).json();
  return {
    statusCode: result.statusCode || 200,
    etag: result.blob?.etag || "",
    payload
  };
}

export default async function handler(request, response) {
  setCors(response);
  log("request", { method: request.method });

  if (request.method === "OPTIONS") return response.status(204).end();

  const auth = checkToken(request);
  if (!auth.ok) {
    log("auth-fail", { reason: auth.status });
    if (auth.status === "missing-secret") return response.status(500).json({ ok: false, error: "missing_sync_token" });
    return response.status(401).json({ ok: false, error: "unauthorized" });
  }
  log("auth-pass", { method: request.method });

  if (request.method === "GET") {
    const current = await readStoredState(request.headers["if-none-match"]);
    if (current?.statusCode === 304) {
      if (current.etag) response.setHeader("ETag", current.etag);
      return response.status(304).end();
    }
    if (!current?.payload) {
      return response.status(200).json({ ok: true, exists: false, state: null, meta: null });
    }

    const normalized = normalizeState(current.payload?.state);
    if (!isStructurallyValid(normalized)) {
      return response.status(500).json({ ok: false, error: "invalid_remote_state" });
    }

    if (current.etag) response.setHeader("ETag", current.etag);
    return response.status(200).json({
      ok: true,
      exists: true,
      state: normalized,
      meta: current.payload?.meta || null
    });
  }

  if (request.method === "PUT" || request.method === "POST") {
    const incoming = normalizeState(request.body?.state);
    if (!incoming || !isStructurallyValid(incoming)) {
      log("write-rejected", { reason: "invalid_payload" });
      return response.status(400).json({ ok: false, error: "invalid_payload" });
    }
    if (!isMeaningful(incoming)) {
      log("write-rejected", { reason: "empty_state_rejected" });
      return response.status(409).json({ ok: false, error: "empty_state_rejected" });
    }

    const current = await readStoredState();
    const remote = current?.payload?.state ? normalizeState(current.payload.state) : null;
    const remoteMeta = current?.payload?.meta || null;
    const incomingScore = syncScore(incoming._sync.updatedAt);
    const remoteScore = syncScore(remote?._sync?.updatedAt);

    if (remote && isStructurallyValid(remote) && isMeaningful(remote) && remoteScore > incomingScore) {
      log("write-rejected", {
        reason: "remote_newer",
        remoteUpdatedAt: remote?._sync?.updatedAt || "",
        incomingUpdatedAt: incoming?._sync?.updatedAt || ""
      });
      if (current?.etag) response.setHeader("ETag", current.etag);
      return response.status(200).json({
        ok: true,
        ignored: true,
        reason: "remote_newer",
        state: remote,
        meta: remoteMeta
      });
    }

    const updatedAt = safeIso(incoming._sync.updatedAt, safeIso(undefined, "", "write.updatedAt.now"), "incoming._sync.updatedAt");
    const stateToSave = {
      ...incoming,
      _sync: {
        ...incoming._sync,
        version: SYNC_VERSION,
        updatedAt
      }
    };
    const meta = {
      updatedAt,
      version: SYNC_VERSION,
      deviceId: request.body?.deviceId || incoming?.settings?.deviceId || "unknown",
      appVersion: request.body?.appVersion || "1"
    };

    const saved = await put(PATHNAME, JSON.stringify({ state: stateToSave, meta }), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true
    });

    if (saved?.etag) response.setHeader("ETag", saved.etag);
    log("write-success", { updatedAt, deviceId: meta.deviceId });
    return response.status(200).json({ ok: true, savedAt: updatedAt, meta });
  }

  return response.status(405).json({ ok: false, error: "method_not_allowed" });
}
