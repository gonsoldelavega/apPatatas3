import PDFDocument from "pdfkit";
import {
  address,
  date,
  decimal,
  documentNumber,
  drawBrand,
  money,
} from "../invoices/pdf.js";
import type { DeliveryPdfData } from "./types.js";

export interface DeliveryPdfOptions {
  /** Muestra precio, IVA e importes. Sin precios sale solo la mercancía. */
  prices: boolean;
  /** Número de copias (una página por copia). */
  copies: number;
}

const unitText = (unit: string) =>
  ({ kg: "kg", g: "g", unit: "ud.", box: "cajas", custom: "" })[unit] ?? unit;

const copyLabel = (index: number) =>
  index === 0
    ? "ORIGINAL · CLIENTE"
    : index === 1
      ? "COPIA · ARCHIVO"
      : `COPIA ${index + 1}`;

export async function createDeliveryNotePdf(
  data: DeliveryPdfData,
  options: DeliveryPdfOptions,
): Promise<Buffer> {
  const { note, issuer, customer } = data;
  const number = documentNumber(note.series, note.number);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      compress: true,
      bufferPages: true,
      info: {
        Title: `Albarán ${number}`,
        Author: issuer.name,
        Creator: "FactuPapa Next",
        CreationDate: new Date(`${note.issueDate}T00:00:00Z`),
        ModDate: new Date(`${note.issueDate}T00:00:00Z`),
      },
    });
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // Columnas de la tabla según se impriman precios o no.
    const cols = options.prices
      ? { qty: 56, qtyW: 66, desc: 126, descW: 214 }
      : { qty: 56, qtyW: 96, desc: 160, descW: 380 };

    const header = (label: string) => {
      drawBrand(doc);
      doc
        .moveTo(48, 105)
        .lineTo(547, 105)
        .lineWidth(1.2)
        .strokeColor("#111111")
        .stroke();
      doc
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text("ALBARÁN", 390, 43, { align: "right", width: 157 });
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(number, 390, 70, { align: "right", width: 155 })
        .text(date(note.issueDate), 390, 84, { align: "right", width: 155 });
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor("#4D5E47")
        .text(label, 300, 95, { align: "right", width: 247 })
        .fillColor("#111111");
    };

    const tableHeader = (y: number) => {
      doc.rect(48, y, 499, 25).fill("#EEEEEE");
      doc.fillColor("#111111").font("Helvetica-Bold").fontSize(8);
      doc.text("CANT.", cols.qty, y + 8).text("DESCRIPCIÓN", cols.desc, y + 8);
      if (options.prices)
        doc
          .text("PRECIO", 344, y + 8, { width: 67, align: "right" })
          .text("IVA", 418, y + 8, { width: 34, align: "right" })
          .text("IMPORTE", 458, y + 8, { width: 89, align: "right" });
      return y + 34;
    };

    const copyRanges: { first: number; last: number }[] = [];
    for (let copy = 0; copy < options.copies; copy += 1) {
      if (copy > 0) doc.addPage();
      const first = doc.bufferedPageRange().count - 1;
      header(copyLabel(copy));

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("EMISOR", 48, 124)
        .font("Helvetica")
        .fontSize(10)
        .text(issuer.name, 48, 140, { width: 230 })
        .fontSize(8)
        .text(issuer.taxId ?? "NIF pendiente", 48, 156)
        .text(address(issuer.address), 48, 169, { width: 220 });
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("ENTREGAR A", 305, 124)
        .font("Helvetica")
        .fontSize(10)
        .text(customer.name, 305, 140, { width: 242 })
        .fontSize(8)
        .text(customer.taxId ?? "NIF pendiente", 305, 156)
        .text(address(customer.address), 305, 169, { width: 242 });

      let y = 207;
      if (note.notes) {
        const notesHeight = Math.max(
          36,
          doc.font("Helvetica").fontSize(9).heightOfString(note.notes, { width: 483 }) + 26,
        );
        doc.rect(48, y, 499, notesHeight).fill("#F5F5F5");
        doc
          .fillColor("#111111")
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text("NOTAS DE ENTREGA", 56, y + 8)
          .font("Helvetica")
          .fontSize(9)
          .text(note.notes, 56, y + 20, { width: 483 });
        y += notesHeight + 12;
      }

      y = tableHeader(y);
      doc.fillColor("#111111").font("Helvetica");
      for (const line of note.lines) {
        const descriptionHeight = doc
          .fontSize(10)
          .heightOfString(line.description, { width: cols.descW });
        if (y + Math.max(26, descriptionHeight + 4) > 700) {
          doc.addPage();
          header(copyLabel(copy));
          y = tableHeader(122);
          doc.fillColor("#111111").font("Helvetica");
        }
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .text(
            `${decimal(line.quantity, 0, 3)} ${unitText(line.unit)}`.trim(),
            cols.qty,
            y,
            { width: cols.qtyW },
          )
          .font("Helvetica")
          .text(line.description, cols.desc, y, { width: cols.descW });
        if (options.prices)
          doc
            .fontSize(9)
            .text(money(line.unitPrice), 344, y, { width: 67, align: "right" })
            .text(`${decimal(line.taxRate, 0, 2)} %`, 418, y, {
              width: 34,
              align: "right",
            })
            .font("Helvetica-Bold")
            .text(money(line.lineTotal), 458, y, { width: 89, align: "right" })
            .font("Helvetica");
        y += Math.max(26, descriptionHeight + 4);
        doc
          .moveTo(48, y - 7)
          .lineTo(547, y - 7)
          .lineWidth(0.6)
          .strokeColor("#D7D7D7")
          .stroke();
      }

      // Totales (solo con precios) y bloque de firma deben caber en la misma página.
      const totalsHeight = options.prices ? 96 : 0;
      if (y + 20 + totalsHeight + 100 > 740) {
        doc.addPage();
        header(copyLabel(copy));
        y = 122;
      }
      if (options.prices) {
        y += 14;
        doc
          .fillColor("#111111")
          .font("Helvetica")
          .fontSize(10)
          .text("Base imponible", 360, y, { width: 100 })
          .text(money(note.subtotal), 460, y, { width: 87, align: "right" })
          .text("Impuestos", 360, y + 20, { width: 100 })
          .text(money(note.taxTotal), 460, y + 20, { width: 87, align: "right" });
        doc
          .rect(350, y + 44, 197, 36)
          .lineWidth(1.2)
          .strokeColor("#111111")
          .stroke();
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .text("TOTAL", 362, y + 56)
          .text(money(note.total), 440, y + 56, { width: 95, align: "right" });
        y += 96;
      }

      // Recibí conforme: nombre, firma y fecha, fijo al pie de la página.
      const signY = Math.max(y + 16, 640);
      doc.lineWidth(0.8).strokeColor("#8C9686").fillColor("#34402F");
      const boxes: [string, number, number][] = [
        ["RECIBÍ CONFORME · NOMBRE Y DNI", 48, 196],
        ["FIRMA", 252, 196],
        ["FECHA", 456, 91],
      ];
      for (const [label, x, w] of boxes) {
        doc.roundedRect(x, signY, w, 76, 5).stroke();
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(label, x + 8, signY + 8, { width: w - 16 });
      }
      doc.fillColor("#555555");
      copyRanges.push({ first, last: doc.bufferedPageRange().count - 1 });
    }

    // Pie y numeración de páginas de cada copia, una vez conocido su total.
    for (const { first, last } of copyRanges) {
      for (let page = first; page <= last; page += 1) {
        doc.switchToPage(page);
        doc
          .fillColor("#555555")
          .font("Helvetica")
          .fontSize(8)
          .text(
            "Albarán de entrega: no es una factura. Se incluirá en la próxima factura del cliente.",
            48,
            770,
            { align: "left", width: 400, lineBreak: false },
          )
          .text(`Página ${page - first + 1} de ${last - first + 1}`, 450, 770, {
            align: "right",
            width: 97,
            lineBreak: false,
          });
      }
    }
    doc.end();
  });
}
