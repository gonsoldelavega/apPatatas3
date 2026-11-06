import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";

interface CompanyProfile {
  name: string;
  taxId: string | null;
  email: string | null;
  website: string | null;
  address: Record<string, string>;
}

const companyApi = {
  get: () => apiClient.request<CompanyProfile>("/company/profile"),
  save: (input: {
    email: string | null;
    website: string | null;
    address: { street: string; postalCode: string; city: string };
  }) => apiClient.request<CompanyProfile>("/company/profile", { method: "PUT", body: JSON.stringify(input) }),
};

/** Datos del emisor que salen en las facturas y los albaranes. */
export function CompanyProfilePage() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["company-profile"], queryFn: companyApi.get });
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    const data = profile.data;
    if (!data) return;
    setEmail(data.email ?? "");
    setWebsite(data.website ?? "");
    setStreet(data.address.street ?? "");
    setPostalCode(data.address.postalCode ?? "");
    setCity(data.address.city ?? "");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      companyApi.save({
        email: email.trim() || null,
        website: website.trim() || null,
        address: { street: street.trim(), postalCode: postalCode.trim(), city: city.trim() },
      }),
    onSuccess: (saved) => queryClient.setQueryData(["company-profile"], saved),
  });

  const ready = Boolean(street.trim() && postalCode.trim() && city.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) save.mutate();
  };

  return (
    <div className="page workspace-page">
      <header className="page-heading">
        <div>
          <Link to="/mas" className="back-link">
            <ArrowLeft aria-hidden="true" /> Otros
          </Link>
          <h1>Datos de la empresa</h1>
          <p className="form-hint">
            Salen en el encabezado de las facturas y los albaranes nuevos. Las facturas ya emitidas conservan los
            datos con los que se emitieron.
          </p>
        </div>
      </header>

      {profile.isLoading ? (
        <p className="form-hint">Cargando…</p>
      ) : profile.isError ? (
        <div className="inline-error" role="alert">
          No se pudieron cargar los datos.
          <button type="button" onClick={() => void profile.refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <form className="detail-card workspace-form" onSubmit={submit}>
          <p className="form-hint">
            <strong>{profile.data?.name}</strong> · {profile.data?.taxId ?? "NIF pendiente"}
          </p>
          <Field label="Correo electrónico" type="email" inputMode="email" autoComplete="off" placeholder="contacto@tuempresa.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Field label="Página web" autoComplete="off" placeholder="tuempresa.com" value={website} onChange={(event) => setWebsite(event.target.value)} />
          <Field label="Calle" value={street} onChange={(event) => setStreet(event.target.value)} />
          <div className="workspace-form__row">
            <Field label="Código postal" inputMode="numeric" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} />
            <Field label="Población" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
          <Button type="submit" busy={save.isPending} disabled={!ready}>
            Guardar datos
          </Button>
          {save.isSuccess && (
            <p className="action-feedback" role="status">
              Datos guardados. Las facturas y albaranes nuevos ya salen con ellos.
            </p>
          )}
          {save.isError && (
            <p className="action-feedback action-feedback--error" role="alert">
              No se pudieron guardar. Revisa el correo y los demás campos.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
