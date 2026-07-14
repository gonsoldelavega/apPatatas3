import type { IncomingMessage, ServerResponse } from "node:http";

export interface RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
}

export type RouteHandler = (context: RouteContext) => Promise<boolean>;
