import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { productsApi, salesPreferencesApi } from "../api/services";
import type { ProductInput } from "../api/types";
import { productSchema } from "../forms/schemas";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { LoadingScreen } from "../ui/LoadingScreen";
import { SelectField } from "../ui/SelectField";
import { useToast } from "../ui/ToastProvider";
import { formatMoney, formatQuantity } from "../utils/format";

type Values = z.infer<typeof productSchema>;
const blank: Values = { name: "", description: "", sku: "", unit: "kg", salePrice: "", estimatedCost: "", taxRate: "4" };
const decimal = (value: string) => value.replace(",", ".");

export function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const product = useQuery({ queryKey: ["product", id], queryFn: () => productsApi.get(id!), enabled: Boolean(id) });
  const preferences = useQuery({ queryKey: ["sales-preferences"], queryFn: salesPreferencesApi.get, enabled: !id });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, dirtyFields } } = useForm<Values>({ resolver: zodResolver(productSchema), defaultValues: blank });
  useEffect(() => { if (product.data) reset({ name: product.data.name, description: product.data.description ?? "", sku: product.data.sku ?? "", unit: product.data.unit, salePrice: formatQuantity(product.data.salePrice), estimatedCost: product.data.estimatedCost ? formatQuantity(product.data.estimatedCost) : "", taxRate: formatQuantity(product.data.taxRate) }); }, [product.data, reset]);
  useEffect(() => { if (!id && preferences.data && !dirtyFields.taxRate) setValue("taxRate", formatQuantity(preferences.data.defaultTaxRate)); }, [dirtyFields.taxRate, id, preferences.data, setValue]);
  const save = useMutation({ mutationFn: (values: Values) => {
    const input: ProductInput = { name: values.name.trim(), description: values.description?.trim() || null, sku: values.sku?.trim() || null, unit: values.unit, salePrice: decimal(values.salePrice), estimatedCost: values.estimatedCost ? decimal(values.estimatedCost) : null, taxRate: decimal(values.taxRate) };
    return id ? productsApi.update(id, input) : productsApi.create(input);
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["products"] }); toast.show(id ? "Producto actualizado" : "Producto creado"); navigate("/catalogo/productos", { replace: true }); } });
  const deactivate = useMutation({ mutationFn: () => productsApi.deactivate(id!), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["products"] }); toast.show("Producto dado de baja"); navigate("/catalogo/productos", { replace: true }); } });
  if (id && product.isLoading) return <LoadingScreen label="Cargando producto" />;
  if (id && product.isError) return <div className="page"><EmptyState title="Producto no disponible" description="No existe o no pertenece a tu empresa." action={<Link to="/catalogo/productos">Volver al catálogo</Link>} /></div>;
  const estimatedMargin = product.data?.margin;
  return (
    <div className="page form-page"><header className="form-page__header"><Link to="/catalogo/productos" className="icon-button" aria-label="Volver"><ArrowLeft /></Link><div><p className="eyebrow">{id ? "Editar" : "Alta"}</p><h1>{id ? "Editar producto" : "Nuevo producto"}</h1></div></header>
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <section className="form-card"><h2>Producto</h2><Field label="Nombre" maxLength={200} error={errors.name?.message} {...register("name")} /><Field label="SKU (opcional)" maxLength={64} error={errors.sku?.message} {...register("sku")} /><label className="field"><span className="field__label">Descripción (opcional)</span><span className="field__control"><textarea rows={3} maxLength={4000} {...register("description")} /></span></label><SelectField label="Unidad" error={errors.unit?.message} {...register("unit")}><option value="kg">Kilogramo</option><option value="g">Gramo</option><option value="unit">Unidad</option><option value="box">Caja</option><option value="custom">Personalizada</option></SelectField></section>
        <section className="form-card"><h2>Precio e impuestos</h2><div className="form-grid"><Field label="Precio de venta" inputMode="decimal" placeholder="0,00" error={errors.salePrice?.message} {...register("salePrice")} /><Field label="Coste estimado" inputMode="decimal" placeholder="Opcional" error={errors.estimatedCost?.message} {...register("estimatedCost")} /></div><Field label="IVA (%)" inputMode="decimal" error={errors.taxRate?.message} {...register("taxRate")} />{estimatedMargin && <div className="margin-note"><span>Margen actual</span><strong>{formatMoney(estimatedMargin.amount)} · {estimatedMargin.percentage}%</strong><small>Se calcula en la respuesta; nunca se almacena.</small></div>} {!id && watch("salePrice") && <p className="hint">Los importes se envían como texto decimal para conservar la precisión.</p>}</section>
        {save.isError && <div className="form-alert" role="alert">No se ha podido guardar. Revisa los datos o el SKU duplicado.</div>}
        {id && product.data?.isActive && <Button type="button" variant="danger" icon={<Trash2 />} busy={deactivate.isPending} onClick={() => { if (window.confirm("¿Dar de baja este producto? Seguirá en el historial.")) deactivate.mutate(); }}>Dar de baja</Button>}
        <div className="sticky-submit"><Button type="submit" icon={<Save />} busy={save.isPending}>Guardar producto</Button></div>
      </form>
    </div>
  );
}
