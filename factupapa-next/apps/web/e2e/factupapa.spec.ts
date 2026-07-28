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
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Resultado del mes")).toBeVisible();
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

test("el primer acceso mantiene el tema claro y la identidad Verde Tinta", async ({
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
  expect(appearance.color).toBe("rgb(23, 53, 45)");
  expect(appearance.background).toBe("rgb(255, 255, 255)");
  expect(appearance.border).not.toBe(appearance.background);
  await context.close();
});

test("login, restauración de sesión, dashboard y logout", async ({ page }, testInfo) => {
  const errors: string[] = [];
  await page.goto("/login");
  await page.getByLabel("Email").fill("incorrecto@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No se ha podido iniciar sesión",
  );
  await login(page);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.reload();
  await expect(page.getByText("Resultado del mes")).toBeVisible();
  await page.screenshot({
    path: `test-artifacts/${testInfo.project.name}-inicio.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Más" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(errors).toEqual([]);
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
  await expect(page.getByRole("status")).toContainText("Compra confirmada");

  await createPurchase("cancelar");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Compra cancelada");
});

test("cliente quincenal, condiciones opcionales y precio editable", async ({
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
  await page
    .getByText("Incluir condiciones de pago por defecto")
    .click();
  await page.getByLabel("Días hasta vencimiento").fill("3");
  await page
    .getByText("Condiciones y consecuencias del impago")
    .locator("..")
    .getByRole("textbox")
    .fill("Pago en 3 días. La demora podrá suspender nuevos pedidos.");
  await page.getByRole("button", { name: "Guardar contacto" }).click();
  await expect(page).toHaveURL(/\/contactos\/[0-9a-f-]+$/);

  await page.goto("/ventas/nuevo/factura");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption({ label: customer });
  await expect(page.getByText("Periodo quincenal")).toBeVisible();
  await page.getByLabel("Producto 1").selectOption({ index: 1 });
  await page.getByLabel("Cantidad").fill("1");
  const price = page.getByLabel(/Precio sin IVA/);
  await expect(price).not.toHaveValue("");
  await price.fill("1,75");
  await page.getByText("Incluir condiciones de pago", { exact: true }).click();
  await page.getByRole("button", { name: "Revisar factura" }).click();
  await expect(page).toHaveURL(/\/ventas\/facturas\/[0-9a-f-]+$/);
  await expect(page.getByText(/1 kg × 1,75/)).toBeVisible();
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
