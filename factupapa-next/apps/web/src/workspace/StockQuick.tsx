import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Refrigerator } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { potatoApi } from "../api/services";
import { Button } from "../ui/Button";
import { formatQuantity } from "../utils/format";

const toNumber = (value: string) => Number(value.replace(",", ".") || "NaN");

/**
 * Stock de patata y stock en nevera, para rellenar en cada tirada o cada compra.
 * - Stock: se cuenta lo que hay hoy (kilos).
 * - Nevera: se suma la tirada (bolsas o kg) o se fija el total de esa variedad.
 */
export function StockQuick() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["potato-overview"], queryFn: potatoApi.overview });
  const items = overview.data?.items ?? [];

  const [levelKg, setLevelKg] = useState("");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"bags" | "kg">("kg");
  const [mode, setMode] = useState<"add" | "set">("add");
  const [saved, setSaved] = useState<string | null>(null);

  const selected = items.find((item) => item.productId === productId) ?? items[0];
  const perBag = Number(selected?.unitsPerPackage ?? 0);
  const hasBags = perBag > 0;

  useEffect(() => {
    if (!productId && items[0]) setProductId(items[0].productId);
  }, [items, productId]);
  useEffect(() => {
    setUnit(hasBags ? "bags" : "kg");
  }, [hasBags, selected?.productId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["potato-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["stock"] }),
    ]);
  };
  const saveLevel = useMutation({
    mutationFn: () => potatoApi.setLevel(String(toNumber(levelKg))),
    onSuccess: async () => {
      setLevelKg("");
      setSaved("Stock guardado");
      await refresh();
    },
  });
  const saveFridge = useMutation({
    mutationFn: () => {
      const value = toNumber(amount);
      const kg = unit === "bags" ? value * perBag : value;
      return potatoApi.fridge({
        productId: selected!.productId,
        quantity: String(Math.round(kg * 10_000) / 10_000),
        mode,
      });
    },
    onSuccess: async () => {
      setAmount("");
      setSaved(mode === "add" ? "Tirada sumada a la nevera" : "Nevera guardada");
      await refresh();
    },
  });

  const levelValid = Number.isFinite(toNumber(levelKg)) && toNumber(levelKg) >= 0 && levelKg.trim() !== "";
  const fridgeValid = Boolean(selected) && Number.isFinite(toNumber(amount)) && toNumber(amount) >= 0 && amount.trim() !== "";
  const submit = (action: () => void, valid: boolean) => (event: FormEvent) => {
    event.preventDefault();
    setSaved(null);
    if (valid) action();
  };

  return (
    <section className="dashboard-section workspace-block stock-quick" aria-labelledby="dash-stock-title">
      <div className="dashboard-section__heading">
        <h2 id="dash-stock-title">
          <Package aria-hidden="true" /> Stock de patata
        </h2>
      </div>
      {overview.isLoading ? (
        <p className="form-hint">Cargando…</p>
      ) : overview.isError ? (
        <p className="form-hint">No se pudo cargar el stock.</p>
      ) : (
        <>
          <div className="stock-quick__figures">
            <div>
              <small>Stock</small>
              <strong>{formatQuantity(overview.data!.potatoKg)} kg</strong>
            </div>
            <div>
              <small>
                <Refrigerator aria-hidden="true" /> Stock nevera
              </small>
              <strong>{formatQuantity(overview.data!.fridgeKg)} kg</strong>
            </div>
          </div>

          <form className="stock-quick__form" onSubmit={submit(() => saveLevel.mutate(), levelValid)}>
            <label>
              <span>Stock de hoy (kg) · al comprar o recontar</span>
              <input inputMode="decimal" placeholder="kg que hay ahora" value={levelKg} onChange={(event) => setLevelKg(event.target.value)} />
            </label>
            <Button type="submit" busy={saveLevel.isPending} disabled={!levelValid}>
              Guardar stock
            </Button>
          </form>

          {items.length > 0 && (
            <form className="stock-quick__form" onSubmit={submit(() => saveFridge.mutate(), fridgeValid)}>
              <label>
                <span>Nevera · producto</span>
                <select value={selected?.productId ?? ""} onChange={(event) => setProductId(event.target.value)}>
                  {items.map((item) => (
                    <option key={item.productId} value={item.productId}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="stock-quick__segments" role="group" aria-label="Qué se hace">
                <button type="button" aria-pressed={mode === "add"} onClick={() => setMode("add")}>
                  + Tirada
                </button>
                <button type="button" aria-pressed={mode === "set"} onClick={() => setMode("set")}>
                  Poner total
                </button>
                {hasBags && (
                  <>
                    <button type="button" aria-pressed={unit === "bags"} onClick={() => setUnit("bags")}>
                      Bolsas
                    </button>
                    <button type="button" aria-pressed={unit === "kg"} onClick={() => setUnit("kg")}>
                      Kg
                    </button>
                  </>
                )}
              </div>
              <label>
                <span>
                  {mode === "add" ? "Cantidad de la tirada" : "Total en la nevera"} ({unit === "bags" ? "bolsas" : "kg"})
                  {selected?.fridgeQuantity != null && <> · ahora {formatQuantity(selected.fridgeQuantity)} kg</>}
                </span>
                <input inputMode="decimal" placeholder={unit === "bags" ? "Bolsas" : "Kg"} value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <Button type="submit" busy={saveFridge.isPending} disabled={!fridgeValid}>
                {mode === "add" ? "Sumar a la nevera" : "Guardar nevera"}
              </Button>
            </form>
          )}
          {saved && !saveLevel.isError && !saveFridge.isError && (
            <p className="action-feedback" role="status">
              {saved}
            </p>
          )}
          {(saveLevel.isError || saveFridge.isError) && (
            <p className="action-feedback action-feedback--error" role="alert">
              No se pudo guardar. Revisa el número.
            </p>
          )}
        </>
      )}
    </section>
  );
}
