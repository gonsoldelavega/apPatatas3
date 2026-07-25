import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/services";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { LoadingScreen } from "../ui/LoadingScreen";
import { useToast } from "../ui/ToastProvider";

const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AccountSecurityPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const sessions = useQuery({
    queryKey: ["active-sessions"],
    queryFn: authApi.sessions,
  });
  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      toast.show("Contraseña actualizada");
      void queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
    },
  });
  const revoke = useMutation({
    mutationFn: authApi.revokeOtherSessions,
    onSuccess: async ({ revoked }) => {
      toast.show(
        revoked === 0
          ? "No había otras sesiones abiertas"
          : `Sesiones cerradas: ${revoked}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
    },
  });
  const passwordValid =
    newPassword.length >= 14 &&
    newPassword.length <= 128 &&
    newPassword === confirmation &&
    currentPassword.length > 0 &&
    currentPassword !== newPassword;

  if (sessions.isLoading) return <LoadingScreen label="Cargando seguridad" />;

  return (
    <div className="page form-page security-page">
      <header className="form-page__header">
        <Link className="icon-button" to="/mas" aria-label="Volver">
          <ArrowLeft />
        </Link>
        <div>
          <p className="eyebrow">Cuenta</p>
          <h1>Seguridad</h1>
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (passwordValid) changePassword.mutate();
        }}
      >
        <section className="form-card">
          <div className="section-title-with-icon">
            <KeyRound />
            <div>
              <h2>Cambiar contraseña</h2>
              <p>
                El cambio mantiene este dispositivo y cierra las demás
                sesiones.
              </p>
            </div>
          </div>
          <Field
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <Field
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            minLength={14}
            maxLength={128}
            hint="Entre 14 y 128 caracteres."
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
          <Field
            label="Repite la nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            error={
              confirmation && confirmation !== newPassword
                ? "Las contraseñas no coinciden."
                : undefined
            }
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
          {changePassword.isError && (
            <div className="form-alert" role="alert">
              No se pudo cambiar. Comprueba la contraseña actual y vuelve a
              intentarlo.
            </div>
          )}
          <Button
            type="submit"
            disabled={!passwordValid}
            busy={changePassword.isPending}
          >
            Guardar nueva contraseña
          </Button>
        </section>
      </form>

      <section className="form-card">
        <div className="section-title-with-icon">
          <ShieldCheck />
          <div>
            <h2>Sesiones abiertas</h2>
            <p>Dispositivos que todavía pueden acceder a tu cuenta.</p>
          </div>
        </div>
        {sessions.isError && (
          <div className="form-alert" role="alert">
            No se pudieron consultar las sesiones.
          </div>
        )}
        <div className="session-list">
          {sessions.data?.items.map((session) => (
            <article key={session.familyId} className="session-row">
              <span className="session-row__icon">
                <ShieldCheck />
              </span>
              <span>
                <strong>
                  {session.current ? "Este dispositivo" : "Otra sesión"}
                </strong>
                <small>
                  Último uso: {dateTime.format(new Date(session.lastUsedAt))}
                </small>
              </span>
              {session.current && <span className="status">Actual</span>}
            </article>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={<LogOut />}
          busy={revoke.isPending}
          onClick={() => revoke.mutate()}
        >
          Cerrar las demás sesiones
        </Button>
      </section>
    </div>
  );
}
