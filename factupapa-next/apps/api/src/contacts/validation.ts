import { HttpError } from "../http/errors.js";
import {
  assertAllowedKeys,
  listQuery,
  optionalAddress,
  optionalBoolean,
  optionalEmail,
  optionalPhone,
  optionalTaxId,
  optionalText,
  requiredText,
} from "../domain/validation.js";
import type {
  ContactCreate,
  ContactListQuery,
  ContactPatch,
  ContactType,
} from "./types.js";

const fields = [
  "type",
  "legalName",
  "tradeName",
  "taxId",
  "email",
  "phone",
  "address",
  "notes",
  "paymentTermsDays",
  "paymentTermsText",
  "defaultInvoiceInformation",
  "applyInvoiceDefaults",
  "isActive",
] as const;

function contactType(value: unknown): ContactType {
  if (value !== "customer" && value !== "supplier" && value !== "both")
    throw new HttpError("invalid_request", 400);
  return value;
}

export function validateContactCreate(
  body: Record<string, unknown>,
): ContactCreate {
  assertAllowedKeys(body, fields);
  return {
    type: contactType(body.type),
    legalName: requiredText(body.legalName, 200),
    ...optionalFields(body),
  };
}

export function validateContactPatch(
  body: Record<string, unknown>,
): ContactPatch {
  assertAllowedKeys(body, fields, true);
  const result: ContactPatch = optionalFields(body);
  if (body.type !== undefined) result.type = contactType(body.type);
  if (body.legalName !== undefined)
    result.legalName = requiredText(body.legalName, 200);
  const isActive = optionalBoolean(body.isActive);
  if (isActive !== undefined) result.isActive = isActive;
  return result;
}

function optionalFields(body: Record<string, unknown>): ContactPatch {
  const tradeName = optionalText(body.tradeName, 200);
  const taxId = optionalTaxId(body.taxId);
  const email = optionalEmail(body.email);
  const phone = optionalPhone(body.phone);
  const address = optionalAddress(body.address);
  const notes = optionalText(body.notes, 4000);
  const paymentTermsText = optionalText(body.paymentTermsText, 1000),
    defaultInvoiceInformation = optionalText(
      body.defaultInvoiceInformation,
      2000,
    ),
    applyInvoiceDefaults = optionalBoolean(body.applyInvoiceDefaults);
  if (
    body.paymentTermsDays !== undefined &&
    (!Number.isInteger(body.paymentTermsDays) ||
      Number(body.paymentTermsDays) < 0 ||
      Number(body.paymentTermsDays) > 365)
  )
    throw new HttpError("invalid_request", 400);
  return {
    ...(tradeName === undefined ? {} : { tradeName }),
    ...(taxId === undefined ? {} : { taxId }),
    ...(email === undefined ? {} : { email }),
    ...(phone === undefined ? {} : { phone }),
    ...(address === undefined ? {} : { address }),
    ...(notes === undefined ? {} : { notes }),
    ...(body.paymentTermsDays === undefined
      ? {}
      : { paymentTermsDays: Number(body.paymentTermsDays) }),
    ...(paymentTermsText === undefined ? {} : { paymentTermsText }),
    ...(defaultInvoiceInformation === undefined
      ? {}
      : { defaultInvoiceInformation }),
    ...(applyInvoiceDefaults === undefined ? {} : { applyInvoiceDefaults }),
  };
}

export function validateContactList(url: URL): ContactListQuery {
  const query: ContactListQuery = listQuery(url, [
    "name",
    "createdAt",
    "updatedAt",
  ]);
  const typeValue = url.searchParams.get("type");
  if (typeValue !== null) query.type = contactType(typeValue);
  return query;
}
