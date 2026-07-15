export async function reportOperation(operation: "backup" | "restore" | "cleanup", status: "failed" | "completed", amount = 1): Promise<void> {
  const url = process.env.OPERATIONS_METRICS_URL;
  const token = process.env.INTERNAL_METRICS_TOKEN;
  if (!url) return;
  await fetch(`${url.replace(/\/$/, "")}/internal/metrics/operation`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-operations-token": token } : {}) },
    body: JSON.stringify({ operation, status, amount }),
    signal: AbortSignal.timeout(2_000),
  }).then((response) => { if (response.status !== 204) throw new Error("metric_rejected"); }).catch(() => undefined);
}
