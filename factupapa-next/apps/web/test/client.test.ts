import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../src/api/client";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const tokens = {
  accessToken: "access-1",
  tokenType: "Bearer" as const,
  expiresIn: 900,
};

describe("ApiClient", () => {
  it("inicia sesión sin recibir un refresh token legible por JavaScript", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(tokens));
    const client = new ApiClient("http://api.test", fetcher);
    await expect(
      client.login("persona@example.test", "correcta"),
    ).resolves.toEqual(tokens);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("trata credenciales inválidas con el error HTTP uniforme", async () => {
    const client = new ApiClient(
      "http://api.test",
      vi.fn().mockResolvedValue(json({ error: "invalid_credentials" }, 401)),
    );
    await expect(
      client.login("persona@example.test", "incorrecta"),
    ).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
  });

  it("realiza una única renovación concurrente", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ ...tokens, accessToken: "access-2" }));
    const client = new ApiClient("http://api.test", fetcher);
    const [first, second] = await Promise.all([
      client.refresh(),
      client.refresh(),
    ]);
    expect(first.accessToken).toBe("access-2");
    expect(second.accessToken).toBe("access-2");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("renueva y repite solo una lectura idempotente expirada", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(tokens))
      .mockResolvedValueOnce(json({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(json({ ...tokens, accessToken: "access-2" }))
      .mockResolvedValueOnce(json({ id: "user" }));
    const client = new ApiClient("http://api.test", fetcher);
    await client.login("persona@example.test", "correcta");
    await expect(client.request("/me")).resolves.toEqual({ id: "user" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("no repite una mutación después de renovar la sesión", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(tokens))
      .mockResolvedValueOnce(json({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(json({ ...tokens, accessToken: "access-2" }));
    const client = new ApiClient("http://api.test", fetcher);
    await client.login("persona@example.test", "correcta");
    await expect(
      client.request("/contacts", {
        method: "POST",
        body: JSON.stringify({ legalName: "Ejemplo" }),
      }),
    ).rejects.toMatchObject({
      status: 401,
      code: "session_renewed_retry_required",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("notifica la expiración cuando la cookie ya no puede renovar", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(tokens))
      .mockResolvedValueOnce(json({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(json({ error: "invalid_refresh_token" }, 401));
    const client = new ApiClient("http://api.test", fetcher);
    const expired = vi.fn();
    client.onSessionExpired(expired);
    await client.login("persona@example.test", "correcta");
    await expect(client.request("/me")).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 404, 409, 413])(
    "conserva el estado HTTP %i",
    async (status) => {
      const client = new ApiClient(
        "http://api.test",
        vi.fn().mockResolvedValue(json({ error: "controlled_error" }, status)),
      );
      await expect(
        client.request("/public", { authenticated: false }),
      ).rejects.toMatchObject({ status, code: "controlled_error" });
    },
  );

  it("distingue pérdida de conexión", async () => {
    const client = new ApiClient(
      "http://api.test",
      vi.fn().mockRejectedValue(new TypeError("offline")),
    );
    await expect(
      client.request("/health", { authenticated: false }),
    ).rejects.toEqual(new ApiError(0, "network_error"));
  });

  it("revoca la sesión mediante la cookie HttpOnly y limpia el access token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(tokens))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new ApiClient("http://api.test", fetcher);
    await client.login("persona@example.test", "correcta");
    await client.logout();
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://api.test/auth/logout",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
