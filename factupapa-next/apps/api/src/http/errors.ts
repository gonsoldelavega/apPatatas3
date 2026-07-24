export class HttpError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "invalid_mapping"
      | "missing_required_mapping"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "payload_too_large"
      | "purchase_registry_not_configured"
      | "purchase_registry_unavailable"
      | "purchase_registry_invalid",
    readonly status: 400 | 403 | 404 | 409 | 413 | 502 | 503,
  ) {
    super(code);
  }
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
