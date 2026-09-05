import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import { retryAfterSessionRenewal } from "../src/api/retry-renewed-write";

describe("retryAfterSessionRenewal", () => {
  it("retries exactly once after the client renews an expired session", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError(401, "session_renewed_retry_required"))
      .mockResolvedValueOnce("paid");

    await expect(retryAfterSessionRenewal(operation)).resolves.toBe("paid");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not replay writes for unrelated API failures", async () => {
    const failure = new ApiError(409, "conflict");
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(retryAfterSessionRenewal(operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("never retries more than once", async () => {
    const failure = new ApiError(401, "session_renewed_retry_required");
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(retryAfterSessionRenewal(operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
