export class HttpError extends Error {
  constructor(
    readonly code: "invalid_request" | "not_found" | "conflict" | "payload_too_large",
    readonly status: 400 | 404 | 409 | 413,
  ) {
    super(code);
  }
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
