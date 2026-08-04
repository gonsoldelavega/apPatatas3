import PDFDocument from "pdfkit";
import type { Invoice } from "./types.js";
const decimal = (value: string, minimum = 0, maximum = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("es-ES", {
    minimumFractionDigits: minimum,
    maximumFractionDigits: maximum,
    useGrouping: false,
  });
};
const money = (value: string) => `${decimal(value, 2, 2)} EUR`;
const packaging = (line: Invoice["lines"][number]) => {
  if (!line.packageKind || !line.packageQuantity || !line.unitsPerPackage) return null;
  const names = { bag: ["bolsa","bolsas"], box: ["caja","cajas"], sack: ["saco","sacos"],
    tray: ["bandeja","bandejas"], custom: ["envase","envases"] } as const;
  const count = Number(line.packageQuantity);
  const noun = names[line.packageKind][Math.abs(count - 1) < 1e-9 ? 0 : 1];
  return line.packageLabel
    ? `${decimal(line.packageQuantity, 0, 2)} × ${line.packageLabel}`
    : `${decimal(line.packageQuantity, 0, 2)} ${noun} de ${decimal(line.unitsPerPackage, 0, 2)} ${line.unit}`;
};
const date = (v: string) => v.split("-").reverse().join("/");
const documentNumber = (series: string, number: number | null) => {
  const annual = series.match(/^(.+)_([0-9]{4})$/u);
  return annual ? `${annual[1]}-${number}/${annual[2]}` : `${series}-${number}`;
};
const address = (value: Record<string, string>) =>
  Object.values(value).filter(Boolean).join(", ");

const drawBrand = (doc: PDFKit.PDFDocument) => {
  const navy = "#111A33";
  const gold = "#D4A719";
  const sage = "#71816A";
  doc.save();
  doc
    .moveTo(77, 34)
    .lineTo(104, 49)
    .lineTo(104, 80)
    .lineTo(77, 95)
    .lineTo(50, 80)
    .lineTo(50, 49)
    .closePath()
    .lineWidth(1.8)
    .strokeColor(navy)
    .stroke();
  doc.path("M77 45 C70 50 70 56 77 61 C84 56 84 50 77 45 Z").fill(sage);
  doc.path("M62 51 C65 58 70 61 76 60 C74 53 69 50 62 51 Z").fill(sage);
  doc.path("M92 51 C89 58 84 61 78 60 C80 53 85 50 92 51 Z").fill(sage);
  doc
    .fillColor(navy)
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text("Gonsol", 55, 64, { width: 44, align: "center" })
    .font("Helvetica")
    .fontSize(4.8)
    .text("De la Vega", 55, 73, { width: 44, align: "center" });
  doc
    .moveTo(59, 83)
    .lineTo(95, 83)
    .moveTo(64, 87)
    .lineTo(90, 87)
    .lineWidth(2)
    .strokeColor(gold)
    .stroke();
  doc.restore();
  doc
    .fillColor(navy)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("Gonsol De la Vega", 118, 49, { width: 250 });
};
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
    drawBrand(doc);
    doc
      .moveTo(48, 105)
      .lineTo(547, 105)
      .lineWidth(1.2)
      .strokeColor("#111111")
      .stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .text("FACTURA", 390, 43, { align: "right", width: 157 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(documentNumber(invoice.series, invoice.number), 390, 70, {
        align: "right",
        width: 155,
      })
      .text(date(invoice.issueDate), 390, 84, { align: "right", width: 155 });
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("EMISOR", 48, 124)
      .font("Helvetica")
      .fontSize(10)
      .text(company.name, 48, 140)
      .fontSize(8)
      .text(company.taxId ?? "NIF pendiente", 48, 156)
      .text(address(company.address), 48, 169, { width: 220 });
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("CLIENTE", 305, 124)
      .font("Helvetica")
      .fontSize(10)
      .text(invoice.contactLegalName, 305, 140)
      .fontSize(8)
      .text(invoice.contactTaxId ?? "NIF pendiente", 305, 156)
      .text(address(invoice.contactAddress), 305, 169, { width: 242 });
    let y = 207;
    const facts = [
      invoice.operationStartDate && invoice.operationEndDate
        ? "Tipo: Factura quincenal"
        : "Tipo: Factura puntual",
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
      const factsHeight = Math.max(
        42,
        doc.font("Helvetica").fontSize(8).heightOfString(facts, { width: 483 }) + 18,
      );
      doc.rect(48, y, 499, factsHeight).fill("#F5F5F5");
      doc
        .fillColor("#111111")
        .font("Helvetica")
        .fontSize(8)
        .text(facts, 56, y + 9, { width: 483 });
      y += factsHeight + 12;
    }
    doc.rect(48, y, 499, 25).fill("#EEEEEE");
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("CONCEPTO", 56, y + 8)
      .text("ENTREGA", 224, y + 8)
      .text("CANT.", 288, y + 8)
      .text("PRECIO", 344, y + 8)
      .text("IVA", 418, y + 8)
      .text("TOTAL", 473, y + 8);
    y += 34;
    doc.fillColor("#111111").font("Helvetica");
    for (const line of invoice.lines) {
      if (y > 690) {
        doc.addPage();
        y = 60;
      }
      const packageText = packaging(line);
      const descriptionHeight = doc.heightOfString(line.description, { width: 158 });
      doc
        .fontSize(9)
        .text(line.description, 56, y, { width: 158 })
        .text(line.deliveryDate ? date(line.deliveryDate) : "-", 224, y, {
          width: 58,
        })
        .text(`${decimal(line.quantity, 0, 2)} ${line.unit}`, 288, y, { width: 51 })
        .text(money(line.unitPrice), 344, y, { width: 67, align: "right" })
        .text(`${decimal(line.taxRate, 0, 2)} %`, 418, y, {
          width: 34,
          align: "right",
        })
        .text(money(line.lineTotal), 458, y, { width: 89, align: "right" });
      if (packageText)
        doc
          .fontSize(7)
          .fillColor("#555555")
          .text(packageText, 56, y + descriptionHeight + 2, { width: 158 })
          .fillColor("#111111");
      y += Math.max(26, descriptionHeight + (packageText ? 12 : 4));
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
    if (invoice.paymentTerms) {
      const paymentHeight =
        doc.font("Helvetica").fontSize(8).heightOfString(invoice.paymentTerms, {
          width: 499,
        }) + 24;
      if (infoY + paymentHeight > 748) {
        doc.addPage();
        infoY = 60;
      }
      doc
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("CONDICIONES DE PAGO", 48, infoY, { width: 499 })
        .font("Helvetica")
        .text(invoice.paymentTerms, 48, infoY + 13, {
          width: 499,
        });
    }
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
