import { createHash, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export interface AccessIdentity {
  userId: string;
  companyId: string;
  familyId: string;
  role: string;
}

export interface AccessTokenResult {
  token: string;
  expiresIn: number;
}

export class TokenService {
  private readonly secret: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
  ) {
    this.secret = new TextEncoder().encode(secret);
  }

  async createAccessToken(identity: AccessIdentity): Promise<AccessTokenResult> {
    const token = await new SignJWT({
      company_id: identity.companyId,
      session_family_id: identity.familyId,
      role: identity.role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(identity.userId)
      .setIssuer("factupapa-next")
      .setAudience("factupapa-next-api")
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1_000) + this.ttlSeconds)
      .sign(this.secret);

    return { token, expiresIn: this.ttlSeconds };
  }

  async verifyAccessToken(token: string): Promise<AccessIdentity> {
    const { payload } = await jwtVerify(token, this.secret, {
      algorithms: ["HS256"],
      issuer: "factupapa-next",
      audience: "factupapa-next-api",
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.company_id !== "string" ||
      typeof payload.session_family_id !== "string" ||
      typeof payload.role !== "string"
    ) {
      throw new Error("Access token incompleto");
    }

    return {
      userId: payload.sub,
      companyId: payload.company_id,
      familyId: payload.session_family_id,
      role: payload.role,
    };
  }
}

export function createRefreshToken(): string {
  return `fp_rt_${randomBytes(32).toString("base64url")}`;
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
