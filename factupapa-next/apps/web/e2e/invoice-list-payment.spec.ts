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

  page.once("dialog", (dialog) => void dialog.accept());
  await markPaid.click();

  await expect(page.getByText("Factura marcada como pagada.", { exact: true })).toBeVisible();
  await expect(invoiceCard.getByText("Pagada", { exact: true })).toBeVisible();
  await expect(
    invoiceCard.getByRole("button", { name: "Marcar factura como pagada" }),
  ).toHaveCount(0);
});
