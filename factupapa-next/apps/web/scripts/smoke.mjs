const webUrl = process.env.WEB_URL ?? "http://127.0.0.1:4173";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4100";
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

if (!email || !password) throw new Error("SMOKE_EMAIL y SMOKE_PASSWORD son obligatorias");

const page = await fetch(webUrl, { signal: AbortSignal.timeout(10_000) });
if (!page.ok || !(await page.text()).includes("FactuPapa Next")) throw new Error("La página inicial no responde correctamente");

const login = await fetch(`${apiUrl}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: webUrl },
  body: JSON.stringify({ email, password }),
  signal: AbortSignal.timeout(10_000)
});
if (!login.ok) throw new Error(`El login smoke respondió HTTP ${login.status}`);
if (login.headers.get("access-control-allow-origin") !== webUrl) throw new Error("La API no devolvió el origen CORS esperado");
const tokens = await login.json();
if (typeof tokens.accessToken !== "string" || typeof tokens.refreshToken !== "string") throw new Error("El login smoke no devolvió la sesión esperada");

const me = await fetch(`${apiUrl}/me`, {
  headers: { Authorization: `Bearer ${tokens.accessToken}`, Origin: webUrl },
  signal: AbortSignal.timeout(10_000)
});
if (!me.ok) throw new Error(`La carga autenticada respondió HTTP ${me.status}`);
const identity = await me.json();
if (identity.email !== email || typeof identity.company?.name !== "string") throw new Error("La identidad smoke no coincide");

const logout = await fetch(`${apiUrl}/auth/logout`, {
  method: "POST",
  headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json", Origin: webUrl },
  body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  signal: AbortSignal.timeout(10_000)
});
if (!logout.ok) throw new Error(`El logout smoke respondió HTTP ${logout.status}`);

console.log("Smoke web + login + carga autenticada + logout: correcto");
