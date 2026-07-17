import PDFDocument from "pdfkit";
import type { Invoice } from "./types.js";
const decimal = (value: string, minimum = 0) => {
  const [integer, rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/u, "").padEnd(minimum, "0");
  return `${integer}${fraction ? `,${fraction}` : ""}`;
};
const money = (value: string) => `${decimal(value, 2)} EUR`;
const bags = (quantity: string, unit: string) => {
  if (unit !== "kg") return null;
  const kg = Number(quantity),
    count = Math.floor((kg + 1e-9) / 2.5),
    remainder = Math.round((kg - count * 2.5) * 10_000) / 10_000;
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const label = `${count} ${count === 1 ? "bolsa" : "bolsas"} de 2,5 kg`;
  return remainder > 0 ? `${label} + ${decimal(String(remainder))} kg` : label;
};
const date = (v: string) => v.split("-").reverse().join("/");
const documentNumber = (series: string, number: number | null) => {
  const annual = series.match(/^(.+)_([0-9]{4})$/u);
  return annual ? `${annual[1]}-${number}/${annual[2]}` : `${series}-${number}`;
};
const address = (value: Record<string, string>) =>
  Object.values(value).filter(Boolean).join(", ");
export async function createInvoicePdf(
  invoice: Invoice,
  company: {
    name: string;
    taxId: string | null;
    address: Record<string, string>;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      compress: true,
      info: {
        Title: `Factura ${documentNumber(invoice.series, invoice.number)}`,
        Author: company.name,
        Creator: "FactuPapa Next",
        CreationDate: new Date(`${invoice.issueDate}T00:00:00Z`),
        ModDate: new Date(`${invoice.issueDate}T00:00:00Z`),
      },
    });
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(company.name, 48, 45, { width: 330 });
    doc
      .moveTo(48, 86)
      .lineTo(547, 86)
      .lineWidth(1.2)
      .strokeColor("#111111")
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(company.taxId ?? "NIF pendiente de configurar", 48, 65, {
        width: 330,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .text("FACTURA", 390, 42, { align: "right", width: 157 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(documentNumber(invoice.series, invoice.number), 390, 66, {
        align: "right",
        width: 155,
      })
      .text(date(invoice.issueDate), 390, 79, { align: "right", width: 155 });
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("EMISOR", 48, 112)
      .font("Helvetica")
      .fontSize(10)
      .text(company.name, 48, 128)
      .fontSize(8)
      .text(company.taxId ?? "NIF pendiente", 48, 144)
      .text(address(company.address), 48, 157, { width: 220 });
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("CLIENTE", 305, 112)
      .font("Helvetica")
      .fontSize(10)
      .text(invoice.contactLegalName, 305, 128)
      .fontSize(8)
      .text(invoice.contactTaxId ?? "NIF pendiente", 305, 144)
      .text(address(invoice.contactAddress), 305, 157, { width: 242 });
    let y = 195;
    const facts = [
      invoice.operationStartDate
        ? `Periodo: ${date(invoice.operationStartDate)}${invoice.operationEndDate ? ` - ${date(invoice.operationEndDate)}` : ""}`
        : null,
      invoice.deliveryDates?.length
        ? `Entregas: ${invoice.deliveryDates.map(date).join(", ")}`
        : null,
      invoice.dueDate ? `Vencimiento: ${date(invoice.dueDate)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (facts) {
      doc.rect(48, y, 499, 42).fill("#F5F5F5");
      doc
        .fillColor("#111111")
        .font("Helvetica")
        .fontSize(8)
        .text(facts, 56, y + 9, { width: 483 });
      y += 54;
    }
    doc.rect(48, y, 499, 25).fill("#EEEEEE");
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("CONCEPTO", 56, y + 8)
      .text("CANT.", 275, y + 8)
      .text("PRECIO", 335, y + 8)
      .text("IVA", 420, y + 8)
      .text("TOTAL", 472, y + 8);
    y += 34;
    doc.fillColor("#111111").font("Helvetica");
    for (const line of invoice.lines) {
      if (y > 690) {
        doc.addPage();
        y = 60;
      }
      const packaging = bags(line.quantity, line.unit);
      doc
        .fontSize(9)
        .text(line.description, 56, y, { width: 200 })
        .text(`${decimal(line.quantity)} ${line.unit}`, 275, y, { width: 55 })
        .text(money(line.unitPrice), 335, y, { width: 70, align: "right" })
        .text(`${decimal(line.taxRate)} %`, 415, y, {
          width: 40,
          align: "right",
        })
        .text(money(line.lineTotal), 462, y, { width: 85, align: "right" });
      if (packaging)
        doc
          .fontSize(7)
          .fillColor("#555555")
          .text(packaging, 56, y + 12, { width: 200 })
          .fillColor("#111111");
      y += packaging ? 32 : 26;
      doc
        .moveTo(48, y - 7)
        .lineTo(547, y - 7)
        .strokeColor("#D7D7D7")
        .stroke();
    }
    y = Math.max(y + 20, 500);
    doc
      .fontSize(10)
      .text("Base imponible", 360, y, { width: 100 })
      .text(money(invoice.subtotal), 460, y, { width: 87, align: "right" });
    doc
      .text("Impuestos", 360, y + 22, { width: 100 })
      .text(money(invoice.taxTotal), 460, y + 22, {
        width: 87,
        align: "right",
      });
    doc
      .rect(350, y + 48, 197, 38)
      .lineWidth(1.2)
      .strokeColor("#111111")
      .stroke();
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text("TOTAL", 362, y + 61)
      .text(money(invoice.total), 440, y + 61, { width: 95, align: "right" });
    let infoY = y + 105;
    if (invoice.generalInformation) {
      doc
        .fillColor("#111111")
        .font("Helvetica")
        .fontSize(9)
        .text(invoice.generalInformation, 48, infoY, { width: 499 });
      infoY +=
        doc.heightOfString(invoice.generalInformation, { width: 499 }) + 12;
    }
    if (invoice.paymentTerms)
      doc
        .font("Helvetica-Bold")
        .text(`Condiciones de pago: ${invoice.paymentTerms}`, 48, infoY, {
          width: 499,
        });
    doc
      .fillColor("#555555")
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Factura generada por FactuPapa. Conserve este documento junto con sus registros contables.",
        48,
        770,
        { align: "center", width: 499 },
      );
    doc.end();
  });
}
