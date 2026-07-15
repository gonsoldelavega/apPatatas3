import PDFDocument from "pdfkit";
import type { Invoice } from "./types.js";
const money = (v: string) => `${v.replace(".", ",")} EUR`;
const date = (v: string) => v.split("-").reverse().join("/");
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
        Title: `Factura ${invoice.series}-${invoice.number}`,
        Author: company.name,
        Creator: "FactuPapa Next",
        CreationDate: new Date(`${invoice.issueDate}T00:00:00Z`),
        ModDate: new Date(`${invoice.issueDate}T00:00:00Z`),
      },
    });
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.rect(0, 0, 595, 105).fill("#14213D");
    doc.fillColor("#D6A649").fontSize(22).text("FactuPapa Next", 48, 38);
    doc
      .fillColor("#FFFFFF")
      .fontSize(10)
      .text("DOCUMENTO FICTICIO DE VALIDACION", 48, 70);
    doc
      .fillColor("#14213D")
      .fontSize(24)
      .text("FACTURA", 390, 132, { align: "right", width: 155 });
    doc
      .fontSize(11)
      .text(
        `${invoice.series}-${String(invoice.number).padStart(6, "0")}`,
        390,
        164,
        { align: "right", width: 155 },
      )
      .text(date(invoice.issueDate), 390, 182, { align: "right", width: 155 });
    doc
      .fontSize(10)
      .text("EMISOR", 48, 132)
      .fontSize(12)
      .text(company.name, 48, 150)
      .fontSize(9)
      .text(company.taxId ?? "Sin NIF configurado", 48, 168)
      .text(
        Object.values(company.address).filter(Boolean).join(", "),
        48,
        184,
        {
          width: 300,
        },
      );
    doc
      .fontSize(10)
      .text("CLIENTE", 48, 212)
      .fontSize(12)
      .text(invoice.contactLegalName, 48, 230)
      .fontSize(9)
      .text(invoice.contactTaxId ?? "Sin NIF", 48, 248)
      .text(
        Object.values(invoice.contactAddress).filter(Boolean).join(", "),
        48,
        264,
        { width: 490 },
      );
    let y = 310;
    doc.rect(48, y, 499, 25).fill("#14213D");
    doc
      .fillColor("#FFFFFF")
      .fontSize(9)
      .text("CONCEPTO", 56, y + 8)
      .text("CANT.", 300, y + 8)
      .text("PRECIO", 370, y + 8)
      .text("TOTAL", 472, y + 8);
    y += 34;
    doc.fillColor("#14213D");
    for (const line of invoice.lines) {
      if (y > 690) {
        doc.addPage();
        y = 60;
      }
      doc
        .fontSize(9)
        .text(line.description, 56, y, { width: 225 })
        .text(`${line.quantity} ${line.unit}`, 300, y, { width: 65 })
        .text(money(line.unitPrice), 370, y, { width: 80, align: "right" })
        .text(money(line.lineTotal), 462, y, { width: 85, align: "right" });
      y += 26;
      doc
        .moveTo(48, y - 7)
        .lineTo(547, y - 7)
        .strokeColor("#E3E0D7")
        .stroke();
    }
    y = Math.max(y + 20, 560);
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
    doc.rect(350, y + 48, 197, 38).fill("#14213D");
    doc
      .fillColor("#FFFFFF")
      .fontSize(13)
      .text("TOTAL", 362, y + 61)
      .text(money(invoice.total), 440, y + 61, { width: 95, align: "right" });
    if (invoice.notes)
      doc
        .fillColor("#14213D")
        .fontSize(9)
        .text(`Notas: ${invoice.notes}`, 48, y + 105, { width: 499 });
    doc
      .fillColor("#697184")
      .fontSize(8)
      .text(
        "Documento sin firma digital, QR fiscal, VeriFactu ni factura electronica.",
        48,
        770,
        { align: "center", width: 499 },
      );
    doc.end();
  });
}
