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
  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({
    name: "productos-invalidos.json",
    mimeType: "application/json",
    buffer: Buffer.from("{json inválido"),
  });
  await page.getByRole("button", { name: "Validar archivo" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-error-validacion.png`,
    fullPage: true,
  });
  await page.reload();
  await page.getByLabel("Seleccionar archivo CSV o JSON").setInputFiles({
    name: "productos-ficticios.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '[{"name":"E2E ficticio","sku":"E2E-SKU-UNICO","unit":"kg","salePrice":"1.2345","taxRate":"4"}]',
    ),
  });
  await page.getByRole("button", { name: "Validar archivo" }).click();
  await expect(page.getByText("Previsualización")).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-importacion-validada.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancelar lote" }).click();
});
