import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, PackageCheck, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { financeApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { formatMoney, formatQuantity, todayLocal } from "../utils/format";
export function StockPage() {
  const qc = useQueryClient(),
    q = useQuery({ queryKey: ["stock"], queryFn: financeApi.stock }),
    [historyProductId, setHistoryProductId] = useState(""),
    movements = useQuery({
      queryKey: ["stock-movements", historyProductId],
      queryFn: () => financeApi.stockMovements(historyProductId || undefined),
    }),
    [open, setOpen] = useState(false),
    [productId, setProductId] = useState(""),
    [targetQuantity, setTargetQuantity] = useState(""),
    [sacks, setSacks] = useState(""),
    [looseKg, setLooseKg] = useState("");
  const selected = q.data?.find((x) => x.productId === productId),
    target = selected?.unit === "kg"
      ? String(Number(sacks || 0) * 15 + Number((looseKg || "0").replace(",", ".")))
      : targetQuantity;
  const totals = (q.data ?? []).reduce(
    (acc, item) => {
      if (item.unit === "kg") acc.kg += Number(item.quantity);
      acc.potentialRevenue += Number(item.potentialRevenue);
      if (item.stockValue) acc.stockValue += Number(item.stockValue);
      if (item.potentialGrossMargin) acc.margin += Number(item.potentialGrossMargin);
      return acc;
    },
    { kg: 0, stockValue: 0, potentialRevenue: 0, margin: 0 },
  );
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
    <div className="page stock-page">
      <header className="page-heading">
        <p className="eyebrow">Inventario real</p>
        <h1>Stock</h1>
        <p>Compras confirmadas menos ventas y ajustes.</p>
      </header>
      <section className="metric-grid">
        <article>
          <span>Patata disponible</span>
          <strong>{formatQuantity(String(totals.kg))} kg</strong>
          <small>
            {Math.floor(totals.kg / 15)} sacos completos +{" "}
            {formatQuantity(String(Math.round((totals.kg % 15) * 10_000) / 10_000))} kg
          </small>
        </article>
        <article>
          <span>Valor comprado</span>
          <strong>{formatMoney(String(totals.stockValue))}</strong>
          <small>Coste medio real de compras confirmadas.</small>
        </article>
        <article>
          <span>Si vendes todo</span>
          <strong>{formatMoney(String(totals.potentialRevenue))}</strong>
          <small>Con precios actuales de catálogo.</small>
        </article>
        <article>
          <span>Margen bruto posible</span>
          <strong>{formatMoney(String(totals.margin))}</strong>
          <small>Antes de autónomo, gestoría y otros gastos.</small>
        </article>
      </section>
      <button
        className="compact-action stock-adjust-action"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
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
      <section className="stock-history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Trazabilidad</p>
            <h2>Movimientos recientes</h2>
          </div>
        </div>
        <SelectField
          label="Filtrar por producto"
          value={historyProductId}
          onChange={(e) => setHistoryProductId(e.target.value)}
        >
          <option value="">Todos los productos</option>
          {q.data?.map((x) => (
            <option value={x.productId} key={x.productId}>{x.name}</option>
          ))}
        </SelectField>
        <div className="movement-list">
          {movements.data?.map((movement) => {
            const positive = Number(movement.quantityDelta) > 0;
            return (
              <article key={`${movement.kind}-${movement.id}`}>
                <span className={positive ? "movement-icon movement-icon--in" : "movement-icon movement-icon--out"}>
                  {movement.kind === "adjustment" ? <RefreshCw /> : positive ? <ArrowDownRight /> : <ArrowUpRight />}
                </span>
                <span>
                  <strong>{movement.productName}</strong>
                  <small>{movement.reference} · {movement.occurredOn}</small>
                </span>
                <strong className={positive ? "quantity-in" : "quantity-out"}>
                  {positive ? "+" : ""}{formatQuantity(movement.quantityDelta)} {movement.unit}
                </strong>
              </article>
            );
          })}
          {movements.data?.length === 0 && <p className="empty-copy">Todavía no hay movimientos.</p>}
        </div>
      </section>
    </div>
  );
}
