import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { pricingApi } from "../api/services";
import type { EffectiveProduct } from "../api/types";
import { priceSchema } from "../forms/schemas";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { useToast } from "../ui/ToastProvider";
import { formatMoney, formatQuantity, todayLocal } from "../utils/format";

type PriceValues = z.infer<typeof priceSchema>;

export function PriceDialog({ contactId, product, onClose }: { contactId: string; product: EffectiveProduct; onClose(): void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<PriceValues>({ resolver: zodResolver(priceSchema), defaultValues: { price: formatQuantity(product.specificPrice ?? product.salePrice), validFrom: todayLocal(), isActive: true } });
  const save = useMutation({ mutationFn: (values: PriceValues) => pricingApi.upsert(contactId, product.id, { ...values, price: values.price.replace(",", ".") }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["prices", contactId] }); toast.show("Precio específico guardado"); onClose(); } });
  const remove = useMutation({ mutationFn: () => pricingApi.deactivate(contactId, product.id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["prices", contactId] }); toast.show("Se aplicará el precio general"); onClose(); } });
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    closeButton.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [onClose]);
  return <div className="sheet-backdrop"><section className="action-sheet price-dialog" role="dialog" aria-modal="true" aria-labelledby="price-title"><header><div><p className="eyebrow">Precio específico</p><h2 id="price-title">{product.name}</h2></div><button ref={closeButton} className="icon-button" onClick={onClose} aria-label="Cerrar"><X /></button></header><p className="hint">Precio general: {formatMoney(product.salePrice)}</p><form onSubmit={handleSubmit((values) => save.mutate(values))}><Field label="Precio para este cliente" inputMode="decimal" error={errors.price?.message} {...register("price")} /><Field label="Vigente desde" type="date" error={errors.validFrom?.message} {...register("validFrom")} /><label className="check-field"><input type="checkbox" {...register("isActive")} /><span>Precio activo</span></label>{save.isError && <div className="form-alert" role="alert">No se ha podido guardar el precio.</div>}<Button type="submit" busy={save.isPending}>Guardar precio</Button>{product.specificPrice && <Button type="button" variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>Eliminar precio específico</Button>}</form></section></div>;
}
