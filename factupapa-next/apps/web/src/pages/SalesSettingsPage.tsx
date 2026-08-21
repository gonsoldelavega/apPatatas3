import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { salesPreferencesApi } from "../api/services";
import type { SalesPreferences } from "../api/types";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { LoadingScreen } from "../ui/LoadingScreen";
import { useToast } from "../ui/ToastProvider";
import { formatQuantity } from "../utils/format";

const defaults: SalesPreferences = {
  invoicePrefix: "FAC",
  invoiceStartNumber: 100,
  defaultTaxRate: "4",
  primarySalesFlow: "invoices",
  numberingMode: "test",
  numberingActivatedAt: null,
};

export function SalesSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const preferences = useQuery({
    queryKey: ["sales-preferences"],
    queryFn: salesPreferencesApi.get,
  });
  const [form, setForm] = useState<SalesPreferences>(defaults);
  const [nextNumber, setNextNumber] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!preferences.data) return;
    setForm({
      ...preferences.data,
      primarySalesFlow: "invoices",
      defaultTaxRate: formatQuantity(preferences.data.defaultTaxRate),
    });
  }, [preferences.data]);

  const save = useMutation({
    mutationFn: () =>
      salesPreferencesApi.update({ ...form, primarySalesFlow: "invoices" }),
    onSuccess: async (saved) => {
      setForm({
        ...saved,
        primarySalesFlow: "invoices",
        defaultTaxRate: formatQuantity(saved.defaultTaxRate),
      });
      await queryClient.invalidateQueries({ queryKey: ["sales-preferences"] });
      toast.show("Ajustes de facturación guardados");
    },
  });

  const activate = useMutation({
    mutationFn: () =>
      salesPreferencesApi.activateNumbering({
        prefix: form.invoicePrefix,
        nextNumber: Number(nextNumber),
        year: new Date().getFullYear(),
        confirmation,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-preferences"] });
      toast.show("Numeración real activada");
    },
  });

  if (preferences.isLoading) return <LoadingScreen label="Cargando ajustes" />;

  return (
    <div className="page form-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/mas" aria-label="Volver">
          <ArrowLeft />
        </Link>
        <div>
          <p className="eyebrow">Tu negocio</p>
          <h1>Facturación</h1>
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <section className="form-card">
          <h2>Numeración de facturas</h2>
          <p className="hint">
            Por ejemplo, FAC y 100 generan FAC-100/{new Date().getFullYear()}.
            Cada año empieza una serie nueva.
          </p>
          <div className="form-grid">
            <Field
              label="Prefijo"
              maxLength={12}
              value={form.invoicePrefix}
              onChange={(event) =>
                setForm({
                  ...form,
                  invoicePrefix: event.target.value.toUpperCase(),
                })
              }
              required
            />
            <Field
              label="Primer número de pruebas"
              type="number"
              min="1"
              step="1"
              value={String(form.invoiceStartNumber)}
              onChange={(event) =>
                setForm({
                  ...form,
                  invoiceStartNumber: Number(event.target.value),
                })
              }
              required
              disabled={form.numberingMode === "live"}
            />
          </div>
          <Field
            label="IVA por defecto (%)"
            inputMode="decimal"
            value={form.defaultTaxRate}
            onChange={(event) =>
              setForm({
                ...form,
                defaultTaxRate: event.target.value.replace(",", "."),
              })
            }
            required
          />
          <div className="automatic-number">
            <span>Flujo comercial</span>
            <strong>Facturas directas</strong>
            <small>
              Los albaranes solo se muestran cuando existe alguno pendiente de
              facturar.
            </small>
          </div>
        </section>

        <section className="form-card">
          <h2>Puesta en marcha definitiva</h2>
          {form.numberingMode === "live" ? (
            <p>Numeración real activa.</p>
          ) : (
            <>
              <p>Elige directamente el número de la primera factura definitiva.</p>
              <Field
                label="Siguiente número real"
                type="number"
                min="1"
                step="1"
                value={nextNumber}
                onChange={(event) => setNextNumber(event.target.value)}
              />
              {Number(nextNumber) > 0 && (
                <div className="automatic-number" aria-live="polite">
                  <span>La primera factura será</span>
                  <strong>
                    {form.invoicePrefix}-{Number(nextNumber)}/{new Date().getFullYear()}
                  </strong>
                  <small>Después de activarlo no podrá cambiarse ni reutilizarse.</small>
                </div>
              )}
              <Field
                label='Escribe "ACTIVAR NUMERACION REAL"'
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
              <Button
                type="button"
                variant="danger"
                disabled={
                  !Number.isInteger(Number(nextNumber)) ||
                  Number(nextNumber) < 1 ||
                  confirmation !== "ACTIVAR NUMERACION REAL"
                }
                busy={activate.isPending}
                onClick={() => activate.mutate()}
              >
                Activar numeración real
              </Button>
              {activate.isError && (
                <div className="form-alert" role="alert">
                  No se pudo activar la numeración real. Comprueba el último
                  número y vuelve a intentarlo.
                </div>
              )}
            </>
          )}
        </section>

        {save.isError && (
          <div className="form-alert" role="alert">
            No se pudieron guardar los ajustes. Si la numeración ya comenzó, el
            primer número no puede cambiarse.
          </div>
        )}
        <div className="sticky-submit">
          <Button type="submit" icon={<Save />} busy={save.isPending}>
            Guardar ajustes
          </Button>
        </div>
      </form>
    </div>
  );
}
