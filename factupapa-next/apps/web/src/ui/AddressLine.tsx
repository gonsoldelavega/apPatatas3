import type { Address } from "../api/types";

export function AddressLine({ address }: { address: Address }) {
  const line = [
    address.street,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.province,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
  return line ? <span>{line}</span> : <span>Sin dirección</span>;
}
