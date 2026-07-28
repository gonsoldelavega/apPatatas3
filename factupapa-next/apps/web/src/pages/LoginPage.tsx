import { Eye, EyeOff, LockKeyhole, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../api/client";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";

const schema = z.object({
  email: z.email("Introduce un email válido").max(320),
  password: z.string().min(1, "Introduce la contraseña").max(128),
});
type LoginValues = z.infer<typeof schema>;

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    document.title = "Acceso · FactuPapa";
    const google = new URLSearchParams(location.search).get("google");
    const googleMessages: Record<string, string> = {
      state:
        "La sesión de Google caducó o perdió su cookie. Vuelve a intentarlo sin cambiar de navegador.",
      exchange:
        "Google aceptó el permiso, pero la credencial privada no coincide con este cliente.",
      identity:
        "Google no ha devuelto un correo verificado para esta cuenta.",
      registration:
        "Google ha validado la cuenta, pero no se ha podido crear tu espacio privado.",
      failed:
        "No se ha podido completar el acceso con Google. Inténtalo de nuevo.",
    };
    if (google && googleMessages[google]) {
      setMessage(googleMessages[google]);
    }
  }, [location.search]);

  if (auth.status === "authenticated") return <Navigate to="/" replace />;
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = async (values: LoginValues) => {
    setMessage(null);
    try {
      await auth.login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.startsWith("No se")
          ? error.message
          : "No se ha podido conectar. Comprueba tus datos e inténtalo de nuevo.",
      );
    }
  };

  return (
    <main className="login-page login-page--product">
      <section className="login-product" aria-label="FactuPapa">
        <div className="login-product__topline">
          <div className="login-product__logo" aria-hidden="true">
            <ReceiptText />
          </div>
          <strong>FactuPapa</strong>
          <span>Gestión sencilla</span>
        </div>

        <div className="login-product__message">
          <p className="eyebrow">Tu negocio, bajo control</p>
          <h1>Factura. Cobra. Decide.</h1>
          <p>
            Facturas, gastos, clientes y productos en una aplicación pensada
            para trabajar rápido desde el móvil.
          </p>
        </div>

        <div className="login-product__trust" aria-label="Ventajas de FactuPapa">
          <span><ShieldCheck /> Datos protegidos</span>
          <span><LockKeyhole /> Acceso privado</span>
        </div>
      </section>

      <section className="login-card login-card--product">
        <header>
          <div>
            <p className="eyebrow">Acceso a tu cuenta</p>
            <h2>Hola de nuevo</h2>
            <p>Introduce tus datos para continuar.</p>
          </div>
        </header>

        <a
          className="google-login"
          href={`${apiClient.baseUrl}/auth/google`}
          aria-label="Continuar con Google"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
            <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z" />
            <path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.11-1.32.32-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.54l3.35-2.62Z" />
            <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
          </svg>
          Continuar con Google
        </a>

        <div className="login-divider" aria-hidden="true"><span>o</span></div>

        <form onSubmit={handleSubmit(submit)} noValidate>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@email.es"
            error={errors.email?.message}
            {...register("email")}
          />
          <Field
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            error={errors.password?.message}
            suffix={
              <button
                type="button"
                className="field__action"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
            {...register("password")}
          />
          {message && (
            <div className="form-alert" role="alert">
              {message}
            </div>
          )}
          <Button type="submit" busy={isSubmitting}>
            Entrar
          </Button>
        </form>

        <p className="security-note">
          Al continuar con Google se crea tu espacio privado si aún no existe.
          Tu sesión permanece protegida en este dispositivo.
        </p>
      </section>
    </main>
  );
}
