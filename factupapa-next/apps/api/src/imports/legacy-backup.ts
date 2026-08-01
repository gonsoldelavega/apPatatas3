import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { createDatabaseProbe } from "../database/client.js";

type UnknownRecord = Record<string, unknown>;

interface LegacyBackup {
  settings?: UnknownRecord;
  clients?: UnknownRecord[];
  suppliers?: UnknownRecord[];
  products?: UnknownRecord[];
  invoices?: UnknownRecord[];
  purchases?: UnknownRecord[];
}

interface ImportStats {
  clientsSource: number;
  suppliersSource: number;
  productsSource: number;
  invoicesSource: number;
  purchasesSource: number;
  invoicePaymentsSource: number;
  purchasePaymentsSource: number;
  suppliersDiscoveredInPurchases: number;
  contactsCreated: number;
  contactsReused: number;
  contactsSkipped: number;
  contactPhonesNormalized: number;
  productsCreated: number;
  productsReused: number;
  productsSkipped: number;
  invoicesCreated: number;
  invoicesReused: number;
  invoicesSkipped: number;
  paymentsCreated: number;
  purchaseInvoicesCreated: number;
  purchaseInvoicesReused: number;
  purchaseInvoicesSkipped: number;
  purchaseDraftsCreated: number;
  purchaseNumbersAdjusted: number;
  purchasePaymentsCreated: number;
}

const text = (value: unknown) => String(value ?? "").trim();
const nullableText = (value: unknown) => text(value) || null;
const normalizedTaxId = (value: unknown) =>
  text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalizedName = (value: unknown) =>
  text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const amount = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
const isoDate = (value: unknown) => {
  const candidate = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
};
const asRecords = (value: unknown): UnknownRecord[] =>
  Array.isArray(value)
    ? value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object")
    : [];

const contactKey = (record: UnknownRecord) => {
  const taxId = normalizedTaxId(record.taxId ?? record.nif);
  return taxId
    ? `tax:${taxId}`
    : `name:${normalizedName(record.name ?? record.legalName)}`;
};

function purchaseSupplierRecord(record: UnknownRecord): { key: string; record: UnknownRecord } | null {
  const name = text(record.supplierName ?? record.supplier);
  if (name.length < 2) return null;
  const taxId = nullableText(record.supplierNif);
  const supplier = {
    id: text(record.supplierId) || stableUuid("legacy-purchase-supplier", `${taxId ?? ""}:${name}`),
    name,
    taxId,
  };
  return { key: contactKey(supplier), record: supplier };
}

function extractLegacyBackup(value: unknown): LegacyBackup {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("El backup histórico no contiene un objeto JSON válido");
  const envelope = value as UnknownRecord;
  const candidate =
    envelope.state && typeof envelope.state === "object" && !Array.isArray(envelope.state)
      ? (envelope.state as UnknownRecord)
      : envelope;
  return candidate as LegacyBackup;
}

function stableUuid(namespace: string, legacyId: string): string {
  const hex = createHash("sha256").update(`${namespace}:${legacyId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function parseInvoiceNumber(value: unknown): { series: string; number: number } | null {
  const raw = text(value).toUpperCase();
  const match = raw.match(/^([A-Z0-9_-]+?)[-\s]?(\d+)(?:\/\d{4})?$/);
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { series: match[1] || "FAC", number };
}

function mapUnit(value: unknown): "kg" | "g" | "unit" | "box" | "custom" {
  const unit = normalizedName(value);
  if (unit === "kg" || unit.includes("kilo")) return "kg";
  if (unit === "g" || unit.includes("gram")) return "g";
  if (unit.includes("caja")) return "box";
  if (unit.includes("ud") || unit.includes("unidad") || unit.includes("bandeja")) return "unit";
  return "custom";
}

function addressFrom(record: UnknownRecord) {
  const address = nullableText(record.address);
  const postalCode = nullableText(record.cp);
  const city = nullableText(record.city);
  const province = nullableText(record.province);
  const country = nullableText(record.country) ?? "ES";
  return {
    ...(address ? { street: address } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(city ? { city } : {}),
    ...(province ? { province } : {}),
    ...(country ? { country } : {}),
  };
}

async function resolveOwner(client: PoolClient, email: string) {
  const result = await client.query<{ user_id: string; company_id: string }>(
    `select u.id user_id,m.company_id
       from users u join memberships m on m.user_id=u.id
      where lower(u.email)=lower($1) and m.role='owner'
      order by u.created_at asc,m.company_id asc limit 1`,
    [email],
  );
  const owner = result.rows[0];
  if (!owner) throw new Error("No existe una cuenta propietaria para IMPORT_USER_EMAIL");
  return owner;
}

async function importBackup(
  client: PoolClient,
  backup: LegacyBackup,
  owner: { user_id: string; company_id: string },
): Promise<ImportStats> {
  const explicitSuppliers = asRecords(backup.suppliers);
  const explicitSupplierKeys = new Set(explicitSuppliers.map(contactKey));
  const explicitSupplierLegacyIds = new Set(
    explicitSuppliers.map((supplier) => text(supplier.id)).filter(Boolean),
  );
  const purchaseSuppliersByKey = new Map<string, UnknownRecord>();
  for (const purchase of asRecords(backup.purchases)) {
    if (explicitSupplierLegacyIds.has(text(purchase.supplierId))) continue;
    const supplier = purchaseSupplierRecord(purchase);
    if (supplier && !purchaseSuppliersByKey.has(supplier.key))
      purchaseSuppliersByKey.set(supplier.key, supplier.record);
  }
  const stats: ImportStats = {
    clientsSource: asRecords(backup.clients).length,
    suppliersSource: asRecords(backup.suppliers).length,
    productsSource: asRecords(backup.products).length,
    invoicesSource: asRecords(backup.invoices).length,
    purchasesSource: asRecords(backup.purchases).length,
    invoicePaymentsSource: asRecords(backup.invoices).filter(
      (invoice) => amount(invoice.amountPaid) > 0,
    ).length,
    purchasePaymentsSource: asRecords(backup.purchases).filter(
      (purchase) => amount(purchase.amountPaid) > 0,
    ).length,
    suppliersDiscoveredInPurchases: [...purchaseSuppliersByKey.keys()].filter(
      (key) => !explicitSupplierKeys.has(key),
    ).length,
    contactsCreated: 0,
    contactsReused: 0,
    contactsSkipped: 0,
    contactPhonesNormalized: 0,
    productsCreated: 0,
    productsReused: 0,
    productsSkipped: 0,
    invoicesCreated: 0,
    invoicesReused: 0,
    invoicesSkipped: 0,
    paymentsCreated: 0,
    purchaseInvoicesCreated: 0,
    purchaseInvoicesReused: 0,
    purchaseInvoicesSkipped: 0,
    purchaseDraftsCreated: 0,
    purchaseNumbersAdjusted: 0,
    purchasePaymentsCreated: 0,
  };
  const settings = backup.settings ?? {};
  const companyName = nullableText(settings.companyName) ?? "Gonsol de la Vega";
  const companyTaxId = nullableText(settings.companyNif);
  const companyAddress = {
    ...(nullableText(settings.companyAddress) ? { street: text(settings.companyAddress) } : {}),
    country: "ES",
  };
  await client.query(
    `update companies set name=$2,tax_id=$3,address=$4::jsonb,updated_at=now() where id=$1`,
    [owner.company_id, companyName, companyTaxId, JSON.stringify(companyAddress)],
  );

  const contactByLegacyId = new Map<string, string>();
  const contactByKey = new Map<string, string>();
  const contactKinds = new Map<string, Set<string>>();
  const rawContacts = [
    ...asRecords(backup.clients).map((record) => ({ record, kind: "customer" as const })),
    ...asRecords(backup.suppliers).map((record) => ({ record, kind: "supplier" as const })),
    ...[...purchaseSuppliersByKey.values()].map((record) => ({
      record,
      kind: "supplier" as const,
    })),
  ];

  for (const { record, kind } of rawContacts) {
    const legacyId = text(record.id);
    const legalName = text(record.name ?? record.legalName);
    const taxId = normalizedTaxId(record.taxId ?? record.nif);
    if (!legacyId || legalName.length < 2 || /^sjgsfsjg$/i.test(legalName)) {
      stats.contactsSkipped += 1;
      continue;
    }
    const key = contactKey(record);
    let contactId = contactByKey.get(key);
    if (!contactId) {
      const existing = await client.query<{ id: string; kind: string }>(
        `select id,kind from contacts
          where company_id=$1 and is_active and
            (($2<>'' and regexp_replace(upper(coalesce(tax_id,'')),'[^A-Z0-9]','','g')=$2)
              or ($2='' and lower(regexp_replace(legal_name,'[^A-Za-z0-9]+',' ','g'))=lower($3)))
          order by created_at asc limit 1`,
        [owner.company_id, taxId, normalizedName(legalName)],
      );
      if (existing.rows[0]) {
        contactId = existing.rows[0].id;
        stats.contactsReused += 1;
      } else {
        const originalPhone = nullableText(record.phone);
        const importedPhone =
          originalPhone && originalPhone.length > 32
            ? originalPhone.replace(/\s+/g, "").slice(0, 32)
            : originalPhone;
        const contactNotes = [
          nullableText(record.notes),
          originalPhone && importedPhone !== originalPhone
            ? `Telefono original del backup: ${originalPhone}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000) || null;
        if (originalPhone && importedPhone !== originalPhone) stats.contactPhonesNormalized += 1;
        contactId = stableUuid("legacy-contact", key);
        stats.contactsCreated += 1;
        await client.query(
          `insert into contacts(
               id,company_id,kind,legal_name,tax_id,email,phone,address,notes,
               payment_terms_days,apply_invoice_defaults,invoice_period_mode)
             values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
             on conflict(id) do nothing`,
            [
              contactId,
              owner.company_id,
              kind,
              legalName,
              nullableText(record.taxId ?? record.nif),
              nullableText(record.email),
              importedPhone,
              JSON.stringify(addressFrom(record)),
              contactNotes,
              0,
              Boolean(record.paymentTermsDefault),
              record.paymentTermsDefault ? "fortnightly" : "manual",
            ],
        );
      }
      contactByKey.set(key, contactId);
    } else stats.contactsReused += 1;
    contactByLegacyId.set(legacyId, contactId);
    const kinds = contactKinds.get(contactId) ?? new Set<string>();
    kinds.add(kind);
    contactKinds.set(contactId, kinds);
  }
  for (const [contactId, kinds] of contactKinds) {
    if (kinds.size > 1)
      await client.query("update contacts set kind='both',updated_at=now() where id=$1", [contactId]);
  }

  const productByLegacyId = new Map<string, string>();
  const productUnitByLegacyId = new Map<string, unknown>();
  const productByName = new Map<string, string>();
  for (const record of asRecords(backup.products)) {
    const legacyId = text(record.id);
    const name = text(record.name);
    if (!legacyId || name.length < 2) {
      stats.productsSkipped += 1;
      continue;
    }
    const key = normalizedName(name);
    let productId = productByName.get(key);
    if (!productId) {
      const existing = await client.query<{ id: string }>(
        `select id from products where company_id=$1 and is_active and lower(btrim(name))=lower(btrim($2)) limit 1`,
        [owner.company_id, name],
      );
      if (existing.rows[0]) {
        productId = existing.rows[0].id;
        stats.productsReused += 1;
      } else {
        productId = stableUuid("legacy-product", key);
        stats.productsCreated += 1;
        await client.query(
          `insert into products(
               id,company_id,name,description,sku,unit,sale_price,estimated_cost,tax_rate,
               package_kind,expected_loss_rate)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,'none',0)
             on conflict(id) do nothing`,
            [
              productId,
              owner.company_id,
              name,
              nullableText(record.notes ?? record.observations),
              null,
              mapUnit(record.unit),
              money(amount(record.price)),
              record.cost === undefined || record.cost === null ? null : money(amount(record.cost)),
              money(amount(record.ivaPct ?? record.iva, 4)),
            ],
        );
      }
      productByName.set(key, productId);
    } else stats.productsReused += 1;
    productByLegacyId.set(legacyId, productId);
    productUnitByLegacyId.set(legacyId, record.unit);
  }

  const issuer = {
    legalName: companyName,
    taxId: companyTaxId,
    address: companyAddress,
  };
  const highestInvoiceNumberBySeries = new Map<string, number>();
  const invoices = asRecords(backup.invoices).sort((a, b) =>
    text(a.issueDate ?? a.date).localeCompare(text(b.issueDate ?? b.date)),
  );

  for (const record of invoices) {
    const legacyId = text(record.id);
    const parsedNumber = parseInvoiceNumber(record.number);
    const issueDate = isoDate(record.issueDate ?? record.date);
    const contactId = contactByLegacyId.get(text(record.clientId ?? record.contactId));
    const lines = asRecords(record.lines);
    if (!legacyId || !parsedNumber || !issueDate || !contactId || !lines.length) {
      stats.invoicesSkipped += 1;
      continue;
    }
    const invoiceId = stableUuid("legacy-invoice", legacyId);
    const exists = await client.query("select 1 from invoices where id=$1", [invoiceId]);
    if (exists.rowCount) {
      stats.invoicesReused += 1;
      continue;
    }
    const contact = (
      await client.query<{ legal_name: string; tax_id: string | null; address: unknown }>(
        "select legal_name,tax_id,address from contacts where id=$1 and company_id=$2",
        [contactId, owner.company_id],
      )
    ).rows[0];
    if (!contact) {
      stats.invoicesSkipped += 1;
      continue;
    }
    const normalizedLines = lines
      .map((line, index) => {
        const quantity = amount(line.quantity);
        const unitPrice = amount(line.price ?? line.unitPrice);
        const taxRate = amount(line.ivaPct ?? line.iva, 4);
        if (!(quantity > 0) || unitPrice < 0) return null;
        const subtotal = money(quantity * unitPrice);
        const tax = money(subtotal * taxRate / 100);
        return {
          id: stableUuid("legacy-invoice-line", `${legacyId}:${index}`),
          productId: productByLegacyId.get(text(line.productId)) ?? null,
          description: text(line.description) || "Producto",
          quantity,
          unit: mapUnit(line.unit ?? productUnitByLegacyId.get(text(line.productId))),
          unitPrice,
          taxRate,
          subtotal,
          tax,
          total: money(subtotal + tax),
          deliveryDate: isoDate(line.deliveryDate),
          position: index + 1,
        };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
    if (!normalizedLines.length) {
      stats.invoicesSkipped += 1;
      continue;
    }
    const subtotal = money(normalizedLines.reduce((sum, line) => sum + line.subtotal, 0));
    const taxTotal = money(normalizedLines.reduce((sum, line) => sum + line.tax, 0));
    const total = money(subtotal + taxTotal);
    const deliveryDates = [...new Set(normalizedLines.map((line) => line.deliveryDate).filter(Boolean))];
    highestInvoiceNumberBySeries.set(
      parsedNumber.series,
      Math.max(highestInvoiceNumberBySeries.get(parsedNumber.series) ?? 0, parsedNumber.number),
    );
    stats.invoicesCreated += 1;
    await client.query(
      `insert into invoices(
         id,company_id,contact_id,direction,series,number,issue_date,status,issued_at,
         subtotal,tax_total,total,notes,source,source_type,created_by_user_id,
         operation_start_date,operation_end_date,delivery_dates,
         contact_legal_name,contact_tax_id,contact_address,
         issuer_legal_name,issuer_tax_id,issuer_address)
       values($1,$2,$3,'sale',$4,null,$5,'draft',null,
         $6,$7,$8,$9,'legacy_backup','manual',$10,$11,$12,$13::date[],
         $14,$15,$16::jsonb,$17,$18,$19::jsonb)`,
      [
        invoiceId,
        owner.company_id,
        contactId,
        parsedNumber.series,
        issueDate,
        subtotal,
        taxTotal,
        total,
        nullableText(record.internalNote),
        owner.user_id,
        isoDate(record.periodStart),
        isoDate(record.periodEnd),
        deliveryDates,
        contact.legal_name,
        contact.tax_id,
        JSON.stringify(contact.address ?? {}),
        issuer.legalName,
        issuer.taxId,
        JSON.stringify(issuer.address),
      ],
    );
    for (const line of normalizedLines) {
      await client.query(
        `insert into invoice_lines(
           id,company_id,invoice_id,product_id,description,quantity,unit,unit_price,tax_rate,
           discount_rate,line_subtotal,line_tax,line_total,position)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13)`,
        [
          line.id,
          owner.company_id,
          invoiceId,
          line.productId,
          line.description,
          line.quantity,
          line.unit,
          line.unitPrice,
          line.taxRate,
          line.subtotal,
          line.tax,
          line.total,
          line.position,
        ],
      );
    }
    await client.query(
      "update invoices set number=$2,status='issued',issued_at=$3::date + time '12:00' where id=$1",
      [invoiceId, parsedNumber.number, issueDate],
    );
    const paidAmount = Math.min(Math.max(amount(record.amountPaid), 0), total);
    if (paidAmount > 0) {
      await client.query(
        `insert into payments(
           company_id,invoice_id,contact_id,direction,amount,paid_at,method,reference,created_by_user_id)
         values($1,$2,$3,'incoming',$4,$5::date + time '12:00',$6,'Importación backup',$7)`,
        [
          owner.company_id,
          invoiceId,
          contactId,
          money(paidAmount),
          isoDate(record.paidDate ?? record.paymentDate) ?? issueDate,
          nullableText(record.paymentMethod),
          owner.user_id,
        ],
      );
      stats.paymentsCreated += 1;
    }
  }

  for (const [series, highestInvoiceNumber] of highestInvoiceNumberBySeries) {
    if (highestInvoiceNumber > 0) {
      await client.query(
        `insert into document_sequences(company_id,document_type,series,next_number)
         values($1,'invoice',$2,$3)
         on conflict(company_id,document_type,series) do update
         set next_number=greatest(document_sequences.next_number,excluded.next_number)`,
        [owner.company_id, series, highestInvoiceNumber + 1],
      );
    }
  }

  for (const record of asRecords(backup.purchases).sort((a, b) =>
    text(a.issueDate ?? a.date).localeCompare(text(b.issueDate ?? b.date)),
  )) {
    const legacyId = text(record.id);
    const issueDate = isoDate(record.issueDate ?? record.date);
    const supplierIdentity = purchaseSupplierRecord(record);
    const supplierId =
      contactByLegacyId.get(text(record.supplierId)) ??
      (supplierIdentity ? contactByKey.get(supplierIdentity.key) : undefined);
    if (!legacyId || !issueDate || !supplierId) {
      stats.purchaseInvoicesSkipped += 1;
      continue;
    }
    const purchaseId = stableUuid("legacy-purchase", legacyId);
    const exists = await client.query("select 1 from purchase_invoices where id=$1", [purchaseId]);
    if (exists.rowCount) {
      stats.purchaseInvoicesReused += 1;
      continue;
    }

    const candidateLines = asRecords(record.lines).length
      ? asRecords(record.lines)
      : asRecords(record.items).length
        ? asRecords(record.items)
        : [record];
    const normalizedLines = candidateLines
      .map((line, index) => {
        const quantity = amount(line.quantity ?? record.quantity);
        const unitCost = amount(line.unitCost ?? line.price ?? record.unitCost);
        const taxRate = amount(line.ivaPct ?? line.iva ?? record.ivaPct ?? record.iva, 4);
        if (!(quantity > 0) || unitCost < 0 || taxRate < 0 || taxRate > 100) return null;
        const subtotal = money(quantity * unitCost);
        const tax = money(subtotal * taxRate / 100);
        return {
          id: stableUuid("legacy-purchase-line", `${legacyId}:${index}`),
          productId: productByLegacyId.get(text(line.productId ?? record.productId)) ?? null,
          description: text(line.description ?? record.description ?? record.concept) || "Compra",
          quantity,
          unit: mapUnit(
            line.unit ??
              record.unit ??
              productUnitByLegacyId.get(text(line.productId ?? record.productId)),
          ),
          unitCost,
          taxRate,
          subtotal,
          tax,
          total: money(subtotal + tax),
          position: index + 1,
        };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
    if (!normalizedLines.length) {
      stats.purchaseInvoicesSkipped += 1;
      continue;
    }

    const supplier = (
      await client.query<{ legal_name: string; tax_id: string | null; address: unknown }>(
        "select legal_name,tax_id,address from contacts where id=$1 and company_id=$2",
        [supplierId, owner.company_id],
      )
    ).rows[0];
    if (!supplier) {
      stats.purchaseInvoicesSkipped += 1;
      continue;
    }

    const subtotal = money(normalizedLines.reduce((sum, line) => sum + line.subtotal, 0));
    const taxTotal = money(normalizedLines.reduce((sum, line) => sum + line.tax, 0));
    const total = money(subtotal + taxTotal);
    const originalNumber = nullableText(record.invoiceNumber ?? record.number);
    let supplierInvoiceNumber = originalNumber;
    let numberAdjusted = false;
    if (supplierInvoiceNumber) {
      const duplicate = await client.query(
        `select 1 from purchase_invoices
          where company_id=$1 and supplier_id=$2 and status<>'cancelled'
            and lower(btrim(supplier_invoice_number))=lower(btrim($3)) limit 1`,
        [owner.company_id, supplierId, supplierInvoiceNumber],
      );
      if (duplicate.rowCount) {
        const suffix = createHash("sha256").update(legacyId).digest("hex").slice(0, 8);
        supplierInvoiceNumber = `${supplierInvoiceNumber.slice(0, 89)} #${suffix}`;
        numberAdjusted = true;
        stats.purchaseNumbersAdjusted += 1;
      }
    }
    const confirmed = Boolean(supplierInvoiceNumber);
    const notes = [
      nullableText(record.internalNote ?? record.notes),
      numberAdjusted && originalNumber ? `Número original del backup: ${originalNumber}` : null,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000) || null;

    await client.query(
      `insert into purchase_invoices(
         id,company_id,supplier_id,supplier_legal_name,supplier_tax_id,supplier_address,
         supplier_invoice_number,issue_date,status,category,notes,subtotal,tax_total,total,
         created_by_user_id,source_registry_key,source_registry_url,source_registry_filename)
       values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'draft','mercancia',$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        purchaseId,
        owner.company_id,
        supplierId,
        supplier.legal_name,
        supplier.tax_id,
        JSON.stringify(supplier.address ?? {}),
        supplierInvoiceNumber,
        issueDate,
        notes,
        subtotal,
        taxTotal,
        total,
        owner.user_id,
        `legacy-purchase:${legacyId}`.slice(0, 200),
        nullableText(record.driveLink),
        nullableText(record.sourceRegistryFileName),
      ],
    );
    for (const line of normalizedLines) {
      await client.query(
        `insert into purchase_invoice_lines(
           id,company_id,purchase_invoice_id,product_id,description,quantity,unit,unit_cost,
           tax_rate,line_subtotal,line_tax,line_total,position)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          line.id,
          owner.company_id,
          purchaseId,
          line.productId,
          line.description,
          line.quantity,
          line.unit,
          line.unitCost,
          line.taxRate,
          line.subtotal,
          line.tax,
          line.total,
          line.position,
        ],
      );
    }
    if (confirmed) {
      await client.query(
        "update purchase_invoices set status='confirmed',confirmed_at=$2::date + time '12:00' where id=$1",
        [purchaseId, issueDate],
      );
    } else stats.purchaseDraftsCreated += 1;
    stats.purchaseInvoicesCreated += 1;

    const paidAmount = confirmed
      ? Math.min(Math.max(amount(record.amountPaid), 0), total)
      : 0;
    if (paidAmount > 0) {
      await client.query(
        `insert into payments(
           company_id,purchase_invoice_id,contact_id,direction,amount,paid_at,method,
           reference,notes,created_by_user_id)
         values($1,$2,$3,'outgoing',$4,$5::date + time '12:00',$6,$7,$8,$9)`,
        [
          owner.company_id,
          purchaseId,
          supplierId,
          money(paidAmount),
          isoDate(record.paidDate ?? record.paymentDate) ?? issueDate,
          nullableText(record.paymentMethod),
          "Importación backup",
          nullableText(record.paymentNote),
          owner.user_id,
        ],
      );
      stats.purchasePaymentsCreated += 1;
    }
  }
  return stats;
}

async function main() {
  const databaseUrl = process.env.DATABASE_ADMIN_URL;
  const backupFile = process.env.LEGACY_BACKUP_FILE;
  const ownerEmail = process.env.IMPORT_USER_EMAIL;
  const apply = process.env.LEGACY_IMPORT_APPLY === "1";
  if (!databaseUrl || !backupFile || !ownerEmail)
    throw new Error("DATABASE_ADMIN_URL, LEGACY_BACKUP_FILE e IMPORT_USER_EMAIL son obligatorias");
  const backup = extractLegacyBackup(JSON.parse(await readFile(backupFile, "utf8")));
  const database = createDatabaseProbe(databaseUrl);
  const client = await database.pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [2_026_072_601]);
    const owner = await resolveOwner(client, ownerEmail);
    const stats = await importBackup(client, backup, owner);
    if (apply) await client.query("commit");
    else await client.query("rollback");
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...stats }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Importación fallida");
    process.exitCode = 1;
  });
