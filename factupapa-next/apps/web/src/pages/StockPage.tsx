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
    [quantity, setQuantity] = useState("");
  const adjust = useMutation({
    mutationFn: () =>
      financeApi.adjustStock({
        productId,
        occurredOn: todayLocal(),
        quantityDelta: quantity,
        reason: "correction",
        note: null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock"] }),
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
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Selecciona</option>
            {q.data?.map((x) => (
              <option value={x.productId} key={x.productId}>
                {x.name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Cantidad (+ entrada / − salida)"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Button onClick={() => adjust.mutate()}>Registrar</Button>
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
            <p>
              Valor: {x.stockValue ? formatMoney(x.stockValue) : "Sin coste"}
            </p>
            <p>Venta posible: {formatMoney(x.potentialRevenue)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
