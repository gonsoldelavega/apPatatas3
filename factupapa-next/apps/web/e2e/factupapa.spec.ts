import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const email = process.env.DEMO_USER_EMAIL ?? "demo@example.test";
const password = process.env.DEMO_USER_PASSWORD ?? "Demo-password-only-1234";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4100";
const webOrigin = new URL(
  process.env.WEB_URL ?? "http://127.0.0.1:4173",
).origin;

async function apiLogin(
  request: APIRequestContext,
  candidatePassword: string,
) {
  return request.post(`${apiUrl}/auth/login`, {
    headers: { Origin: webOrigin },
    data: { email, password: candidatePassword },
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar en FactuPapa" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/^Resultado de /)).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test("el primer acceso mantiene el tema claro y campos legibles", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const appearance = await page.getByLabel("Email").evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      color: styles.color,
      background: styles.backgroundColor,
      border: styles.borderColor,
    };
  });
  expect(appearance.background).toBe("rgb(255, 255, 255)");
  expect(appearance.color).not.toBe(appearance.background);
  expect(appearance.border).not.toBe(appearance.background);
  await context.close();
});

test("login, restauración de sesión, dashboard y logout", async ({ page }, testInfo) => {
  const errors: string[] = [];
  await page.goto("/login");
  await page.getByLabel("Email").fill("incorrecto@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
  await page.getByRole("button", { name: "Entrar en FactuPapa" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No se ha podido iniciar sesión",
  );
  await login(page);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.reload();
  await expect(page.getByText(/^Resultado de /)).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-inicio.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Otros" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(errors).toEqual([]);
});

test("el callback Google restaura la sesión y entra en la aplicación", async ({
  page,
}) => {
  const callbackUrl = `${apiUrl}/auth/google/callback?code=valid-code&state=valid-state`;
  const apiPath = new URL(apiUrl).pathname.replace(/\/$/, "");
  const cookiePath = `${apiPath}/auth` || "/auth";
  let refreshReceivedCookie = false;

  await page.route(callbackUrl, async (route) => {
    await route.fulfill({
      status: 302,
      headers: {
        location: `${webOrigin}/login?google=success`,
        "set-cookie": `factupapa_refresh=google-e2e-refresh; HttpOnly; SameSite=Strict; Path=${cookiePath}`,
        "cache-control": "no-store",
      },
    });
  });
  await page.route(`${apiUrl}/auth/refresh`, async (route) => {
    refreshReceivedCookie =
      route.request().headers().cookie?.includes("factupapa_refresh=") ?? false;
    await route.fulfill({
      status: refreshReceivedCookie ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(
        refreshReceivedCookie
          ? {
              accessToken: "google-e2e-access",
              tokenType: "Bearer",
              expiresIn: 900,
            }
          : { error: "invalid_refresh_token" },
      ),
    });
  });
  await page.route(`${apiUrl}/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "google-e2e-user",
        email: "google-e2e@example.test",
        displayName: "Google E2E",
        company: { id: "google-e2e-company", name: "Empresa Google E2E" },
        membership: { role: "owner" },
      }),
    });
  });

  await page.goto(callbackUrl);
  await expect(page).toHaveURL(`${webOrigin}/`);
  await expect(
    page.getByRole("heading", { name: "Resumen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegación principal" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hola de nuevo" })).toHaveCount(
    0,
  );
  expect(refreshReceivedCookie).toBe(true);
});

test("facturas mobile-first sin overflow", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/ventas");
  await expect(page.getByRole("heading", { name: "Facturas" })).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-facturas.png`,
    fullPage: true,
  });
  await assertNoHorizontalOverflow(page);
});

test("la navegación inferior conserva foco, estado y transición de sección", async ({
  page,
}, testInfo) => {
  await login(page);
  const captureReference = async (screen: string) => {
    if (testInfo.project.name !== "mobile-390") return;
    await page.waitForTimeout(260);
    await page.screenshot({
      path: testInfo.outputPath(`reference-${screen}-390.png`),
    });
  };
  const viewTransitionSupported = await page.evaluate(() => {
    const target = window as typeof window & { __viewTransitionCount?: number };
    const original = document.startViewTransition?.bind(document);
    target.__viewTransitionCount = 0;
    if (!original) return false;
    document.startViewTransition = (update) => {
      target.__viewTransitionCount = (target.__viewTransitionCount ?? 0) + 1;
      return original(update);
    };
    return true;
  });
  const reducedMotion = await page.evaluate(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const navigation = page.getByRole("navigation", {
    name: "Navegación principal",
  });
  await expect(navigation.getByRole("link", { name: "Inicio" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation).toHaveCSS("--active-nav-index", "0");
  await captureReference("inicio");

  await navigation.getByRole("link", { name: "Facturas", exact: true }).click();
  await expect(page).toHaveURL(/\/ventas$/);
  await expect(page.getByRole("heading", { name: "Facturas" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Facturas" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation).toHaveCSS("--active-nav-index", "1");
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __viewTransitionCount?: number })
      .__viewTransitionCount ?? 0,
  )).toBe(viewTransitionSupported && !reducedMotion ? 1 : 0);
  await captureReference("facturas");

  await navigation.getByRole("link", { name: "Gastos" }).click();
  await expect(page).toHaveURL(/\/gastos$/);
  await expect(page.getByRole("heading", { name: "Compras y gastos", exact: true })).toBeVisible();
  await expect(navigation).toHaveCSS("--active-nav-index", "2");
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __viewTransitionCount?: number })
      .__viewTransitionCount ?? 0,
  )).toBe(viewTransitionSupported && !reducedMotion ? 2 : 0);
  await captureReference("gastos");

  await navigation.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL(/\/catalogo\/productos$/);
  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
  await expect(navigation).toHaveCSS("--active-nav-index", "3");
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __viewTransitionCount?: number })
      .__viewTransitionCount ?? 0,
  )).toBe(viewTransitionSupported && !reducedMotion ? 3 : 0);
  await captureReference("productos");

  await navigation.getByRole("link", { name: "Otros" }).click();
  await expect(page).toHaveURL(/\/mas$/);
  await expect(page.getByRole("heading", { name: "Otros" })).toBeVisible();
  await expect(navigation).toHaveCSS("--active-nav-index", "4");
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __viewTransitionCount?: number })
      .__viewTransitionCount ?? 0,
  )).toBe(viewTransitionSupported && !reducedMotion ? 4 : 0);
  await captureReference("otros");

  await navigation.getByRole("link", { name: "Inicio" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/^Resultado de /)).toBeVisible();
  await expect(navigation).toHaveCSS("--active-nav-index", "0");
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __viewTransitionCount?: number })
      .__viewTransitionCount ?? 0,
  )).toBe(viewTransitionSupported && !reducedMotion ? 5 : 0);
  await assertNoHorizontalOverflow(page);
});

test("compras y gastos se adapta al móvil y permite archivo o cámara", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/gastos");
  await expect(
    page.getByRole("heading", { name: "Compras y gastos", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Estado del documento")).toBeVisible();
  await expect(page.getByLabel("Estado del pago")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-gastos.png`,
    fullPage: true,
  });

  await page.goto("/gastos/nuevo");
  await expect(page.getByText("Elegir archivo", { exact: true })).toBeVisible();
  await expect(page.getByText("Hacer foto", { exact: true })).toBeVisible();
  const fileInput = page.locator(
    ".purchase-capture-option--file input[type=file]",
  );
  const cameraInput = page.locator(
    ".purchase-capture-option--camera input[type=file]",
  );
  await expect(fileInput).not.toHaveAttribute("capture");
  await expect(fileInput).toHaveAttribute("accept", /application\/pdf/);
  await expect(cameraInput).toHaveAttribute("capture", "environment");
  await expect(cameraInput).toHaveAttribute("accept", "image/*");
  await assertNoHorizontalOverflow(page);
});

test("factura directa con IVA por defecto y decimales legibles", async ({ page }) => {
  await login(page);
  await page.goto("/ajustes/ventas");
  await expect(page.getByLabel("Prefijo")).toHaveValue("FAC");
  await expect(page.getByLabel("Primer número")).toHaveValue("100");
  await expect(page.getByLabel("IVA por defecto (%)")).toHaveValue("4");

  await page.goto("/ventas/nuevo/factura");
  await expect(page.getByText(/Serie TEST\/\d{4}/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Producto 1").selectOption({ index: 1 });
  await page.getByLabel("Cantidad").fill("10");
  await page.getByRole("button", { name: "Revisar factura" }).click();
  await expect(page).toHaveURL(/\/ventas\/facturas\//);
  await expect(page.getByText(/10 kg ×/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\.0000/);
  await expect(page.getByText("Base imponible")).toBeVisible();
  await expect(page.getByText("IVA", { exact: true })).toBeVisible();
});

test("una factura admite tres líneas y las envía juntas", async ({ page }) => {
  await login(page);
  await page.goto("/ventas/nuevo/factura");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ index: 1 });
  const expected = [
    { quantity: "10", unitPrice: "1.60" },
    { quantity: "5", unitPrice: "2.10" },
    { quantity: "7", unitPrice: "3.25" },
  ];
  const productIds: string[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const product = page.getByLabel(`Producto ${index}`);
    await product.selectOption({ index });
    productIds.push(await product.inputValue());
    await page.getByLabel(/Cantidad/).nth(index - 1).fill(expected[index - 1]!.quantity);
    await page.getByLabel(/Precio sin IVA/).nth(index - 1).fill(expected[index - 1]!.unitPrice);
    if (index < 3) {
      await page.getByRole("button", { name: "Añadir producto" }).click();
      await expect(page.getByLabel(`Producto ${index + 1}`)).toBeVisible();
    }
  }
  const lineRequests: import("@playwright/test").Request[] = [];
  page.on("request", (candidate) => {
    if (candidate.method() === "POST" && /\/(?:api\/)?invoices\/[^/]+\/lines$/.test(candidate.url())) {
      lineRequests.push(candidate);
    }
  });
  await page.getByRole("button", { name: "Revisar factura" }).click();
  await expect.poll(() => lineRequests.length).toBe(3);
  const payloads = lineRequests.map((request) => request.postDataJSON() as {
    productId?: string;
    quantity?: string;
    unitPrice?: string;
    deliveryDate?: string | null;
  });
  expect(payloads).toHaveLength(3);
  expect(payloads.map((payload) => payload.productId)).toEqual(productIds);
  expect(payloads.map((payload) => payload.quantity)).toEqual(expected.map((line) => line.quantity));
  expect(payloads.map((payload) => payload.unitPrice)).toEqual(expected.map((line) => line.unitPrice));
  expect(new Set(payloads.map((payload) => payload.productId)).size).toBe(3);
  await expect(page).toHaveURL(/\/ventas\/facturas\//);
  const invoiceId = new URL(page.url()).pathname.split("/").pop();
  const authorization = lineRequests[0]!.headers().authorization;
  const persisted = await page.request.get(`${apiUrl}/invoices/${invoiceId}`, {
    headers: { Origin: webOrigin, ...(authorization ? { Authorization: authorization } : {}) },
  });
  expect(persisted.status()).toBe(200);
  const invoice = await persisted.json() as {
    lines: Array<{ productId: string; quantity: string; unitPrice: string; taxRate?: string; lineSubtotal: string; lineTax: string; lineTotal: string }>;
    subtotal: string;
    taxTotal: string;
    total: string;
  };
  expect(invoice.lines).toHaveLength(3);
  expect(invoice.lines.map((line) => line.productId)).toEqual(productIds);
  expect(invoice.lines.map((line) => Number(line.quantity))).toEqual(expected.map((line) => Number(line.quantity)));
  expect(invoice.lines.map((line) => Number(line.unitPrice))).toEqual(expected.map((line) => Number(line.unitPrice)));
  // El IVA se verifica con los importes persistidos; taxRate es un snapshot decimal del backend.
  expect(invoice.lines.reduce((sum, line) => sum + Number(line.lineSubtotal), 0)).toBeCloseTo(49.25, 2);
  expect(invoice.lines.reduce((sum, line) => sum + Number(line.lineTax), 0)).toBeCloseTo(1.97, 2);
  expect(Number(invoice.subtotal)).toBeCloseTo(49.25, 2);
  expect(Number(invoice.taxTotal)).toBeCloseTo(1.97, 2);
  expect(Number(invoice.total)).toBeCloseTo(51.22, 2);
});

test("una compra válida se guarda, confirma y cancela", async ({ page }, testInfo) => {
  await login(page);

  const createPurchase = async (suffix: string) => {
    await page.goto("/gastos/nuevo");
    await page.getByLabel("Proveedor obligatorio").selectOption({ index: 1 });
    await page
      .getByLabel("Número de factura del proveedor")
      .fill(`E2E-${testInfo.project.name}-${testInfo.retry}-${suffix}`);
    await page.getByLabel("Descripción").fill(`Compra ficticia ${suffix}`);
    await page.getByLabel("Cantidad").fill("1");
    await page.getByLabel("Coste unidad sin IVA").fill("2,50");
    await page.getByRole("button", { name: "Guardar para revisión" }).click();
    await expect(page).toHaveURL(/\/gastos\/[0-9a-f-]+$/);
  };

  await createPurchase("confirmar");
  await page.getByRole("button", { name: "Confirmar compra" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Actualizará el stock y los saldos",
  );
  await page.getByRole("button", { name: "Sí, confirmar compra" }).click();
  await expect(page.getByRole("status")).toContainText("Compra confirmada");

  await createPurchase("cancelar");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Sí, cancelar compra" }).click();
  await expect(page.getByRole("status")).toContainText("Compra cancelada");
});

test("factura quincenal sin condiciones por defecto y precio editable", async ({
  page,
}, testInfo) => {
  const key = `${testInfo.project.name}-${testInfo.retry}`;
  const customer = `Cliente quincenal ${key}`;
  await login(page);
  await page.goto("/contactos/nuevo?tipo=customer");
  await page.getByLabel("Nombre fiscal").fill(customer);
  await page
    .getByLabel("Periodo habitual de sus facturas")
    .selectOption("fortnightly");
  const includeTerms = page.getByRole("checkbox", {
    name: "Incluir condiciones de pago en las facturas",
  });
  await expect(includeTerms).not.toBeChecked();
  await expect(page.getByLabel("Condiciones y consecuencias del impago")).toHaveCount(0);
  await includeTerms.check();
  await page.getByLabel("Condiciones y consecuencias del impago").fill("Condición conservada E2E");
  await page.getByRole("button", { name: "Guardar contacto" }).click();
  await expect(page).toHaveURL(/\/contactos\/[0-9a-f-]+$/);

  await page.goto(`${page.url()}/editar`);
  await expect(includeTerms).toBeChecked();
  await includeTerms.uncheck();
  await expect(page.getByLabel("Condiciones y consecuencias del impago")).toHaveCount(0);
  await page.getByRole("button", { name: "Guardar contacto" }).click();
  await expect(page).toHaveURL(/\/contactos\/[0-9a-f-]+$/);

  await page.goto(`${page.url()}/editar`);
  await expect(includeTerms).not.toBeChecked();
  await includeTerms.check();
  await expect(page.getByLabel("Condiciones y consecuencias del impago")).toHaveValue("Condición conservada E2E");
  await includeTerms.uncheck();
  await page.getByRole("button", { name: "Guardar contacto" }).click();

  await page.goto("/ventas/nuevo/factura");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption({ label: customer });
  const advancedOptions = page.getByText("Opciones avanzadas · quincenal");
  await expect(advancedOptions).toBeVisible();
  await advancedOptions.click();
  await expect(page.getByText("Periodo quincenal")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Quincenal", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const invoiceTerms = page.getByRole("switch", {
    name: "Incluir condiciones de pago",
  });
  await expect(invoiceTerms).not.toBeChecked();
  await expect(page.getByLabel("Fecha límite de pago")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Condiciones de pago", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Producto 1").selectOption({ index: 1 });
  await expect(
    page.getByLabel("Fecha de entrega (obligatoria)"),
  ).not.toHaveValue("");
  await page.getByLabel("Cantidad").fill("1");
  const price = page.getByLabel(/Precio sin IVA/);
  await expect(price).not.toHaveValue("");
  await price.fill("1,75");
  const invoiceRequest = page.waitForRequest((request) =>
    request.method() === "POST" && /\/(?:api\/)?invoices$/.test(request.url()),
  );
  await page.getByRole("button", { name: "Revisar factura" }).click();
  const invoicePayload = (await invoiceRequest).postDataJSON() as {
    dueDate: string | null;
    paymentTerms: string | null;
  };
  expect(invoicePayload.dueDate).toBeNull();
  expect(invoicePayload.paymentTerms).toBeNull();
  await expect(page).toHaveURL(/\/ventas\/facturas\/[0-9a-f-]+$/);
  await expect(page.getByText(/1 kg × 1,75/)).toBeVisible();
  await expect(page.getByText(/Vencimiento:/)).toHaveCount(0);
  await expect(page.getByText(/Condiciones:/)).toHaveCount(0);
});

test("importación de productos valida, previsualiza y permite cancelar", async ({ page }) => {
  await login(page);
  await page.goto("/importar");
  await page.getByLabel("Qué quieres importar").selectOption("products");
  await page
    .getByLabel("Seleccionar archivo Excel, CSV o JSON")
    .setInputFiles({
      name: "productos-ficticios.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '[{"name":"E2E ficticio","sku":"E2E-SKU-UNICO","unit":"kg","salePrice":"1.2345","taxRate":"4"}]',
      ),
    });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await page.getByRole("button", { name: "Validar y previsualizar" }).click();
  await expect(page.getByText("Paso 3 · Revisar errores")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar lote" }).click();
});

test("la API mantiene autenticación y el usuario de prueba operativo", async ({ request }) => {
  const response = await apiLogin(request, password);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { accessToken?: string };
  expect(body.accessToken).toBeTruthy();
});
