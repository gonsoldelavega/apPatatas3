import type { ServerResponse } from "node:http";

export function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export function noContent(
  response: ServerResponse,
  headers: Record<string, string> = {},
): void {
  response.writeHead(204, { "cache-control": "no-store", ...headers });
  response.end();
}
