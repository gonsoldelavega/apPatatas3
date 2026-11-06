import type { AuthApplication } from "../auth/service.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { bearerToken, readJson, requireUuid } from "../http/request.js";
import type { RouteHandler } from "../http/router.js";
import { json, noContent } from "../http/response.js";
import { textValue, optionalTextValue } from "./common.js";
import { validateEntry, type LedgerService } from "./ledger.js";
import { validateNote, type NotesService } from "./notes.js";
import {
  validateOrderCreate,
  validateOrderLine,
  validateOrderPatch,
  validateProgress,
  type OrdersService,
} from "./orders.js";
import { validateTask, type TasksService } from "./tasks.js";

export interface WorkspaceServices {
  notes: NotesService;
  tasks: TasksService;
  orders: OrdersService;
  ledger: LedgerService;
}

const PREFIXES = ["/notes", "/tasks", "/orders", "/ledger"];

/** Pedidos, tareas, notas y cuentas entre núcleos. Accesibles para el maestro y los socios. */
export function createWorkspaceRoutes(auth: AuthApplication, services: WorkspaceServices): RouteHandler {
  const { notes, tasks, orders, ledger } = services;
  return async ({ request, response, url }) => {
    const path = url.pathname;
    if (!PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
    const method = request.method ?? "GET";
    const identity = await auth.authenticate(bearerToken(request));
    const idOf = (value: string | undefined) => requireUuid(value);
    let match: RegExpMatchArray | null;

    // ── Notas ────────────────────────────────────────────────────────────────
    if (path === "/notes" && method === "GET") return json(response, 200, await notes.list(identity, url)), true;
    if (path === "/notes" && method === "POST") {
      return json(response, 201, await notes.create(identity, validateNote(await readJson(request), false))), true;
    }
    if ((match = path.match(/^\/notes\/([^/]+)$/))) {
      if (method === "PATCH") {
        return json(response, 200, await notes.update(identity, idOf(match[1]), validateNote(await readJson(request), true))), true;
      }
      if (method === "DELETE") return await notes.archive(identity, idOf(match[1])), noContent(response), true;
    }

    // ── Tareas ───────────────────────────────────────────────────────────────
    if (path === "/tasks" && method === "GET") return json(response, 200, await tasks.list(identity, url)), true;
    if (path === "/tasks" && method === "POST") {
      return json(response, 201, await tasks.create(identity, validateTask(await readJson(request), false))), true;
    }
    if ((match = path.match(/^\/tasks\/([^/]+)$/))) {
      if (method === "PATCH") {
        return json(response, 200, await tasks.update(identity, idOf(match[1]), validateTask(await readJson(request), true))), true;
      }
      if (method === "DELETE") return await tasks.remove(identity, idOf(match[1])), noContent(response), true;
    }
    if ((match = path.match(/^\/tasks\/([^/]+)\/(done|reopen)$/)) && method === "POST") {
      return json(response, 200, await tasks.setDone(identity, idOf(match[1]), match[2] === "done")), true;
    }

    // ── Pedidos ──────────────────────────────────────────────────────────────
    if (path === "/orders" && method === "GET") return json(response, 200, await orders.list(identity, url)), true;
    if (path === "/orders" && method === "POST") {
      return json(response, 201, await orders.create(identity, validateOrderCreate(await readJson(request)))), true;
    }
    if ((match = path.match(/^\/orders\/([^/]+)$/))) {
      if (method === "GET") return json(response, 200, await orders.get(identity, idOf(match[1]))), true;
      if (method === "PATCH") {
        return json(response, 200, await orders.update(identity, idOf(match[1]), validateOrderPatch(await readJson(request)))), true;
      }
    }
    if ((match = path.match(/^\/orders\/([^/]+)\/cancel$/)) && method === "POST") {
      return json(response, 200, await orders.cancel(identity, idOf(match[1]))), true;
    }
    if ((match = path.match(/^\/orders\/([^/]+)\/lines$/)) && method === "POST") {
      return json(response, 201, await orders.addLine(identity, idOf(match[1]), validateOrderLine(await readJson(request)))), true;
    }
    if ((match = path.match(/^\/orders\/([^/]+)\/lines\/([^/]+)$/)) && method === "DELETE") {
      return json(response, 200, await orders.removeLine(identity, idOf(match[1]), idOf(match[2]))), true;
    }
    if ((match = path.match(/^\/orders\/([^/]+)\/lines\/([^/]+)\/progress$/)) && method === "POST") {
      return json(
        response,
        200,
        await orders.progress(identity, idOf(match[1]), idOf(match[2]), validateProgress(await readJson(request))),
      ), true;
    }

    // ── Cuentas entre núcleos ────────────────────────────────────────────────
    if (path === "/ledger/summary" && method === "GET") return json(response, 200, await ledger.summary(identity, url)), true;
    if (path === "/ledger/entries" && method === "GET") return json(response, 200, await ledger.list(identity, url)), true;
    if (path === "/ledger/entries" && method === "POST") {
      return json(response, 201, await ledger.create(identity, validateEntry(await readJson(request), false))), true;
    }
    if ((match = path.match(/^\/ledger\/entries\/([^/]+)$/))) {
      if (method === "PATCH") {
        return json(response, 200, await ledger.update(identity, idOf(match[1]), validateEntry(await readJson(request), true))), true;
      }
      if (method === "DELETE") return await ledger.remove(identity, idOf(match[1])), noContent(response), true;
    }
    if (path === "/ledger/settle" && method === "POST") {
      const body = await readJson(request);
      assertAllowedKeys(body, ["notes"]);
      return json(response, 201, await ledger.settle(identity, optionalTextValue(body.notes, 2000) ?? null)), true;
    }
    if (path === "/ledger/settings" && method === "GET") return json(response, 200, await ledger.settings(identity)), true;
    if (path === "/ledger/settings" && method === "PUT") {
      const body = await readJson(request);
      assertAllowedKeys(body, ["sideAName", "sideBName"]);
      return json(response, 200, await ledger.saveSettings(identity, { sideAName: textValue(body.sideAName, 60), sideBName: textValue(body.sideBName, 60) })), true;
    }

    throw new HttpError("not_found", 404);
  };
}
