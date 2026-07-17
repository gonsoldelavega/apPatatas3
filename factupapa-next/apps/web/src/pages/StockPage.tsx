import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Plus } from "lucide-react";
import { useState } from "react";
import { financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { formatMoney, formatQuantity, todayLocal } from "../utils/format";
export function StockPage() {
  const qc = useQueryClient(),
    q = useQuery({ queryKey: ["stock"], queryFn: financeApi.stock }),
    [open, setOpen] = useState(false),
    [productId, setProductId] = useState(""),
    [targetQuantity, setTargetQuantity] = useState(""),
    [sacks, setSacks] = useState(""),
    [looseKg, setLooseKg] = useState("");
  const selected = q.data?.find((x) => x.productId === productId),
    target = selected?.unit === "kg"
      ? String(Number(sacks || 0) * 15 + Number((looseKg || "0").replace(",", ".")))
      : targetQuantity;
  const adjust = useMutation({
    mutationFn: () =>
      financeApi.setStockLevel({
        productId,
        occurredOn: todayLocal(),
        targetQuantity: target,
        note: "Recuento físico: sacos completos y kilos sueltos",
      }),
    onSuccess: () => {
      setOpen(false);
      return qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
  return (
    <div className="page">
      <header className="page-heading">
        <p className="eyebrow">Inventario real</p>
        <h1>Stock</h1>
        <p>Compras confirmadas menos ventas y ajustes.</p>
      </header>
      <button className="compact-action" onClick={() => setOpen(!open)}>
        <Plus />
        Ajustar existencias
      </button>
      {open && (
        <section className="form-card">
          <SelectField
            label="Producto"
            value={productId}
            onChange={(e) => {
              const value = e.target.value,
                item = q.data?.find((x) => x.productId === value),
                quantity = Number(item?.quantity ?? 0);
              setProductId(value);
              setTargetQuantity(item?.quantity ?? "");
              setSacks(String(Math.floor(quantity / 15)));
              setLooseKg(String(Math.round((quantity % 15) * 10_000) / 10_000));
            }}
          >
            <option value="">Selecciona</option>
            {q.data?.map((x) => (
              <option value={x.productId} key={x.productId}>
                {x.name}
              </option>
            ))}
          </SelectField>
          {selected?.unit === "kg" ? (
            <>
              <Field
                label="Sacos completos (15 kg cada uno)"
                inputMode="decimal"
                value={sacks}
                onChange={(e) => setSacks(e.target.value)}
              />
              <Field
                label="Kilos sueltos"
                inputMode="decimal"
                value={looseKg}
                onChange={(e) => setLooseKg(e.target.value)}
              />
              <p>Stock real que quedará registrado: {formatQuantity(target)} kg</p>
            </>
          ) : (
            <Field
              label={`Cantidad real (${selected?.unit ?? "unidades"})`}
              value={targetQuantity}
              onChange={(e) => setTargetQuantity(e.target.value)}
            />
          )}
          {adjust.isError && <p role="alert">No se pudo guardar el recuento.</p>}
          <Button
            disabled={!productId || !target || Number(target) < 0}
            busy={adjust.isPending}
            onClick={() => adjust.mutate()}
          >
            Guardar stock real
          </Button>
        </section>
      )}
      <div className="stock-grid">
        {q.data?.map((x) => (
          <article className="stock-card" key={x.productId}>
            <PackageCheck />
            <h2>{x.name}</h2>
            <strong>
              {formatQuantity(x.quantity)} {x.unit}
            </strong>
            {x.unit === "kg" && (
              <p>
                {Math.floor(Number(x.quantity) / 15)} sacos completos +{" "}
                {formatQuantity(String(Number(x.quantity) % 15))} kg
              </p>
            )}
            <p>
              Valor: {x.stockValue ? formatMoney(x.stockValue) : "Sin coste"}
            </p>
            {x.averagePurchaseCost && (
              <p>Coste medio real: {formatMoney(x.averagePurchaseCost)} / {x.unit}</p>
            )}
            <p>Venta posible: {formatMoney(x.potentialRevenue)}</p>
            {x.potentialGrossMargin && (
              <p>Margen bruto posible: {formatMoney(x.potentialGrossMargin)}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
