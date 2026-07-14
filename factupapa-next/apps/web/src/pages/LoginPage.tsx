import { Eye, EyeOff, LockKeyhole } from "lucide-react";
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
  password: z.string().min(1, "Introduce la contraseña").max(128)
});
type LoginValues = z.infer<typeof schema>;

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(schema) });

  useEffect(() => { document.title = "Acceso · FactuPapa Next"; }, []);
  if (auth.status === "authenticated") return <Navigate to="/" replace />;
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = async (values: LoginValues) => {
    setMessage(null);
    try {
      await auth.login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (error) {
      setMessage(error instanceof Error && error.message.startsWith("No se") ? error.message : "No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.");
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="FactuPapa Next">
        <div className="brand-mark">F<span>·</span></div>
        <p className="eyebrow">Gestión diaria, sin ruido</p>
        <h1>Tu negocio,<br />bien ordenado.</h1>
        <p>Clientes, proveedores, productos e importaciones en una experiencia diseñada para trabajar desde cualquier lugar.</p>
      </section>
      <section className="login-card">
        <header><LockKeyhole aria-hidden="true" /><div><p className="eyebrow">Acceso seguro</p><h2>Bienvenido de nuevo</h2></div></header>
        <form onSubmit={handleSubmit(submit)} noValidate>
          <Field label="Email" type="email" autoComplete="email" inputMode="email" placeholder="tu@email.es" error={errors.email?.message} {...register("email")} />
          <Field label="Contraseña" type={showPassword ? "text" : "password"} autoComplete="current-password" error={errors.password?.message} suffix={
            <button type="button" className="field__action" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff /> : <Eye />}</button>
          } {...register("password")} />
          {message && <div className="form-alert" role="alert">{message}</div>}
          <Button type="submit" busy={isSubmitting}>Entrar en FactuPapa</Button>
        </form>
        <p className="security-note">La sesión se mantiene solo en este navegador y nunca se guarda en almacenamiento permanente.</p>
      </section>
    </main>
  );
}
