// Modo demo (VITE_DEMO=1): intercepta fetch y responde con datos ficticios
// en el navegador. No hay backend: nada se guarda ni sale del dispositivo.
import type {
  AuthTokens,
  Contact,
  CurrentUser,
  DeliveryNote,
  Invoice,
  Page,
  PurchaseInvoice,
  RecurringExpense,
  SalesPreferences,
  StockItem,
} from "../api/types";

export const DEMO_API_BASE = "/demo-api";

const today = new Date();
const monthStart = (offset: number, day = 1) =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, day))
    .toISOString()
    .slice(0, 10);

const company = { id: "demo-company", name: "Empresa Demo Ficticia" };
const currentUser: CurrentUser = {
  id: "demo-user",
  email: "demo@factupapa.test",
  displayName: "Usuario Demo",
  company,
  membership: { role: "owner" },
};
const tokens: AuthTokens = {
  accessToken: "demo-access-token",
  tokenType: "Bearer",
  expiresIn: 900,
};

const contactBase = {
  email: null,
  phone: null,
  address: {},
  notes: null,
  paymentTermsDays: 0,
  paymentTermsText: null,
  defaultInvoiceInformation: null,
  applyInvoiceDefaults: false,
  isActive: true,
  createdAt: monthStart(10),
};
const contacts: Contact[] = [
  {
    ...contactBase,
    id: "demo-cliente",
    type: "customer",
    legalName: "Restaurante La Huerta (ficticio)",
    tradeName: "La Huerta",
    taxId: "B12345674",
  },
  {
    ...contactBase,
    id: "demo-gayca",
    type: "supplier",
    legalName: "FRUTAS Y PATATAS GAYCA, S.A. (ficticio)",
    tradeName: "GAYCA",
    taxId: "A04037677",
  },
] as Contact[];

const products = [
  {
    id: "demo-patata",
    name: "Patata agria (saco 15 kg)",
    unit: "kg",
    salePrice: "0.95",
    estimatedCost: "0.60",
    taxRate: "4",
    isActive: true,
  },
];

const invoices: Invoice[] = [];
for (let m = 5; m >= 0; m--)
  for (let k = 0; k < 4; k++) {
    const subtotal = 120 + 30 * k - 8 * m;
    invoices.push({
      id: `demo-factura-${m}-${k}`,
      contactId: "demo-cliente",
      number: 100 + (5 - m) * 4 + k,
      series: "TEST",
      issueDate: monthStart(m, 3 + 7 * k),
      dueDate: null,
      operationStartDate: null,
      operationEndDate: null,
      deliveryDates: [],
      paymentTerms: null,
      generalInformation: null,
      status: "issued",
      notes: null,
      subtotal: subtotal.toFixed(2),
      taxTotal: (subtotal * 0.04).toFixed(2),
      total: (subtotal * 1.04).toFixed(2),
      sourceType: "manual",
      contactLegalName: "Restaurante La Huerta (ficticio)",
      contactTaxId: "B12345674",
      contactAddress: {},
    } as Invoice);
  }

const purchases: PurchaseInvoice[] = [];
for (let m = 5; m >= 0; m--)
  for (let k = 0; k < 3; k++) {
    const subtotal = 126 + 11 * k + 6 * m;
    purchases.push({
      id: `demo-compra-${m}-${k}`,
      supplierId: "demo-gayca",
      documentId: null,
      supplierName: "FRUTAS Y PATATAS GAYCA, S.A. (ficticio)",
      supplierInvoiceNumber: `FV006-00001${600 + m * 4 + k}`,
      issueDate: monthStart(m, 4 + 6 * k),
      dueDate: null,
      status: "confirmed",
      category: "mercancia",
      subtotal: subtotal.toFixed(2),
      taxTotal: (subtotal * 0.04).toFixed(2),
      total: (subtotal * 1.04).toFixed(2),
      notes: null,
    });
  }

const recurring: RecurringExpense[] = [
  {
    id: "demo-gestoria",
    supplierId: null,
    supplierName: null,
    name: "Gestoría Bongest (ficticio)",
    category: "gestoria",
    amount: "60.00",
    taxRate: "21",
    chargeDay: 5,
    startsOn: monthStart(10),
    endsOn: null,
    isActive: true,
    notes: null,
  },
];

const deliveryNotes: DeliveryNote[] = [
  {
    id: "demo-albaran",
    contactId: "demo-cliente",
    number: 41,
    series: "TEST",
    issueDate: monthStart(0, 2),
    status: "issued",
    notes: null,
    subtotal: "57.00",
    taxTotal: "2.28",
    total: "59.28",
  },
];

const stock: StockItem[] = [
  {
    productId: "demo-patata",
    name: "Patata agria (saco 15 kg)",
    unit: "kg",
    quantity: "435",
    salePrice: "0.95",
    estimatedCost: "0.60",
    averagePurchaseCost: "0.61",
    potentialRevenue: "413.25",
    stockValue: "265.35",
    potentialGrossMargin: "147.90",
  },
];

const salesPreferences: SalesPreferences = {
  invoicePrefix: "TEST",
  invoiceStartNumber: 1,
  defaultTaxRate: "4",
  primarySalesFlow: "adaptive",
  numberingMode: "test",
  numberingActivatedAt: null,
};

const monthly = [5, 4, 3, 2, 1, 0].map((m) => {
  const sales = invoices
    .filter((x) => x.issueDate.startsWith(monthStart(m).slice(0, 7)))
    .reduce((s, x) => s + Number(x.total), 0);
  const bought = purchases
    .filter((x) => x.issueDate.startsWith(monthStart(m).slice(0, 7)))
    .reduce((s, x) => s + Number(x.total), 0);
  return {
    month: monthStart(m).slice(0, 7),
    sales: sales.toFixed(2),
    purchases: bought.toFixed(2),
    recurring: "60.00",
    balance: (sales - bought - 60).toFixed(2),
  };
});

const gaycaExtraction = {
  supplierId: "demo-gayca",
  supplierName: "FRUTAS Y PATATAS GAYCA, S.A.",
  supplierTaxId: "A04037677",
  supplierInvoiceNumber: "FV006-00001684",
  issueDate: monthStart(0, 16),
  subtotal: "126.00",
  taxTotal: "5.04",
  total: "131.04",
  concept: "PATATA LAVADA",
  purchasedSacks: 14,
  purchasedQuantityKg: "210",
  lines: [
    {
      description: "PATATA LAVADA",
      quantity: "210",
      unit: "kg",
      unitCost: "0.61",
      taxRate: "4",
      discount: "2.10",
      lineTotal: "126.00",
    },
  ],
  ocrConfidence: 91,
  source: "vision",
  fieldConfidence: {
    supplierInvoiceNumber: "high",
    issueDate: "high",
    subtotal: "high",
    taxTotal: "medium",
    total: "high",
    supplierTaxId: "high",
    supplierName: "high",
    lines: "medium",
  },
  warnings: [],
};

const invoiceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="820" viewBox="0 0 620 820">
<rect width="620" height="820" fill="#fdfdf9"/>
<rect x="30" y="30" width="560" height="90" rx="8" fill="#eef2ea"/>
<text x="50" y="70" font-family="Georgia" font-size="26" fill="#1c3a2c">FRUTAS Y PATATAS GAYCA, S.A.</text>
<text x="50" y="100" font-family="sans-serif" font-size="14" fill="#4a5a50">CIF A04037677 · (documento ficticio de demostración)</text>
<text x="50" y="170" font-family="sans-serif" font-size="16" fill="#1c3a2c">Factura FV006-00001684 · Fecha 16/07/2026</text>
<line x1="40" y1="200" x2="580" y2="200" stroke="#c9d2c5"/>
<text x="50" y="240" font-family="sans-serif" font-size="14" fill="#333">PATATA LAVADA — 210 kg × 0,61 € · dto. 2,10 €</text>
<text x="470" y="240" font-family="sans-serif" font-size="14" fill="#333">126,00 €</text>
<line x1="40" y1="620" x2="580" y2="620" stroke="#c9d2c5"/>
<text x="50" y="660" font-family="sans-serif" font-size="14" fill="#333">Base imponible 126,00 € · IVA 4% 5,04 €</text>
<text x="50" y="700" font-family="sans-serif" font-size="20" fill="#1c3a2c">TOTAL 131,04 €</text>
</svg>`;

const createdPurchases = new Map<string, PurchaseInvoice>();
let createdCounter = 0;

const page = <T,>(items: T[]): Page<T> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 100,
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function inRange(date: string, params: URLSearchParams) {
  const from = params.get("from"),
    to = params.get("to");
  return (!from || date >= from) && (!to || date <= to);
}

function route(path: string, method: string, params: URLSearchParams, body: string): Response {
  if (path === "/auth/login" || path === "/auth/refresh") return json(tokens);
  if (path === "/auth/logout") return new Response(null, { status: 204 });
  if (path === "/me") return json(currentUser);
  if (path === "/sales-preferences") return json(salesPreferences);
  if (path === "/contacts") {
    const type = params.get("type");
    return json(page(contacts.filter((x) => !type || x.type === type)));
  }
  if (path === "/products") return json(page(products));
  if (path === "/imports") return json(page([]));
  if (path === "/delivery-notes") {
    return json(
      page(
        deliveryNotes.filter(
          (x) =>
            inRange(x.issueDate, params) &&
            (!params.get("status") || x.status === params.get("status")),
        ),
      ),
    );
  }
  if (path === "/invoices") {
    return json(
      page(
        invoices.filter(
          (x) =>
            inRange(x.issueDate, params) &&
            (!params.get("status") || x.status === params.get("status")) &&
            (!params.get("contactId") || x.contactId === params.get("contactId")),
        ),
      ),
    );
  }
  if (path === "/finance/summary") {
    const row = monthly[monthly.length - 1]!;
    return json({
      sales: row.sales,
      purchases: row.purchases,
      recurring: row.recurring,
      balance: row.balance,
      stockKg: "435",
      potentialRevenue: "413.25",
    });
  }
  if (path === "/finance/monthly") return json(monthly);
  if (path === "/purchases" && method === "GET")
    return json(
      [...purchases, ...createdPurchases.values()].filter((x) =>
        inRange(x.issueDate, params),
      ),
    );
  if (path === "/purchases" && method === "POST") {
    const input = JSON.parse(body || "{}") as Record<string, unknown>;
    const id = `demo-nueva-${++createdCounter}`;
    const lines = (input.lines as Array<Record<string, string>> | undefined) ?? [];
    const subtotal = lines.reduce(
      (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
      0,
    );
    const tax = lines.reduce(
      (sum, line) =>
        sum +
        Number(line.quantity || 0) *
          Number(line.unitCost || 0) *
          (Number(line.taxRate || 0) / 100),
      0,
    );
    const created: PurchaseInvoice = {
      id,
      supplierId: (input.supplierId as string) ?? null,
      documentId: (input.documentId as string) ?? null,
      supplierName:
        contacts.find((x) => x.id === input.supplierId)?.legalName ?? "Proveedor",
      supplierInvoiceNumber: (input.supplierInvoiceNumber as string) ?? null,
      issueDate: (input.issueDate as string) ?? monthStart(0, 16),
      dueDate: (input.dueDate as string) ?? null,
      status: "draft",
      category: (input.category as string) ?? "mercancia",
      subtotal: subtotal.toFixed(2),
      taxTotal: tax.toFixed(2),
      total: (subtotal + tax).toFixed(2),
      notes: null,
      lines: lines.map((line, index) => ({
        id: `${id}-l${index}`,
        productId: line.productId ?? null,
        description: line.description ?? "",
        quantity: line.quantity ?? "0",
        unit: (line.unit as "kg" | "g" | "unit") ?? "kg",
        unitCost: line.unitCost ?? "0",
        taxRate: line.taxRate ?? "0",
        lineSubtotal: (Number(line.quantity || 0) * Number(line.unitCost || 0)).toFixed(2),
        lineTax: "0.00",
        lineTotal: (Number(line.quantity || 0) * Number(line.unitCost || 0)).toFixed(2),
        position: index + 1,
      })),
    };
    createdPurchases.set(id, created);
    return json(created, 201);
  }
  const purchaseDetail = path.match(/^\/purchases\/([^/]+)$/);
  if (purchaseDetail) {
    const found =
      createdPurchases.get(purchaseDetail[1]!) ??
      purchases.find((x) => x.id === purchaseDetail[1]);
    return found ? json({ lines: [], ...found }) : json({ error: "not_found" }, 404);
  }
  const purchaseAction = path.match(/^\/purchases\/([^/]+)\/(confirm|cancel)$/);
  if (purchaseAction) {
    const found = createdPurchases.get(purchaseAction[1]!);
    if (found)
      found.status = purchaseAction[2] === "confirm" ? "confirmed" : "cancelled";
    return json(found ?? { error: "not_found" }, found ? 200 : 404);
  }
  if (path === "/purchase-documents" && method === "POST")
    return json(
      {
        id: "demo-doc-1",
        filename: "factura-gayca-demo.svg",
        mimeType: "image/svg+xml",
        byteSize: "1024",
        status: "needs_review",
        extractedData: gaycaExtraction,
      },
      201,
    );
  if (path.startsWith("/purchase-documents/"))
    return new Response(invoiceSvg, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml" },
    });
  if (path === "/recurring-expenses" && method === "GET") return json(recurring);
  if (path === "/recurring-expenses" && method === "POST")
    return json(recurring[0], 201);
  if (path === "/stock") return json(stock);
  if (path === "/stock/movements")
    return json(
      purchases.slice(-6).map((x, index) => ({
        id: `demo-mov-${index}`,
        productId: "demo-patata",
        productName: "Patata agria (saco 15 kg)",
        unit: "kg",
        occurredOn: x.issueDate,
        kind: "purchase",
        quantityDelta: "210",
        reference: x.supplierInvoiceNumber,
      })),
    );
  if (method === "GET") return json(page([]));
  return json({ demo: true }, 200);
}

export function installDemoApi() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!url.includes(`${DEMO_API_BASE}/`)) return original(input, init);
    const parsed = new URL(url, window.location.origin);
    const path = parsed.pathname.slice(
      parsed.pathname.indexOf(DEMO_API_BASE) + DEMO_API_BASE.length,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const body =
      typeof init?.body === "string"
        ? init.body
        : input instanceof Request
          ? await input.clone().text()
          : "";
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      return route(path, method, parsed.searchParams, body);
    } catch {
      return json({ error: "demo_error" }, 500);
    }
  };
}
