import { createServer } from "node:http";

// Servidor exclusivamente local para revisión visual. Nunca se usa en el build ni en Compose.
const port = 4199;
const contacts = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    type: "customer",
    legalName: "Mercado de Prueba Norte",
    tradeName: "Mercado Norte",
    taxId: "TEST-C-001",
    email: "compras@example.test",
    phone: "+34600000001",
    address: {
      street: "Calle de Prueba 1",
      postalCode: "28000",
      city: "Madrid",
      province: "Madrid",
      country: "ES",
    },
    notes: "Datos completamente ficticios para validación visual.",
    isActive: true,
    createdAt: "2026-07-15",
    updatedAt: "2026-07-15",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    type: "both",
    legalName: "Comercio Ficticio Central",
    tradeName: null,
    taxId: "TEST-C-002",
    email: null,
    phone: "+34600000002",
    address: {},
    notes: null,
    isActive: true,
    createdAt: "2026-07-15",
    updatedAt: "2026-07-15",
  },
];
const products = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Producto de prueba premium",
    description: "Ficticio",
    sku: "TEST-P-001",
    unit: "kg",
    salePrice: "12.3456",
    estimatedCost: "8.0001",
    taxRate: "4",
    margin: { amount: "4.3455", percentage: "35.1999" },
    isActive: true,
    createdAt: "2026-07-15",
    updatedAt: "2026-07-15",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    name: "Caja de muestra",
    description: null,
    sku: "TEST-P-002",
    unit: "box",
    salePrice: "24.50",
    estimatedCost: null,
    taxRate: "21",
    margin: null,
    isActive: true,
    createdAt: "2026-07-15",
    updatedAt: "2026-07-15",
  },
];
const salesLine = {
  id: "70000000-0000-4000-8000-000000000001",
  productId: products[0].id,
  description: products[0].name,
  quantity: "2.0000",
  unit: "kg",
  unitPrice: "9.8765",
  taxRate: "4.000",
  lineSubtotal: "19.7530",
  lineTax: "0.7901",
  lineTotal: "20.5431",
  position: 1,
};

function send(response, status, body, extra = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    ...extra,
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

createServer(async (request, response) => {
  let rawBody = "";
  for await (const chunk of request) rawBody += chunk;
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  console.log(`${request.method} ${url.pathname}`);
  if (request.method === "OPTIONS") return send(response, 204);
  if (url.pathname === "/auth/login") {
    const credentials = JSON.parse(rawBody || "{}");
    if (credentials.email === "incorrecto@example.test")
      return send(response, 401, { error: "invalid_credentials" });
    return send(
      response,
      200,
      { accessToken: "visual-access", tokenType: "Bearer", expiresIn: 900 },
      {
        "Set-Cookie":
          "factupapa_refresh=visual-refresh; HttpOnly; SameSite=Strict; Path=/",
      },
    );
  }
  if (url.pathname === "/auth/refresh") {
    if (!request.headers.cookie?.includes("factupapa_refresh="))
      return send(response, 401, { error: "invalid_refresh_token" });
    return send(
      response,
      200,
      { accessToken: "visual-access-2", tokenType: "Bearer", expiresIn: 900 },
      {
        "Set-Cookie":
          "factupapa_refresh=visual-refresh-2; HttpOnly; SameSite=Strict; Path=/",
      },
    );
  }
  if (url.pathname === "/auth/logout")
    return send(response, 204, undefined, {
      "Set-Cookie":
        "factupapa_refresh=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    });
  if (url.pathname === "/me")
    return send(response, 200, {
      id: "30000000-0000-4000-8000-000000000001",
      email: "visual@example.test",
      displayName: "Nando Prueba",
      company: {
        id: "40000000-0000-4000-8000-000000000001",
        name: "Empresa ficticia de validación",
      },
      membership: { role: "owner" },
    });
  if (url.pathname === "/contacts") {
    const requestedType = url.searchParams.get("type");
    const filtered = requestedType
      ? contacts.filter((contact) => contact.type === requestedType)
      : contacts;
    return send(response, 200, {
      items: filtered,
      total: filtered.length,
      page: 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? 20),
    });
  }
  const contact = contacts.find(
    (item) => url.pathname === `/contacts/${item.id}`,
  );
  if (contact) return send(response, 200, contact);
  if (/^\/contacts\/[^/]+\/products$/.test(url.pathname))
    return send(response, 200, {
      items: products.map((product, index) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        salePrice: product.salePrice,
        specificPrice: index === 0 ? "10.7500" : null,
        effectivePrice: index === 0 ? "10.7500" : product.salePrice,
        taxRate: product.taxRate,
        margin: product.margin,
      })),
      total: products.length,
      page: 1,
      pageSize: 100,
    });
  if (url.pathname === "/products")
    return send(response, 200, {
      items: products,
      total: products.length,
      page: 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? 20),
    });
  const product = products.find(
    (item) => url.pathname === `/products/${item.id}`,
  );
  if (product) return send(response, 200, product);
  if (url.pathname === "/imports")
    return send(response, 200, { items: [], total: 0, page: 1, pageSize: 25 });
  if (url.pathname === "/imports/validate") {
    const input = JSON.parse(rawBody || "{}");
    if (typeof input.content !== "string" || input.content.startsWith("{json"))
      return send(response, 400, { error: "invalid_json" });
    return send(response, 200, {
      id: "80000000-0000-4000-8000-000000000001",
      entityType: input.entityType,
      sourceFormat: input.sourceFormat,
      status: "validated",
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      duplicateRows: 0,
      validationSummary: { newRows: 1, conflicts: 0 },
      createdAt: "2026-07-15T00:00:00Z",
      validatedAt: "2026-07-15T00:00:00Z",
      completedAt: null,
      failedAt: null,
      reused: false,
      rows: [
        {
          rowNumber: 1,
          classification: "new",
          proposedAction: "create",
          normalizedData: { name: "E2E ficticio" },
          errors: [],
          warnings: [],
        },
      ],
    });
  }
  if (/^\/imports\/[^/]+\/cancel$/.test(url.pathname))
    return send(response, 204);
  if (url.pathname === "/delivery-notes")
    return send(response, 200, {
      items: [
        {
          id: "50000000-0000-4000-8000-000000000001",
          contactId: contacts[0].id,
          number: 12,
          series: "A",
          issueDate: "2026-07-15",
          status: "issued",
          notes: null,
          subtotal: "19.7530",
          taxTotal: "0.7901",
          total: "20.5431",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });
  if (url.pathname === "/invoices")
    return send(response, 200, {
      items: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          contactId: contacts[0].id,
          number: 7,
          series: "F",
          issueDate: "2026-07-15",
          dueDate: null,
          status: "issued",
          notes: null,
          subtotal: "19.7530",
          taxTotal: "0.7901",
          total: "20.5431",
          sourceType: "manual",
          contactLegalName: contacts[0].legalName,
          contactTaxId: contacts[0].taxId,
          contactAddress: contacts[0].address,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });
  if (/^\/delivery-notes\/[^/]+$/.test(url.pathname))
    return send(response, 200, {
      id: "50000000-0000-4000-8000-000000000001",
      contactId: contacts[0].id,
      number: 12,
      series: "A",
      issueDate: "2026-07-15",
      status: "issued",
      notes: null,
      subtotal: "19.7530",
      taxTotal: "0.7901",
      total: "20.5431",
      lines: [salesLine],
    });
  if (/^\/invoices\/[^/]+$/.test(url.pathname))
    return send(response, 200, {
      id: "60000000-0000-4000-8000-000000000001",
      contactId: contacts[0].id,
      number: 7,
      series: "F",
      issueDate: "2026-07-15",
      dueDate: null,
      status: "issued",
      notes: null,
      subtotal: "19.7530",
      taxTotal: "0.7901",
      total: "20.5431",
      sourceType: "manual",
      contactLegalName: contacts[0].legalName,
      contactTaxId: contacts[0].taxId,
      contactAddress: contacts[0].address,
      lines: [salesLine],
      deliveryNoteIds: [],
    });
  if (url.pathname === "/health" || url.pathname === "/ready")
    return send(response, 200, { status: "ok" });
  return send(response, 404, { error: "not_found" });
}).listen(port, "127.0.0.1", () =>
  console.log(`Visual fixture: http://127.0.0.1:${port}`),
);
