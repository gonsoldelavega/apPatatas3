import { useBagDetail } from "../utils/pdf-preferences";

/** Opcional: imprime bajo cada línea de patata el desglose en bolsas. Se recuerda en este dispositivo. */
export function BagDetailToggle() {
  const [enabled, setEnabled] = useBagDetail();
  return (
    <label className="bag-detail-toggle">
      <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      <span>
        Mostrar el desglose de bolsas en el PDF
        <small>Por ejemplo: «13 bolsas de 2,5 kg + 1 de 2 kg». Sirve para explicar los 34,5 kg.</small>
      </span>
    </label>
  );
}
