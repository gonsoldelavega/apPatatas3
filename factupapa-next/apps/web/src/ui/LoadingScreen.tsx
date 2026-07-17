export function LoadingScreen({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <span className="loading-mark" aria-hidden="true">
        F
      </span>
      <span>{label}</span>
    </div>
  );
}
