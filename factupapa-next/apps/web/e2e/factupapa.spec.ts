import { expect, test, type Page } from "@playwright/test";
const email = process.env.DEMO_USER_EMAIL ?? "demo@example.test";
const password = process.env.DEMO_USER_PASSWORD ?? "Demo-password-only-1234";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar en FactuPapa" }).click();
  await expect(page).toHaveURL(/\/$/);
}
test("login genérico, restauración, logout y consola limpia", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  await page.goto("/login");
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-login.png`,
    fullPage: true,
  });
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
  await expect(page.getByText("Resumen operativo")).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-inicio.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Más" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(errors).toEqual([]);
});
test("ventas mobile-first sin overflow", async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole("link", { name: "Ventas" }).click();
  await expect(page.getByRole("heading", { name: "Ventas" })).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-albaranes.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Facturas" }).click();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-facturas.png`,
    fullPage: true,
  });
  await page.locator(".sales-list .entity-card").first().click();
  await expect(page.getByText("Total", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-factura.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const undersized = await page
    .locator("button:visible, a:visible")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width < 44 || box.height < 44;
        }).length,
    );
  expect(undersized).toBe(0);
});
test("emisión, conversión, PDF, cancelación y refacturación completa", async ({
  page,
}, testInfo) => {
  await login(page);
  const series = `E2E-${testInfo.project.name}`.slice(0, 20);
  await page.goto("/ventas/nuevo/albaran");
  await page.getByLabel("Cliente").selectOption({ index: 1 });
  await page.getByLabel("Serie").fill(series);
  await page.getByLabel("Producto").selectOption({ index: 1 });
  await page.getByLabel("Cantidad").fill("2,5");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page.getByRole("heading", { name: "Borrador" })).toBeVisible();
  const deliveryNoteUrl = page.url();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Emitir documento" }).click();
  await expect(page.locator(".status")).toHaveText("issued");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Convertir en factura" }).click();
  await expect(page).toHaveURL(/\/ventas\/facturas\//);
  await expect(page.getByRole("heading", { name: "Borrador" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Emitir documento" }).click();
  await expect(page.locator(".status")).toHaveText("issued");

  const pdfResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/pdf") && response.status() === 200,
  );
  await page.getByRole("button", { name: "Ver PDF" }).click();
  const pdfResponse = await pdfResponsePromise;
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  expect(Number(pdfResponse.headers()["content-length"])).toBeGreaterThan(
    1_000,
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.locator(".status")).toHaveText("cancelled");

  await page.goto(deliveryNoteUrl);
  await expect(page.locator(".status")).toHaveText("issued");
  await expect(
    page.getByRole("button", { name: "Convertir en factura" }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Convertir en factura" }).click();
  await expect(page).toHaveURL(/\/ventas\/facturas\//);
  await expect(page.getByRole("heading", { name: "Borrador" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Emitir documento" }).click();
  await expect(page.locator(".status")).toHaveText("issued");
});
test("catálogo, importación cancelada y dos pestañas", async ({
  page,
  context,
}, testInfo) => {
  await login(page);
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByText("Resumen operativo")).toBeVisible();
  await page.goto("/catalogo/contactos");
  await expect(page.getByRole("heading", { name: "Contactos" })).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-contactos.png`,
    fullPage: true,
  });
  await page.locator(".entity-card").first().click();
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-ficha-contacto.png`,
    fullPage: true,
  });
  await page.goto("/catalogo/productos");
  await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-productos.png`,
    fullPage: true,
  });
  await page.goto("/importar");
  await page.getByLabel("Qué quieres importar").selectOption("products");
  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({
    name: "productos-invalidos.json",
    mimeType: "application/json",
    buffer: Buffer.from("{json inválido"),
  });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-error-validacion.png`,
    fullPage: true,
  });
  await page.reload();
  await page.getByLabel("Qué quieres importar").selectOption("products");
  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({
    name: "productos-ficticios.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '[{"name":"E2E ficticio","sku":"E2E-SKU-UNICO","unit":"kg","salePrice":"1.2345","taxRate":"4"}]',
    ),
  });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await page.getByRole("button", { name: "Validar y previsualizar" }).click();
  await expect(page.getByText("Paso 3 · Revisar errores")).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-importacion-validada.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancelar lote" }).click();
});

test("mapeo manual, plantilla reutilizable, obligatorios, duplicados y error de red", async ({ page }, testInfo) => {
  const runKey = `${testInfo.project.name}-${testInfo.retry}`;
  await login(page);
  await page.goto("/importar");
  await page.getByLabel("Qué quieres importar").selectOption("products");
  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({ name: "manual.csv", mimeType: "text/csv", buffer: Buffer.from(`A,B,C,D\nProducto manual ${runKey},kg,2.3456,4\n`) });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await page.getByLabel("Columna para Nombre").selectOption("A");
  await page.getByLabel("Columna para Unidad").selectOption("B");
  await page.getByLabel("Columna para Precio de venta").selectOption("C");
  await page.getByLabel("Columna para IVA").selectOption("D");
  await page.getByText("Guardar como plantilla").click();
  const template = `Plantilla ${runKey}`.slice(0, 80);
  await page.getByText("Nombre de la plantilla").locator("..").getByRole("textbox").fill(template);
  await page.getByRole("button", { name: "Validar y previsualizar" }).click();
  await page.getByLabel("Estrategia de conflictos").selectOption("skip_existing");
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByText("Importación completada")).toBeVisible();

  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({ name: "reutilizada.csv", mimeType: "text/csv", buffer: Buffer.from("A,B,C,D\nOtro producto,kg,3.0000,4\n") });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await page.getByLabel("Usar una plantilla guardada").selectOption({ label: template });
  await expect(page.getByLabel("Columna para Nombre")).toHaveValue("A");
  await page.getByRole("button", { name: "Atrás" }).click();

  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({ name: "sin-obligatorio.csv", mimeType: "text/csv", buffer: Buffer.from("nombre\nIncompleto\n") });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await expect(page.getByRole("button", { name: "Validar y previsualizar" })).toBeDisabled();
  await page.getByRole("button", { name: "Atrás" }).click();
  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({ name: "duplicada.csv", mimeType: "text/csv", buffer: Buffer.from("nombre,nombre,unidad,precio,iva\nA,B,kg,1,4\n") });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await expect(page.getByRole("alert")).toContainText("cabeceras duplicadas");
  await page.getByRole("button", { name: "Atrás" }).click();

  await page.route("**/imports/detect-columns", (route) => route.abort());
  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({ name: "red.csv", mimeType: "text/csv", buffer: Buffer.from("nombre,unidad,precio,iva\nRed,kg,1,4\n") });
  await page.getByRole("button", { name: "Detectar columnas" }).click();
  await expect(page.getByRole("alert")).toContainText("No se han podido detectar");
});
