import { Building2, PackagePlus, Store, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function NewMenu({ open, onClose, onChoose }: { open: boolean; onClose(): void; onChoose(path: string): void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    closeButton.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="action-sheet" role="dialog" aria-modal="true" aria-labelledby="new-title">
        <header><div><p className="eyebrow">Alta rápida</p><h2 id="new-title">¿Qué quieres crear?</h2></div><button ref={closeButton} className="icon-button" onClick={onClose} aria-label="Cerrar"><X /></button></header>
        <button onClick={() => onChoose("/contactos/nuevo?tipo=customer")}><Building2 /><span><strong>Nuevo cliente</strong><small>Datos fiscales y de contacto</small></span></button>
        <button onClick={() => onChoose("/contactos/nuevo?tipo=supplier")}><Store /><span><strong>Nuevo proveedor</strong><small>También puede ser cliente</small></span></button>
        <button onClick={() => onChoose("/productos/nuevo")}><PackagePlus /><span><strong>Nuevo producto</strong><small>Precio, unidad e IVA</small></span></button>
      </section>
    </div>
  );
}
