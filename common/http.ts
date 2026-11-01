import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { requestContext } from "./context.js";
import { VERSION } from "./version.js";

/**
 * HTTP mode: MCP over Streamable HTTP, one caller identity per request.
 *
 * The server is meant to run on an internal network, behind an authentication
 * gateway that authenticates the person and forwards their own Planka API key
 * in `apiKeyHeader`. It never publishes a port of its own to the outside.
 *
 * Stateless: every POST builds a fresh MCP server and transport, so nothing
 * about one caller survives into the next request. GET (server-initiated
 * stream) and DELETE (session end) have no meaning without sessions: 405.
 *
 * Without a key, only the tool catalogue can be read: a body made solely of
 * `initialize`, `notifications/initialized`, `tools/list` and `ping` messages
 * is served (no key, so no Planka call is possible); anything else is refused
 * with 401. This lets the gateway show the real tools to someone who has not
 * registered their key yet. Such a body still runs in a request context, with
 * no key, so a Planka call would fail rather than use the environment's key.
 */
export type HttpOptions = {
  host: string;
  port: number;
  /** Header carrying the caller's Planka API key (case-insensitive). */
  apiKeyHeader: string;
  /** Maximum JSON body size, in bytes. */
  maxBodyBytes?: number;
};

const MCP_PATH = "/mcp";

/** The only JSON-RPC methods served without a Planka key: the tool catalogue. */
export const KEYLESS_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list",
  "ping",
]);

/** True when every message of the body is a request or notification for a keyless method. */
export function isCatalogueOnly(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0) return false;
  return messages.every(
    (m) =>
      typeof m === "object" &&
      m !== null &&
      typeof (m as { method?: unknown }).method === "string" &&
      KEYLESS_METHODS.has((m as { method: string }).method),
  );
}

function jsonRpcError(code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null });
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > maxBytes) {
      throw new Error("payload too large");
    }
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serve(
  createServer: () => McpServer,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  const server = createServer();
  // No sessionIdGenerator: stateless, a fresh transport per request.
  const transport = new StreamableHTTPServerTransport({});
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    // exactOptionalPropertyTypes: the SDK's own transport does not type-check
    // against its Transport interface under this flag; the cast is safe.
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(jsonRpcError(-32603, "Internal server error"));
    }
  }
}

export function startHttpServer(
  createServer: () => McpServer,
  options: HttpOptions,
): Promise<Server> {
  const headerName = options.apiKeyHeader.toLowerCase();
  const maxBodyBytes = options.maxBodyBytes ?? 4 * 1024 * 1024;

  const httpServer = createHttpServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];

    if (path === "/healthz" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: VERSION }));
      return;
    }

    if (path !== MCP_PATH) {
      res.writeHead(404).end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
      res.end(jsonRpcError(-32000, "Method not allowed: this server is stateless"));
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req, maxBodyBytes);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === "payload too large";
      res.writeHead(tooLarge ? 413 : 400, { "Content-Type": "application/json" });
      res.end(jsonRpcError(-32700, tooLarge ? "Payload too large" : "Parse error"));
      return;
    }

    const raw = req.headers[headerName];
    const apiKey = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!apiKey) {
      if (isCatalogueOnly(body)) {
        // Tool catalogue only. Still inside a request context, with no key: a
        // Planka call would fail instead of falling back to the environment.
        await requestContext.run({ apiKey: null }, () => serve(createServer, req, res, body));
        return;
      }
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(jsonRpcError(-32001, `Missing Planka API key (${options.apiKeyHeader} header)`));
      return;
    }

    await requestContext.run({ apiKey }, () => serve(createServer, req, res, body));
  });

  return new Promise((resolve) => {
    httpServer.listen(options.port, options.host, () => resolve(httpServer));
  });
}
