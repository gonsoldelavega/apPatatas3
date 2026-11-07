import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { teamApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";

const errorMessages: Record<string, string> = {
  team_limit_reached: "Ya hay 3 socios activos. Da de baja a uno para añadir otro.",
  team_member_exists: "Ese correo ya está dado de alta como socio.",
  team_owner_protected: "Ese correo pertenece a un administrador y no puede ser socio.",
  invalid_request: "Escribe un correo de Google válido.",
  forbidden: "Solo el usuario maestro puede gestionar socios.",
};

export function TeamPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [welcome, setWelcome] = useState("");
  const members = useQuery({ queryKey: ["team-members"], queryFn: teamApi.list });
  const add = useMutation({
    mutationFn: () => teamApi.add(email.trim().toLowerCase(), welcome.trim()),
    onSuccess: async () => {
      setEmail("");
      setWelcome("");
      await queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
  const changeWelcome = useMutation({
    mutationFn: (input: { id: string; message: string }) => teamApi.setWelcome(input.id, input.message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => teamApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });

  const items = members.data?.items ?? [];
  const limit = members.data?.limit ?? 3;
  const full = items.length >= limit;
  const error = add.error ?? remove.error ?? changeWelcome.error;
  const errorText =
    error instanceof ApiError
      ? errorMessages[error.code] ?? "No se pudo completar la acción. Inténtalo de nuevo."
      : error
        ? "No se pudo completar la acción. Inténtalo de nuevo."
        : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || full) return;
    add.mutate();
  };

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <Link to="/mas" className="back-link">
            <ArrowLeft aria-hidden="true" /> Otros
          </Link>
          <h1>Socios</h1>
          <p className="form-hint">
            Solo pueden entrar con Google los correos que des de alta aquí. Los socios ven el
            resumen, las alertas y los pendientes, y pueden crear facturas y albaranes desde el
            1 de noviembre de 2026. Todo lo demás (precios, clientes, proveedores, compras,
            gastos y ajustes) es solo tuyo.
          </p>
        </div>
      </header>

      <section className="detail-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Acceso autorizado</p>
            <h2>
              {items.length} de {limit} socios
            </h2>
          </div>
        </div>

        <form onSubmit={submit} className="form-grid">
          <Field
            label="Correo de Google del socio"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nombre@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={full}
          />
          <Field
            label="Mensaje de bienvenida (opcional)"
            placeholder="¡Bienvenida, Irene!"
            maxLength={80}
            autoComplete="off"
            value={welcome}
            onChange={(event) => setWelcome(event.target.value)}
            disabled={full}
          />
          <Button
            type="submit"
            icon={<UserPlus />}
            busy={add.isPending}
            disabled={full || !email.trim()}
          >
            Dar de alta
          </Button>
        </form>
        {full && (
          <p className="form-hint">Has llegado al máximo de socios. Da de baja a uno para añadir otro.</p>
        )}
        {errorText && (
          <p className="action-feedback action-feedback--error" role="alert">
            {errorText}
          </p>
        )}

        {members.isLoading ? (
          <p className="form-hint">Cargando…</p>
        ) : members.isError ? (
          <p className="action-feedback action-feedback--error" role="alert">
            No se pudo cargar la lista de socios.
          </p>
        ) : items.length === 0 ? (
          <p className="form-hint">Todavía no has dado de alta a ningún socio.</p>
        ) : (
          <ul className="team-list" aria-label="Socios autorizados">
            {items.map((member) => (
              <li key={member.id} className="team-list__item">
                <span>
                  <strong>{member.email}</strong>
                  <small>
                    {member.registered
                      ? member.lastLoginAt
                        ? `Último acceso: ${new Date(member.lastLoginAt).toLocaleString("es-ES")}`
                        : "Ya ha entrado"
                      : "Pendiente de primer acceso con Google"}
                  </small>
                  <small>Bienvenida: {member.welcomeMessage ?? "—"}</small>
                </span>
                <Button
                  variant="secondary"
                  busy={changeWelcome.isPending && changeWelcome.variables?.id === member.id}
                  onClick={() => {
                    const next = window.prompt("Mensaje de bienvenida", member.welcomeMessage ?? "");
                    if (next !== null) changeWelcome.mutate({ id: member.id, message: next.trim() });
                  }}
                >
                  Cambiar saludo
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 />}
                  busy={remove.isPending && remove.variables === member.id}
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿Dar de baja a ${member.email}? Perderá el acceso de inmediato.`,
                      )
                    ) {
                      remove.mutate(member.id);
                    }
                  }}
                >
                  Dar de baja
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
