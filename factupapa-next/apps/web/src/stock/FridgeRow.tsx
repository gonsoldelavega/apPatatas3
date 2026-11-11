import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Refrigerator } from "lucide-react";
import { useState } from "react";
import { financeApi } from "../api/services";
import type { StockItem } from "../api/types";
import { Button } from "../ui/Button";
import { formatQuantity } from "../utils/format";

/** Texto del stock en nevera: «12 bolsas · 30 kg» o «30 kg». */
export function fridgeLabel(item: Pick<StockItem, "fridgeQuantity" | "unitsPerPackage" | "packageLabel" | "unit">): string {
  const kg = Number(item.fridgeQuantity ?? 0);
  const per = Number(item.unitsPerPackage ?? 0);
  if (per > 0) {
    const bags = Math.round((kg / per) * 100) / 100;
    return `${formatQuantity(String(bags))} bolsas · ${formatQuantity(String(kg))} ${item.unit}`;
  }
  return `${formatQuantity(String(kg))} ${item.unit}`;
}

/** Una línea «En nevera» con su editor (bolsas o kg ya preparados para entregar). */
export function FridgeRow({ item }: { item: StockItem }) {
  const queryClient = useQueryClient();
  const per = Number(item.unitsPerPackage ?? 0);
  const hasBags = per > 0;
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"bags" | "kg">(hasBags ? "bags" : "kg");
  const [value, setValue] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const amount = Number(value.replace(",", ".") || "0");
      const kg = mode === "bags" ? amount * per : amount;
      return financeApi.setFridgeStock({ productId: item.productId, quantity: String(Math.round(kg * 10_000) / 10_000) });
    },
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });
  const valid = value.trim() !== "" && Number(value.replace(",", ".")) >= 0;
  const counted = item.fridgeQuantity != null;

  return (
    <div className="fridge-row">
      <div className="fridge-row__line">
        <Refrigerator aria-hidden="true" />
        <span>
          <small>{item.name}</small>
          <strong>{counted ? fridgeLabel(item) : "Sin contar"}</strong>
        </span>
        {!editing && (
          <button
            type="button"
            className="compact-action"
            onClick={() => {
              setValue(counted ? String(hasBags ? Math.round((Number(item.fridgeQuantity) / per) * 100) / 100 : Number(item.fridgeQuantity)) : "");
              setEditing(true);
            }}
          >
            {counted ? "Cambiar" : "Contar"}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="fridge-row__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) save.mutate();
          }}
        >
          {hasBags && (
            <div className="fridge-row__mode" role="group" aria-label="Unidad">
              <button type="button" aria-pressed={mode === "bags"} onClick={() => setMode("bags")}>
                Bolsas
              </button>
              <button type="button" aria-pressed={mode === "kg"} onClick={() => setMode("kg")}>
                Kg
              </button>
            </div>
          )}
          <input
            inputMode="decimal"
            aria-label={mode === "bags" ? "Bolsas en la nevera" : "Kilos en la nevera"}
            placeholder={mode === "bags" ? "Bolsas" : "Kg"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="submit" busy={save.isPending} disabled={!valid}>
            Guardar
          </Button>
          <button type="button" className="fridge-row__cancel" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </form>
      )}
      {save.isError && (
        <p className="action-feedback action-feedback--error" role="alert">
          No se pudo guardar el stock en nevera.
        </p>
      )}
    </div>
  );
}
