const BAG_KG = 2.5;

export function bagBreakdown(quantity: string, unit: string) {
  if (unit !== "kg" || !/^\d+(?:\.\d+)?$/.test(quantity)) return null;
  const kg = Number(quantity);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const bags = Math.floor((kg + 1e-9) / BAG_KG);
  const remainderKg = Math.round((kg - bags * BAG_KG) * 10_000) / 10_000;
  return { bags, remainderKg };
}

export function bagLabel(quantity: string, unit: string) {
  const value = bagBreakdown(quantity, unit);
  if (!value) return null;
  const bags = `${value.bags} ${value.bags === 1 ? "bolsa" : "bolsas"} de 2,5 kg`;
  return value.remainderKg > 0 ? `${bags} + ${value.remainderKg} kg` : bags;
}
