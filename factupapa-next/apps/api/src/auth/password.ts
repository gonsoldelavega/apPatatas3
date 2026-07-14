import { Algorithm, hash, verify } from "@node-rs/argon2";

const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function validatePassword(password: string): void {
  if (password.length < 14 || password.length > 128) {
    throw new Error("La contraseña debe tener entre 14 y 128 caracteres");
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, options);
  } catch {
    return false;
  }
}
