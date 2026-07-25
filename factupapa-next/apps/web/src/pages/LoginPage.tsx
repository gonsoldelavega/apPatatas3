import { Eye, EyeOff, LockKeyhole, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../auth/AuthProvider";
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
  }, []);

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
          Tu sesión permanece protegida en este dispositivo.
        </p>
      </section>
    </main>
  );
}
