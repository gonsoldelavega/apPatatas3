import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { salesPreferencesApi } from "../api/services";
import type { SalesPreferences } from "../api/types";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { LoadingScreen } from "../ui/LoadingScreen";
import { SelectField } from "../ui/SelectField";
import { useToast } from "../ui/ToastProvider";
import { formatQuantity } from "../utils/format";

const defaults: SalesPreferences = {
  invoicePrefix: "FAC",
  invoiceStartNumber: 100,
  defaultTaxRate: "4",
  primarySalesFlow: "invoices",
};

export function SalesSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const preferences = useQuery({ queryKey: ["sales-preferences"], queryFn: salesPreferencesApi.get });
  const [form, setForm] = useState<SalesPreferences>(defaults);
  useEffect(() => { if (preferences.data) setForm({ ...preferences.data, defaultTaxRate: formatQuantity(preferences.data.defaultTaxRate) }); }, [preferences.data]);
  const save = useMutation({
    mutationFn: () => salesPreferencesApi.update(form),
    onSuccess: async (saved) => {
      setForm({ ...saved, defaultTaxRate: formatQuantity(saved.defaultTaxRate) });
      await queryClient.invalidateQueries({ queryKey: ["sales-preferences"] });
      toast.show("Ajustes de facturación guardados");
    },
  });
  if (preferences.isLoading) return <LoadingScreen label="Cargando ajustes" />;
  return (
    <div className="page form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/mas" aria-label="Volver"><ArrowLeft /></Link>
        <div><p className="eyebrow">Tu negocio</p><h1>Facturación</h1></div>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <section className="form-card">
          <h2>Numeración de facturas</h2>
          <p className="hint">Por ejemplo, FAC y 100 generan FAC-100/{new Date().getFullYear()}. Cada año empieza una serie nueva.</p>
          <div className="form-grid">
            <Field label="Prefijo" maxLength={12} value={form.invoicePrefix} onChange={(event) => setForm({ ...form, invoicePrefix: event.target.value.toUpperCase() })} required />
            <Field label="Primer número" type="number" min="1" step="1" value={String(form.invoiceStartNumber)} onChange={(event) => setForm({ ...form, invoiceStartNumber: Number(event.target.value) })} required />
          </div>
          <Field label="IVA por defecto (%)" inputMode="decimal" value={form.defaultTaxRate} onChange={(event) => setForm({ ...form, defaultTaxRate: event.target.value.replace(",", ".") })} required />
          <SelectField label="Flujo principal" value={form.primarySalesFlow} onChange={(event) => setForm({ ...form, primarySalesFlow: event.target.value as SalesPreferences["primarySalesFlow"] })}>
            <option value="invoices">Facturas directas</option>
            <option value="adaptive">Adaptar según mi uso</option>
            <option value="delivery_notes">Albaranes</option>
          </SelectField>
        </section>
        {save.isError && <div className="form-alert" role="alert">No se pudieron guardar los ajustes. Si la numeración ya comenzó, el primer número no puede cambiarse.</div>}
        <div className="sticky-submit"><Button type="submit" icon={<Save />} busy={save.isPending}>Guardar ajustes</Button></div>
      </form>
    </div>
  );
}
