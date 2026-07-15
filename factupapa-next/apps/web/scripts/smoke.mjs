import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const webUrl = process.env.WEB_URL ?? "http://127.0.0.1:4173";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4100";
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
const pdfPath = process.env.SMOKE_PDF_PATH;
const customerId = "00000000-0000-4000-8000-000000000103";
const productId = "00000000-0000-4000-8000-000000000105";

if (!email || !password)
  throw new Error("SMOKE_EMAIL y SMOKE_PASSWORD son obligatorias");

const page = await fetch(webUrl, { signal: AbortSignal.timeout(10_000) });
if (!page.ok || !(await page.text()).includes("FactuPapa Next"))
  throw new Error("La página inicial no responde correctamente");

const login = await fetch(`${apiUrl}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: webUrl },
  body: JSON.stringify({ email, password }),
  signal: AbortSignal.timeout(10_000),
});
if (!login.ok) throw new Error(`El login smoke respondió HTTP ${login.status}`);
if (login.headers.get("access-control-allow-origin") !== webUrl)
  throw new Error("La API no devolvió el origen CORS esperado");
const tokens = await login.json();
if (typeof tokens.accessToken !== "string" || "refreshToken" in tokens)
  throw new Error("El contrato de sesión no es seguro");
const setCookie = login.headers.get("set-cookie");
const cookie =
  login.headers.getSetCookie?.()[0]?.split(";", 1)[0] ??
  setCookie?.split(";", 1)[0];
if (!cookie || !setCookie?.includes("HttpOnly"))
  throw new Error("Falta la cookie HttpOnly de refresh");

const authorization = {
  Authorization: `Bearer ${tokens.accessToken}`,
  Origin: webUrl,
};
async function api(path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...authorization,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} respondió HTTP ${response.status}`,
    );
  return response;
}

const me = await api("/me");
const identity = await me.json();
if (identity.email !== email || typeof identity.company?.name !== "string")
  throw new Error("La identidad smoke no coincide");
await api("/contacts");
await api("/products");

const issueDate = new Date().toISOString().slice(0, 10);
const draftResponse = await api("/delivery-notes", {
  method: "POST",
  body: JSON.stringify({
    contactId: customerId,
    series: "SMOKE",
    issueDate,
    notes: "Documento ficticio de integración",
  }),
});
const draft = await draftResponse.json();
await api(`/delivery-notes/${draft.id}/lines`, {
  method: "POST",
  body: JSON.stringify({ productId, quantity: "2.0000" }),
});
await api(`/delivery-notes/${draft.id}/issue`, { method: "POST", body: "{}" });

const invoiceResponse = await api("/invoices/from-delivery-notes", {
  method: "POST",
  body: JSON.stringify({
    deliveryNoteIds: [draft.id],
    series: "SMOKE",
    issueDate,
    notes: "Factura ficticia de integración",
  }),
});
const invoice = await invoiceResponse.json();
await api(`/invoices/${invoice.id}/issue`, { method: "POST", body: "{}" });
const pdf = await api(`/invoices/${invoice.id}/pdf`);
if (pdf.headers.get("content-type") !== "application/pdf")
  throw new Error("El PDF no tiene el Content-Type esperado");
const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
if (pdfBuffer.subarray(0, 5).toString() !== "%PDF-" || pdfBuffer.length < 1_000)
  throw new Error("El PDF smoke no es válido");
if (pdfPath) {
  await mkdir(dirname(pdfPath), { recursive: true });
  await writeFile(pdfPath, pdfBuffer);
}

const logout = await fetch(`${apiUrl}/auth/logout`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: webUrl,
    Cookie: cookie,
  },
  body: "{}",
  signal: AbortSignal.timeout(10_000),
});
if (!logout.ok)
  throw new Error(`El logout smoke respondió HTTP ${logout.status}`);
if (!logout.headers.get("set-cookie")?.includes("Max-Age=0"))
  throw new Error("Logout no eliminó la cookie");

console.log(
  "Smoke web + sesión + catálogo + albarán + factura + PDF + logout: correcto",
);
