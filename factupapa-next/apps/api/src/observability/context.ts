import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionIdentity } from "../auth/repository.js";

export interface RequestContext { requestId: string; identity?: SessionIdentity; errorCode?: string }
export const requestContext = new AsyncLocalStorage<RequestContext>();
