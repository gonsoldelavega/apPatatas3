import { useCallback, useState } from "react";

const KEY = "factupapa.pdf.bags";

/** ¿Se imprime en albaranes y facturas el desglose de bolsas (p. ej. «13 bolsas de 2,5 kg + 1 de 2 kg»)? */
export function bagDetailEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setBagDetailEnabled(value: boolean): void {
  try {
    if (value) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: se queda solo en esta pantalla */
  }
}

export function useBagDetail(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(bagDetailEnabled);
  const update = useCallback((next: boolean) => {
    setBagDetailEnabled(next);
    setValue(next);
  }, []);
  return [value, update];
}
