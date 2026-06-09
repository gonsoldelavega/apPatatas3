import crypto from "node:crypto";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
}

function base64Url(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getPrivateKey() {
  return String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();
}

function getConfig() {
  const email = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = getPrivateKey();
  const spreadsheetId = String(process.env.PURCHASE_REGISTRY_SPREADSHEET_ID || "").trim();
  const sheetName = String(process.env.PURCHASE_REGISTRY_SHEET_NAME || "REGISTRO").trim() || "REGISTRO";
  if (!email || !privateKey || !spreadsheetId || !sheetName) return null;
  return { email, privateKey, spreadsheetId, sheetName };
}

// URL de la app web del agente (Apps Script) que publica el REGISTRO como JSON.
// Se puede fijar por variable de entorno en Vercel; si no, se usa la constante.
// Camino de respaldo cuando no hay service account configurada.
const WEBAPP_FALLBACK_URL = "";

function getWebAppConfig() {
  const url = String(process.env.PURCHASE_REGISTRY_WEBAPP_URL || WEBAPP_FALLBACK_URL || "").trim();
  const token = String(process.env.PURCHASE_REGISTRY_WEBAPP_TOKEN || "").trim();
  if (!url) return null;
  return { url, token };
}

async function fetchFromWebApp(webApp) {
  const url = webApp.token
    ? `${webApp.url}${webApp.url.includes("?") ? "&" : "?"}key=${encodeURIComponent(webApp.token)}`
    : webApp.url;
  const response = await fetch(url, { redirect: "follow" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.rows)) {
    throw new Error(payload?.error || `webapp_${response.status}`);
  }
  return payload.rows;
}

function createJwt(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: config.email,
    scope: SHEETS_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(config.privateKey);
  return `${unsigned}.${base64Url(signature)}`;
}

async function getAccessToken(config) {
  const assertion = createJwt(config);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `google_token_${response.status}`);
  }
  return payload.access_token;
}

export default async function handler(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ ok: false, error: "method_not_allowed" });

  const config = getConfig();
  if (!config) {
    // Sin service account: intentar leer la app web del agente (Apps Script).
    const webApp = getWebAppConfig();
    if (webApp) {
      try {
        const rows = await fetchFromWebApp(webApp);
        return response.status(200).json({
          ok: true,
          rows,
          source: "apps-script-webapp",
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        return response.status(502).json({
          ok: false,
          error: "server_google_sheets_unavailable",
          detail: error?.message || "webapp_unavailable"
        });
      }
    }
    return response.status(200).json({ ok: false, error: "missing_server_google_config" });
  }

  try {
    const accessToken = await getAccessToken(config);
    const range = encodeURIComponent(`${config.sheetName}!A2:V`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}`;
    const sheetsResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = await sheetsResponse.json().catch(() => ({}));
    if (!sheetsResponse.ok) {
      return response.status(502).json({
        ok: false,
        error: "server_google_sheets_unavailable",
        detail: payload?.error?.message || `sheets_${sheetsResponse.status}`
      });
    }
    return response.status(200).json({
      ok: true,
      rows: payload.values || [],
      source: "vercel-google-sheets",
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return response.status(502).json({
      ok: false,
      error: "server_google_sheets_unavailable",
      detail: error?.message || "google_sheets_unavailable"
    });
  }
}
