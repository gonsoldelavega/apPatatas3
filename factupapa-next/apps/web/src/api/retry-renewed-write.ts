import { ApiError } from "./client";

export async function retryAfterSessionRenewal<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === "session_renewed_retry_required"
    ) {
      return operation();
    }
    throw error;
  }
}
