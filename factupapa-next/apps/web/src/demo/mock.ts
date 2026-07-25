// Demo aislada: se activa con VITE_DEMO=1 o ?demo=1.
// Intercepta únicamente /demo-api. No usa backend ni persiste datos fuera del navegador.
export const DEMO_API_BASE = "/demo-api";

const now = new Date();
const date = (monthOffset = 0, day = 1) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOffset, day))
    .toISOString()
    .slice(0, 10);

const company = { id: "demo-company", name: "Gonsol de la Vega · Demo" };
const currentUser = {
  id: "demo-user",
  email: "demo@factupapa.test",
  displayName: "Nando Demo",
  company,
  membership: { role: "owner" },
};
const tokens = { accessToken: "demo-access-token", tokenType: "Bearer", expiresIn: 900 };

const contacts = [
  {
    id: "demo-client-1", type: "customer", legalName: "Bar La Esquina (ficticio)", tradeName: "La Esquina",
    taxId: "B00000001", email: "bar@example.test", phone: "600000001", address: {}, notes: null,
    paymentTermsDays: 15, paymentTermsText: "Pago quincenal", defaultInvoiceInformation: null,
    applyInvoiceDefaults: true, invoicePeriod: "fortnightly", isActive: true, createdAt: date(8),
  },
  {
    id: "demo-client-2", type: "customer", legalName: "Pollería Pepe (ficticio)", tradeName: "Pollería Pepe",
    taxId: "B00000002", email: null, phone: "600000002", address: {}, notes: null,
    paymentTermsDays: 0, paymentTermsText: null, defaultInvoiceInformation: null,
    applyInvoiceDefaults: false, invoicePeriod: "manual", isActive: true, createdAt: date(6),
  },
  {
    id: "demo-supplier-1", type: "supplier", legalName: "Frutas y Patatas Demo, S.A.", tradeName: "Patatas Demo",
    taxId: "A04037677", email: null, phone: null, address: {}, notes: null,
    paymentTermsDays: 0, paymentTermsText: null, defaultInvoiceInformation: null,
    applyInvoiceDefaults: false, invoicePeriod: "manual", isActive: true, createdAt: date(10),
  },
];

const products = [
  { id: "demo-product-raw", name: "Patata agria", unit: "kg", salePrice: "1.60", estimatedCost: "0.80", taxRate: "4", isActive: true },
  { id: "demo-product-peeled", name: "Patata pelada y cortada", unit: "kg", salePrice: "1.60", estimatedCost: "1.00", taxRate: "4", isActive: true },
];

const invoices = Array.from({ length: 12 }, (_, index) => {
  const subtotal = 150 + index * 22;
  const paid = index % 3 === 0;
  return {
    id: `demo-invoice-${index + 1}`, contactId: index % 2 ? "demo-client-1" : "demo-client-2",
    number: 100 + index, series: "FAC", issueDate: date(Math.floor(index / 3), 3 + (index % 3) * 7),
    dueDate: date(Math.floor(index / 3), 18 + (index % 3) * 4), operationStartDate: null, operationEndDate: null,
    deliveryDates: [], paymentTerms: null, generalInformation: null, status: "issued",
    paymentStatus: paid ? "paid" : index % 4 === 0 ? "partial" : "unpaid",
    paidTotal: paid ? String(subtotal * 1.04) : index % 4 === 0 ? "100" : "0",
    balanceDue: paid ? "0" : String(subtotal * 1.04 - (index % 4 === 0 ? 100 : 0)), notes: null,
    subtotal: subtotal.toFixed(2), taxTotal: (subtotal * 0.04).toFixed(2), total: (subtotal * 1.04).toFixed(2),
    sourceType: "manual", contactLegalName: index % 2 ? "Bar La Esquina (ficticio)" : "Pollería Pepe (ficticio)",
    contactTaxId: index % 2 ? "B00000001" : "B00000002", contactAddress: {},
  };
});

const purchases = Array.from({ length: 8 }, (_, index) => {
  const subtotal = 320 + index * 18;
  return {
    id: `demo-purchase-${index + 1}`, supplierId: "demo-supplier-1", documentId: null,
    supplierName: "Frutas y Patatas Demo, S.A.", supplierInvoiceNumber: `COMP-${1600 + index}`,
    issueDate: date(Math.floor(index / 2), 4 + (index % 2) * 12), dueDate: null, status: "confirmed",
    paymentStatus: index % 3 === 0 ? "paid" : "unpaid", paidTotal: index % 3 === 0 ? (subtotal * 1.04).toFixed(2) : "0",
    balanceDue: index % 3 === 0 ? "0" : (subtotal * 1.04).toFixed(2), category: "mercancia",
    subtotal: subtotal.toFixed(2), taxTotal: (subtotal * 0.04).toFixed(2), total: (subtotal * 1.04).toFixed(2), notes: null,
  };
});

const recurring = [{
  id: "demo-recurring-1", supplierId: null, supplierName: null, name: "Gestoría (ficticio)", category: "gestoria",
  amount: "60.00", taxRate: "21", chargeDay: 5, startsOn: date(10), endsOn: null, isActive: true, notes: null,
}];

const stock = [
  { productId: "demo-product-raw", name: "Patata agria", unit: "kg", quantity: "1260", salePrice: "1.60", estimatedCost: "0.80", averagePurchaseCost: "0.79", potentialRevenue: "2016.00", stockValue: "995.40", potentialGrossMargin: "1020.60" },
  { productId: "demo-product-peeled", name: "Patata pelada y cortada", unit: "kg", quantity: "210", salePrice: "1.60", estimatedCost: "1.00", averagePurchaseCost: "1.00", potentialRevenue: "336.00", stockValue: "210.00", potentialGrossMargin: "126.00" },
];

const monthly = [5, 4, 3, 2, 1, 0].map((offset) => {
  const sales = 2400 + (5 - offset) * 210;
  const bought = 1200 + (5 - offset) * 68;
  return { month: date(offset).slice(0, 7), sales: String(sales), purchases: String(bought), recurring: "310", balance: String(sales - bought - 310) };
});

const extractedData = {
  supplierId: "demo-supplier-1", supplierName: "Frutas y Patatas Demo, S.A.", supplierTaxId: "A04037677",
  supplierInvoiceNumber: "FV006-00001684", issueDate: date(0, 16), dueDate: null,
  subtotal: "126.00", taxTotal: "5.04", total: "131.04", concept: "PATATA AGRIA",
  purchasedSacks: 14, purchasedQuantityKg: "210",
  lines: [{ description: "PATATA AGRIA", quantity: "210", unit: "kg", unitCost: "0.60", taxRate: "4", discount: "0", lineTotal: "126.00" }],
  ocrConfidence: 94, source: "vision",
  fieldConfidence: { supplierName: "high", supplierTaxId: "high", supplierInvoiceNumber: "high", issueDate: "high", total: "high", lines: "medium" },
  warnings: [],
};

const invoiceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="820"><rect width="100%" height="100%" fill="#fffdf7"/><text x="40" y="70" font-family="system-ui" font-size="28" fill="#0f172a">Frutas y Patatas Demo, S.A.</text><text x="40" y="115" font-family="system-ui" font-size="16">Factura FV006-00001684 · ${date(0,16)}</text><text x="40" y="220" font-family="system-ui" font-size="16">Patata agria · 210 kg × 0,60 €</text><text x="40" y="680" font-family="system-ui" font-size="18">Base 126,00 € · IVA 4% 5,04 €</text><text x="40" y="730" font-family="system-ui" font-size="28" font-weight="700">TOTAL 131,04 €</text></svg>`;

const createdPurchases = new Map<string, any>();
let counter = 0;
const page = (items: any[]) => ({ items, total: items.length, page: 1, pageSize: 100 });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const inRange = (value: string, params: URLSearchParams) => (!params.get("from") || value >= params.get("from")!) && (!params.get("to") || value <= params.get("to")!);

function route(path: string, method: string, params: URLSearchParams, body: string): Response {
  if (path === "/auth/login" || path === "/auth/refresh") return json(tokens);
  if (path === "/auth/logout") return new Response(null, { status: 204 });
  if (path === "/me") return json(currentUser);
  if (path === "/sales-preferences") return json({ invoicePrefix: "FAC", invoiceStartNumber: 100, defaultTaxRate: "4", primarySalesFlow: "direct", numberingMode: "test", numberingActivatedAt: null });
  if (path === "/contacts") return json(page(contacts.filter((item) => !params.get("type") || item.type === params.get("type"))));
  if (path.match(/^\/contacts\/[^/]+$/)) return json(contacts.find((item) => item.id === path.split("/").pop()) ?? contacts[0]);
  if (path === "/products") return json(page(products));
  if (path.match(/^\/products\/[^/]+$/)) return json(products.find((item) => item.id === path.split("/").pop()) ?? products[0]);
  if (path === "/imports") return json(page([]));
  if (path === "/delivery-notes") return json(page([]));
  if (path === "/invoices") return json(page(invoices.filter((item) => inRange(item.issueDate, params))));
  const invoiceMatch = path.match(/^\/invoices\/([^/]+)$/);
  if (invoiceMatch) return json(invoices.find((item) => item.id === invoiceMatch[1]) ?? invoices[0]);
  if (path === "/finance/summary") {
    const last = monthly.at(-1)!;
    return json({ sales: last.sales, purchases: last.purchases, recurring: last.recurring, balance: last.balance, stockKg: "1260", potentialRevenue: "2016.00", receivables: "545.00", overdueReceivables: "320.00", payables: "425.00" });
  }
  if (path === "/finance/monthly") return json(monthly);
  if (path === "/purchases" && method === "GET") return json([...purchases, ...createdPurchases.values()].filter((item) => inRange(item.issueDate, params)));
  if (path === "/purchases" && method === "POST") {
    const input = JSON.parse(body || "{}") as any;
    const lines = input.lines ?? [];
    const subtotal = lines.reduce((sum: number, line: any) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0);
    const tax = lines.reduce((sum: number, line: any) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0) * Number(line.taxRate || 0) / 100, 0);
    const id = `demo-created-${++counter}`;
    const created = { id, ...input, supplierName: contacts.find((item) => item.id === input.supplierId)?.legalName ?? "Proveedor demo", status: "draft", paymentStatus: "unpaid", paidTotal: "0", balanceDue: (subtotal + tax).toFixed(2), subtotal: subtotal.toFixed(2), taxTotal: tax.toFixed(2), total: (subtotal + tax).toFixed(2), lines: lines.map((line: any, index: number) => ({ id: `${id}-${index}`, ...line, lineSubtotal: (Number(line.quantity) * Number(line.unitCost)).toFixed(2), lineTax: "0.00", lineTotal: (Number(line.quantity) * Number(line.unitCost)).toFixed(2), position: index + 1 })) };
    createdPurchases.set(id, created);
    return json(created, 201);
  }
  const purchaseMatch = path.match(/^\/purchases\/([^/]+)$/);
  if (purchaseMatch) return json(createdPurchases.get(purchaseMatch[1]) ?? purchases.find((item) => item.id === purchaseMatch[1]) ?? purchases[0]);
  if (path === "/purchase-documents" && method === "POST") return json({ id: "demo-document", filename: "factura-demo.svg", mimeType: "image/svg+xml", byteSize: "1024", status: "needs_review", extractedData }, 201);
  if (path.startsWith("/purchase-documents/")) return new Response(invoiceSvg, { status: 200, headers: { "Content-Type": "image/svg+xml" } });
  if (path === "/recurring-expenses") return json(recurring);
  if (path === "/stock") return json(stock);
  if (path === "/stock/movements") return json([]);
  if (path === "/production-runs") return json([]);
  if (method === "GET") return json(page([]));
  return json({ demo: true }, 200);
}

export function installDemoApi() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!value.includes(`${DEMO_API_BASE}/`)) return original(input, init);
    const parsed = new URL(value, window.location.origin);
    const path = parsed.pathname.slice(parsed.pathname.indexOf(DEMO_API_BASE) + DEMO_API_BASE.length);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.clone().text() : "";
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    try { return route(path, method, parsed.searchParams, body); }
    catch { return json({ error: "demo_error" }, 500); }
  };
}
