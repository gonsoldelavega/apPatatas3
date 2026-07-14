import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { contactsApi } from "../api/services";
import type { ContactInput } from "../api/types";
import { contactSchema } from "../forms/schemas";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field } from "../ui/Field";
import { LoadingScreen } from "../ui/LoadingScreen";
import { SelectField } from "../ui/SelectField";
import { useToast } from "../ui/ToastProvider";

type Values = z.infer<typeof contactSchema>;
const blank: Values = { type: "customer", legalName: "", tradeName: "", taxId: "", email: "", phone: "", street: "", line2: "", postalCode: "", city: "", province: "", country: "ES", notes: "" };
const nullable = (value?: string) => value?.trim() || null;

function payload(values: Values): ContactInput {
  return {
    type: values.type,
    legalName: values.legalName.trim(),
    tradeName: nullable(values.tradeName),
    taxId: nullable(values.taxId),
    email: nullable(values.email),
    phone: nullable(values.phone),
    notes: nullable(values.notes),
    address: Object.fromEntries(Object.entries({ street: values.street, line2: values.line2, postalCode: values.postalCode, city: values.city, province: values.province, country: values.country }).filter(([, value]) => value?.trim()).map(([key, value]) => [key, value!.trim()]))
  };
}

export function ContactFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const contact = useQuery({ queryKey: ["contact", id], queryFn: () => contactsApi.get(id!), enabled: Boolean(id) });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(contactSchema), defaultValues: { ...blank, type: searchParams.get("tipo") === "supplier" ? "supplier" : "customer" } });
  useEffect(() => {
    if (!contact.data) return;
    reset({
      type: contact.data.type, legalName: contact.data.legalName, tradeName: contact.data.tradeName ?? "", taxId: contact.data.taxId ?? "", email: contact.data.email ?? "", phone: contact.data.phone ?? "",
      street: contact.data.address.street ?? "", line2: contact.data.address.line2 ?? "", postalCode: contact.data.address.postalCode ?? "", city: contact.data.address.city ?? "", province: contact.data.address.province ?? "", country: contact.data.address.country ?? "ES", notes: contact.data.notes ?? ""
    });
  }, [contact.data, reset]);
  const save = useMutation({
    mutationFn: (values: Values) => id ? contactsApi.update(id, payload(values)) : contactsApi.create(payload(values)),
    onSuccess: async (saved) => { await queryClient.invalidateQueries({ queryKey: ["contacts"] }); toast.show(id ? "Contacto actualizado" : "Contacto creado"); navigate(`/contactos/${saved.id}`, { replace: true }); }
  });
  if (id && contact.isLoading) return <LoadingScreen label="Cargando contacto" />;
  if (id && contact.isError) return <div className="page"><EmptyState title="Contacto no disponible" description="No existe o no pertenece a tu empresa." action={<Link to="/catalogo/contactos">Volver al catálogo</Link>} /></div>;
  return (
    <div className="page form-page">
      <header className="form-page__header"><Link to={id ? `/contactos/${id}` : "/catalogo/contactos"} className="icon-button" aria-label="Volver"><ArrowLeft /></Link><div><p className="eyebrow">{id ? "Editar" : "Alta"}</p><h1>{id ? "Editar contacto" : "Nuevo contacto"}</h1></div></header>
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <section className="form-card"><h2>Identidad</h2><SelectField label="Tipo" error={errors.type?.message} {...register("type")}><option value="customer">Cliente</option><option value="supplier">Proveedor</option><option value="both">Cliente y proveedor</option></SelectField><Field label="Nombre fiscal" maxLength={200} error={errors.legalName?.message} {...register("legalName")} /><Field label="Nombre comercial (opcional)" maxLength={200} error={errors.tradeName?.message} {...register("tradeName")} /><Field label="NIF (opcional)" autoCapitalize="characters" maxLength={32} error={errors.taxId?.message} {...register("taxId")} /></section>
        <section className="form-card"><h2>Contacto</h2><Field label="Email (opcional)" type="email" inputMode="email" maxLength={320} error={errors.email?.message} {...register("email")} /><Field label="Teléfono (opcional)" type="tel" inputMode="tel" maxLength={32} error={errors.phone?.message} {...register("phone")} /></section>
        <section className="form-card"><h2>Dirección</h2><Field label="Calle" maxLength={200} {...register("street")} /><Field label="Línea adicional" maxLength={200} {...register("line2")} /><div className="form-grid"><Field label="Código postal" maxLength={20} {...register("postalCode")} /><Field label="Ciudad" maxLength={200} {...register("city")} /></div><div className="form-grid"><Field label="Provincia" maxLength={200} {...register("province")} /><Field label="País" maxLength={2} autoCapitalize="characters" {...register("country")} /></div></section>
        <section className="form-card"><label className="field"><span className="field__label">Notas (opcional)</span><span className="field__control"><textarea rows={4} maxLength={4000} {...register("notes")} /></span></label></section>
        {save.isError && <div className="form-alert" role="alert">No se ha podido guardar. Revisa los datos o posibles duplicados.</div>}
        <div className="sticky-submit"><Button type="submit" icon={<Save />} busy={save.isPending}>Guardar contacto</Button></div>
      </form>
    </div>
  );
}
