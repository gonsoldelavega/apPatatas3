function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token, X-Drive-Sync-Token");
  response.setHeader("Cache-Control", "no-store");
}

function getHeader(request, name) {
  const target = String(name || "").toLowerCase();
  return Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)?.[1] || "";
}

function authorize(request) {
  const expected = process.env.DRIVE_INVOICES_SYNC_TOKEN || process.env.APP_SYNC_TOKEN || "";
  const provided = getHeader(request, "x-drive-sync-token") || getHeader(request, "x-sync-token");
  if (!expected) return { ok: false, status: 500, error: "missing_drive_sync_token" };
  if (!provided || provided !== expected) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true };
}

export default async function handler(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "method_not_allowed" });

  const auth = authorize(request);
  if (!auth.ok) return response.status(auth.status).json({ ok: false, error: auth.error });

  const webhookUrl = process.env.N8N_DRIVE_INVOICES_WEBHOOK_URL || "";
  if (!webhookUrl) {
    return response.status(503).json({
      ok: false,
      error: "missing_n8n_drive_invoices_webhook_url",
      message: "Configura N8N_DRIVE_INVOICES_WEBHOOK_URL para activar el agente Drive."
    });
  }

  let body = request.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};

  const payload = {
    mode: "manual",
    source: body.source || "appatatas",
    folderId: body.folderId || process.env.DRIVE_INVOICES_FOLDER_ID || "1ETAzvmssbDM7cLDUEy89quY0xEnNecd4",
    dryRun: body.dryRun !== false,
    requestedAt: body.requestedAt || new Date().toISOString()
  };

  const headers = { "Content-Type": "application/json" };
  if (process.env.N8N_DRIVE_INVOICES_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.N8N_DRIVE_INVOICES_WEBHOOK_TOKEN}`;
  }

  let webhookResponse;
  try {
    webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    return response.status(502).json({
      ok: false,
      error: error?.message || "n8n_webhook_network_error"
    });
  }

  const text = await webhookResponse.text().catch(() => "");
  if (!webhookResponse.ok) {
    return response.status(502).json({
      ok: false,
      error: `n8n_webhook_${webhookResponse.status}`,
      detail: text.slice(0, 1000)
    });
  }

  return response.status(200).json({
    ok: true,
    message: "Sincronizacion Drive solicitada en modo seguro.",
    dryRun: payload.dryRun,
    n8nStatus: webhookResponse.status,
    result: text ? text.slice(0, 2000) : null
  });
}
