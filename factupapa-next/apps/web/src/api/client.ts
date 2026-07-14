import type { AuthTokens } from "./types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REFRESH_STORAGE_KEY = "factupapa-next.refresh-token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
  timeoutMs?: number;
}

function defaultStorage(): TokenStorage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}

export class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<AuthTokens> | null = null;

  constructor(
    readonly baseUrl: string,
    private readonly storage = defaultStorage(),
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  hasRefreshToken(): boolean {
    return Boolean(this.storage?.getItem(REFRESH_STORAGE_KEY));
  }

  private saveTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken;
    this.storage?.setItem(REFRESH_STORAGE_KEY, tokens.refreshToken);
  }

  clearSession(): void {
    this.accessToken = null;
    this.storage?.removeItem(REFRESH_STORAGE_KEY);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.saveTokens(tokens);
    return tokens;
  }

  async refresh(): Promise<AuthTokens> {
    if (this.refreshPromise) return this.refreshPromise;
    const refreshToken = this.storage?.getItem(REFRESH_STORAGE_KEY);
    if (!refreshToken) throw new ApiError(401, "session_expired");

    this.refreshPromise = this.request<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    }).then((tokens) => {
      this.saveTokens(tokens);
      return tokens;
    }).catch((error: unknown) => {
      this.clearSession();
      throw error;
    }).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async logout(): Promise<void> {
    const refreshToken = this.storage?.getItem(REFRESH_STORAGE_KEY);
    try {
      if (this.accessToken && refreshToken) {
        await this.request<void>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
          authenticated: true
        });
      }
    } finally {
      this.clearSession();
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = (options.method ?? "GET").toUpperCase();
    const authenticated = options.authenticated ?? !path.startsWith("/auth/");
    const response = await this.perform(path, options, authenticated);

    if (response.status === 401 && authenticated && this.hasRefreshToken()) {
      await this.refresh();
      if (SAFE_METHODS.has(method)) {
        return this.parse<T>(await this.perform(path, options, true));
      }
      throw new ApiError(401, "session_renewed_retry_required");
    }
    return this.parse<T>(response);
  }

  private async perform(path: string, options: RequestOptions, authenticated: boolean): Promise<Response> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (authenticated && this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);

    try {
      return await this.fetcher(`${this.baseUrl}${path}`, { ...options, headers, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new ApiError(0, "request_timeout");
      throw new ApiError(0, "network_error");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new ApiError(response.status, payload.error ?? "request_failed");
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }
}

export const apiClient = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4100");
