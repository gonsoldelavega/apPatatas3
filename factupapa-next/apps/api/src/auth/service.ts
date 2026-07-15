import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "./password.js";
import { LoginRateLimiter } from "./rate-limit.js";
import { AuthRepository, type SessionIdentity } from "./repository.js";
import {
  createRefreshToken,
  hashRefreshToken,
  TokenService,
} from "./tokens.js";

export class AuthError extends Error {
  constructor(
    readonly code:
      | "invalid_credentials"
      | "too_many_requests"
      | "invalid_refresh_token"
      | "unauthorized",
    readonly status: 401 | 429,
  ) {
    super(code);
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  company: { id: string; name: string };
  membership: { role: string };
}

export interface AuthApplication {
  login(
    email: string,
    password: string,
    rateLimitKey: string,
  ): Promise<AuthTokens>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  authenticate(accessToken: string): Promise<SessionIdentity>;
  logout(refreshToken: string): Promise<void>;
  me(accessToken: string): Promise<CurrentUser>;
}

export class AuthService implements AuthApplication {
  private constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly refreshTokenTtlMs: number,
    private readonly dummyPasswordHash: string,
  ) {}

  static async create(options: {
    repository: AuthRepository;
    jwtSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    loginRateLimitMax: number;
    loginRateLimitWindowMs: number;
  }): Promise<AuthService> {
    return new AuthService(
      options.repository,
      new TokenService(options.jwtSecret, options.accessTokenTtlSeconds),
      new LoginRateLimiter(
        options.loginRateLimitMax,
        options.loginRateLimitWindowMs,
      ),
      options.refreshTokenTtlDays * 86_400_000,
      await hashPassword("dummy-password-never-used"),
    );
  }

  private async issueTokens(
    identity: SessionIdentity,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const access = await this.tokens.createAccessToken(identity);
    return {
      accessToken: access.token,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: access.expiresIn,
    };
  }

  async login(
    email: string,
    password: string,
    rateLimitKey: string,
  ): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    const auditEntityId = createHash("sha256")
      .update(normalizedEmail)
      .digest("hex");
    if (!this.rateLimiter.consume(rateLimitKey)) {
      await this.repository.recordLoginFailure(auditEntityId, "rate_limited");
      throw new AuthError("too_many_requests", 429);
    }

    const user = await this.repository.findUserByEmail(normalizedEmail);
    const valid = await verifyPassword(
      user?.passwordHash ?? this.dummyPasswordHash,
      password,
    );
    if (!user || !valid) {
      await this.repository.recordLoginFailure(
        user?.userId ?? auditEntityId,
        "invalid_credentials",
        user ?? undefined,
      );
      throw new AuthError("invalid_credentials", 401);
    }

    this.rateLimiter.reset(rateLimitKey);
    const refreshToken = createRefreshToken();
    const identity = await this.repository.createLoginSession(
      user,
      hashRefreshToken(refreshToken),
      new Date(Date.now() + this.refreshTokenTtlMs),
    );
    return this.issueTokens(identity, refreshToken);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const nextRefreshToken = createRefreshToken();
    const result = await this.repository.rotateRefreshToken(
      hashRefreshToken(refreshToken),
      hashRefreshToken(nextRefreshToken),
      new Date(Date.now() + this.refreshTokenTtlMs),
    );
    if (result.status !== "rotated") {
      throw new AuthError("invalid_refresh_token", 401);
    }
    return this.issueTokens(result.identity, nextRefreshToken);
  }

  async authenticate(accessToken: string): Promise<SessionIdentity> {
    try {
      const claims = await this.tokens.verifyAccessToken(accessToken);
      const identity = await this.repository.findActiveIdentity(
        claims.userId,
        claims.companyId,
        claims.familyId,
      );
      if (!identity || identity.role !== claims.role)
        throw new Error("Sesión inactiva");
      return identity;
    } catch {
      throw new AuthError("unauthorized", 401);
    }
  }

  async logout(refreshToken: string): Promise<void> {
    const revoked = await this.repository.logoutByRefresh(
      hashRefreshToken(refreshToken),
    );
    if (!revoked) throw new AuthError("unauthorized", 401);
  }

  async me(accessToken: string): Promise<CurrentUser> {
    const identity = await this.authenticate(accessToken);
    return {
      id: identity.userId,
      email: identity.email,
      displayName: identity.displayName,
      company: { id: identity.companyId, name: identity.companyName },
      membership: { role: identity.role },
    };
  }
}
