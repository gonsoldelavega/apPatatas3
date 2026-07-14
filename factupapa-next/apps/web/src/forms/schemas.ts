import { z } from "zod";

const optionalText = (maximum: number) => z.string().max(maximum).optional();
const decimal = z.string().regex(/^\d{1,10}(?:[.,]\d{1,4})?$/, "Usa un importe válido con hasta 4 decimales");

export const contactSchema = z.object({
  type: z.enum(["customer", "supplier", "both"]),
  legalName: z.string().trim().min(1, "El nombre fiscal es obligatorio").max(200),
  tradeName: optionalText(200),
  taxId: z.string().max(32).regex(/^[A-Za-z0-9 ./-]*$/, "NIF no válido").optional(),
  email: z.union([z.literal(""), z.email("Email no válido")]),
  phone: z.string().max(32).regex(/^[+0-9() .-]*$/, "Teléfono no válido"),
  street: optionalText(200),
  line2: optionalText(200),
  postalCode: optionalText(20),
  city: optionalText(200),
  province: optionalText(200),
  country: z.string().min(2).max(2),
  notes: optionalText(4000)
});

export const productSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  description: optionalText(4000),
  sku: optionalText(64),
  unit: z.enum(["kg", "g", "unit", "box", "custom"]),
  salePrice: decimal,
  estimatedCost: z.union([z.literal(""), decimal]),
  taxRate: z.string().regex(/^\d{1,3}(?:[.,]\d{1,3})?$/, "IVA no válido")
});

export const priceSchema = z.object({ price: decimal, validFrom: z.string().date(), isActive: z.boolean() });
