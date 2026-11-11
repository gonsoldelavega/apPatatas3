import { stockTotals } from "../utils/stock-totals";
import { FridgeRow } from "../stock/FridgeRow";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Factory, PackageCheck, Plus, RefreshCw } from "lucide-react";
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
    [productionOpen,setProductionOpen]=useState(false),
    [inputProductId,setInputProductId]=useState(""),
    [outputProductId,setOutputProductId]=useState(""),
    [inputQuantity,setInputQuantity]=useState(""),
    [outputQuantity,setOutputQuantity]=useState(""),
    [packageQuantity,setPackageQuantity]=useState(""),
    [productId, setProductId] = useState(""),
    [targetQuantity, setTargetQuantity] = useState(""),
    [sacks, setSacks] = useState(""),
    [looseKg, setLooseKg] = useState("");
  const productionRuns=useQuery({queryKey:["production-runs"],queryFn:financeApi.productionRuns});
  const selectStockProduct = (value: string, scrollToForm = false) => {
    const item = q.data?.find((stockItem) => stockItem.productId === value),
      quantity = Number(item?.quantity ?? 0);
    setProductId(value);
    setTargetQuantity(item?.quantity ?? "");
    setSacks(String(Math.floor(quantity / 15)));
    setLooseKg(String(Math.round((quantity % 15) * 10_000) / 10_000));
    setOpen(true);
    if (scrollToForm) {
      window.setTimeout(() => {
        document.getElementById("stock-adjustment-form")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
    }
  };
  const selected = q.data?.find((x) => x.productId === productId),
    target = selected?.unit === "kg"
      ? String(Number(sacks || 0) * 15 + Number((looseKg || "0").replace(",", ".")))
      : targetQuantity;
  const totals = stockTotals(q.data ?? []);
  const sharedItems = (q.data ?? []).filter((item) => item.sharedStock);
  const otherItems = (q.data ?? []).filter((item) => !item.sharedStock);
  // Patata en general: los mismos kilos para todas las variantes, contados una sola vez.
  const potatoKg = sharedItems.length ? Number(sharedItems[0]!.quantity) : 0;
  const fridgeKg = sharedItems.reduce((sum, item) => sum + Number(item.fridgeQuantity ?? 0), 0);
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
  const produce=useMutation({
    mutationFn:()=>financeApi.createProductionRun({
      inputProductId,outputProductId,occurredOn:todayLocal(),inputQuantity:inputQuantity.replace(",","."),outputQuantity:outputQuantity.replace(",","."),
      packageQuantity:packageQuantity ? packageQuantity.replace(",",".") : null,notes:null,
    }),
    onSuccess:async()=>{setProductionOpen(false);setInputQuantity("");setOutputQuantity("");setPackageQuantity("");
      await Promise.all([qc.invalidateQueries({queryKey:["stock"]}),qc.invalidateQueries({queryKey:["stock-movements"]}),qc.invalidateQueries({queryKey:["production-runs"]})]);}
  });
  return (
    <div className="page stock-page">
      <header className="page-heading">
        <p className="eyebrow">Inventario real</p>
        <h1>Stock</h1>
        <p>Compras confirmadas menos ventas y ajustes. Todas las variantes de patata o agria comparten los mismos kilos.</p>
      </header>
      <section className="metric-grid">
        <article>
          <span>Patata en general</span>
          <strong>{formatQuantity(String(potatoKg))} kg</strong>
          <small>
            {Math.floor(potatoKg / 15)} sacos completos +{" "}
            {formatQuantity(String(Math.round((potatoKg % 15) * 10_000) / 10_000))} kg · todas las variedades juntas
          </small>
        </article>
        <article>
          <span>Stock en nevera</span>
          <strong>{formatQuantity(String(fridgeKg))} kg</strong>
          <small>Ya hecho para entregar (incluido en la patata en general).</small>
        </article>
        <article>
          <span>Por preparar</span>
          <strong>{formatQuantity(String(Math.max(0, potatoKg - fridgeKg)))} kg</strong>
          <small>Patata en general menos lo que hay en la nevera.</small>
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
      <button className="compact-action stock-adjust-action" onClick={()=>setProductionOpen(!productionOpen)} aria-expanded={productionOpen}>
        <Factory /> Registrar producción
      </button>
      {productionOpen && (
        <section className="form-card production-form">
          <h2>Transformar materia prima</h2>
          <SelectField label="Producto de entrada" value={inputProductId} onChange={(e)=>setInputProductId(e.target.value)}>
            <option value="">Selecciona</option>{q.data?.map((x)=><option key={x.productId} value={x.productId}>{x.name} · {formatQuantity(x.quantity)} {x.unit}</option>)}
          </SelectField>
          <SelectField label="Producto terminado" value={outputProductId} onChange={(e)=>setOutputProductId(e.target.value)}>
            <option value="">Selecciona</option>{q.data?.map((x)=><option key={x.productId} value={x.productId}>{x.name}</option>)}
          </SelectField>
          <div className="form-grid">
            <Field label="Cantidad usada" inputMode="decimal" value={inputQuantity} onChange={(e)=>setInputQuantity(e.target.value)} />
            <Field label="Cantidad obtenida" inputMode="decimal" value={outputQuantity} onChange={(e)=>setOutputQuantity(e.target.value)} />
            <Field label="Envases preparados" inputMode="decimal" value={packageQuantity} onChange={(e)=>setPackageQuantity(e.target.value)} />
          </div>
          {inputQuantity && outputQuantity && <p className="production-summary">
            Merma registrada: <strong>{formatQuantity(String(Math.max(0,Number(inputQuantity.replace(",","."))-Number(outputQuantity.replace(",",".")))))} kg</strong>
          </p>}
          <Button busy={produce.isPending} disabled={!inputProductId||!outputProductId||inputProductId===outputProductId||!inputQuantity||!outputQuantity} onClick={()=>produce.mutate()}>
            Guardar producción
          </Button>
          {produce.isError && <p role="alert">No se pudo guardar. Comprueba el stock disponible y que la salida no supere la entrada.</p>}
        </section>
      )}
      {open && (
        <section className="form-card" id="stock-adjustment-form">
          <SelectField
            label="Producto"
            value={productId}
            onChange={(e) => selectStockProduct(e.target.value)}
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
        {sharedItems.length > 0 && (
          <article className="stock-card stock-card--potato">
            <PackageCheck />
            <h2>Patata (stock general)</h2>
            <strong>{formatQuantity(String(potatoKg))} kg</strong>
            <p>Todas las variedades salen de estos mismos kilos. En la nevera, por producto:</p>
            {sharedItems.map((item) => (
              <FridgeRow key={item.productId} item={item} />
            ))}
            <button
              type="button"
              className="stock-card__adjust"
              onClick={() => selectStockProduct(sharedItems[0]!.productId, true)}
            >
              <RefreshCw aria-hidden="true" />
              Ajustar stock de patata
            </button>
          </article>
        )}
        {otherItems.map((x) => (
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
            <button
              type="button"
              className="stock-card__adjust"
              onClick={() => selectStockProduct(x.productId, true)}
            >
              <RefreshCw aria-hidden="true" />
              Ajustar stock
            </button>
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
      {!!productionRuns.data?.length && (
        <section className="stock-history">
          <div className="section-heading"><div><p className="eyebrow">Elaboración</p><h2>Últimas producciones</h2></div></div>
          <div className="movement-list">{productionRuns.data.slice(0,10).map((run)=><article key={run.id}>
            <span className="movement-icon movement-icon--in"><Factory/></span>
            <span><strong>{run.inputProductName} → {run.outputProductName}</strong><small>{run.occurredOn} · merma {formatQuantity(run.lossQuantity)}</small></span>
            <strong>{formatQuantity(run.outputQuantity)}</strong>
          </article>)}</div>
        </section>
      )}
    </div>
  );
}
