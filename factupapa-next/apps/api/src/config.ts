export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  appVersion: string;
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? "4100");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("APP_PORT debe ser un puerto válido entre 1 y 65535");
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL es obligatoria");
  }

  return {
    host: env.APP_HOST ?? "0.0.0.0",
    port: readPort(env.APP_PORT),
    databaseUrl,
    appVersion: env.APP_VERSION ?? "development",
  };
}
