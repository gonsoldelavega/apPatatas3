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

test("una factura se puede marcar como pagada directamente desde el listado", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "La regresión se valida en el ancho real de iPhone.");

  await login(page);
  await page.goto("/ventas/nuevo/factura");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Producto 1").selectOption({ index: 1 });
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Revisar factura" }).click();
  await expect(page).toHaveURL(/\/ventas\/facturas\//);

  const invoiceNumber = (await page.locator(".detail-header__title h1").textContent())?.trim();
  expect(invoiceNumber).toBeTruthy();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Emitir factura" }).click();
  await expect(page.getByText("Emitida", { exact: true })).toBeVisible();

  await page.goto("/ventas");
  const invoiceCard = page
    .locator(".invoice-list-card")
    .filter({ hasText: invoiceNumber! })
    .first();
  await expect(invoiceCard).toBeVisible();
  const markPaid = invoiceCard.getByRole("button", {
    name: "Marcar factura como pagada",
  });
  await expect(markPaid).toBeVisible();
  await expect(markPaid).toContainText("Marcar pagada");

  const paymentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/invoices\/[^/]+\/payments$/.test(request.url())) {
      paymentRequests.push(request.postData() ?? "");
    }
  });
  page.once("dialog", (dialog) => void dialog.accept());
  await markPaid.click();

  await expect(page.getByText("Factura marcada como pagada.", { exact: true })).toBeVisible();
  await expect.poll(() => paymentRequests.length).toBe(1);
  expect(paymentRequests[0]).toContain('"settleBalance":true');
  await expect(invoiceCard.getByText("Pagada", { exact: true })).toBeVisible();
  await expect(
    invoiceCard.getByRole("button", { name: "Marcar factura como pagada" }),
  ).toHaveCount(0);
  await page.reload();
  const persistedCard = page.locator(".invoice-list-card").filter({ hasText: invoiceNumber! }).first();
  await expect(persistedCard.getByText("Pagada", { exact: true })).toBeVisible();
  await expect(persistedCard.getByRole("button", { name: "Marcar factura como pagada" })).toHaveCount(0);
});

test("el selector de mes no tapa el resultado en móviles", async ({ page }) => {
  test.skip(test.info().project.name === "desktop", "La regresión cubre anchos móviles reales.");
  await login(page);
  const card = page.locator(".result-card");
  const value = page.getByTestId("dashboard-result-value");
  const picker = page.locator(".dashboard-month-nav");
  await expect(card).toBeVisible();
  const boxes = await Promise.all([card.boundingBox(), value.boundingBox(), picker.boundingBox()]);
  const [cardBox, valueBox, pickerBox] = boxes;
  expect(cardBox && valueBox && pickerBox).toBeTruthy();
  expect(valueBox!.y).toBeGreaterThanOrEqual(cardBox!.y);
  expect(valueBox!.y).toBeGreaterThan(pickerBox!.y + pickerBox!.height - 1);
  expect(valueBox!.x + valueBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  expect(await page.locator(".result-card").getByText(/septiembre 2026/i).count()).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
