import { RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { SalesFormPage } from "./SalesFormPage";

export function SalesFormRoute() {
  const { user } = useAuth();
  const { kind } = useParams();
  const invoice = kind === "factura";
  const draftKey = useMemo(
    () =>
      `factupapa:sales-draft:${user?.company.id ?? "unknown"}:${user?.id ?? "unknown"}:${invoice ? "invoice" : "delivery"}`,
    [invoice, user?.company.id, user?.id],
  );
  const [showDraftNotice, setShowDraftNotice] = useState(() =>
    Boolean(localStorage.getItem(draftKey)),
  );

  const discardDraft = () => {
    localStorage.removeItem(draftKey);
    window.location.reload();
  };

  return (
    <>
      {showDraftNotice && (
        <aside className="draft-restore-banner" role="status" aria-live="polite">
          <span className="draft-restore-banner__icon" aria-hidden="true">
            <RotateCcw />
          </span>
          <span className="draft-restore-banner__copy">
            <strong>Borrador recuperado</strong>
            <small>
              Se han restaurado los datos que dejaste sin terminar en este dispositivo.
            </small>
          </span>
          <span className="draft-restore-banner__actions">
            <button type="button" onClick={() => setShowDraftNotice(false)}>
              Continuar
            </button>
            <button type="button" className="draft-restore-banner__discard" onClick={discardDraft}>
              <Trash2 aria-hidden="true" />
              Descartar
            </button>
          </span>
        </aside>
      )}
      <SalesFormPage />
    </>
  );
}
