import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "@jest/globals";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { project } from "./fixtures.js";

/**
 * HTTP mode: each request runs with the Planka API key of its own caller, and
 * nothing about one caller (key, user id) reaches another caller's request.
 */

const PLANKA = "https://planka.test";
const realFetch = global.fetch;
const plankaCalls: Array<{ path: string; apiKey: string | null }> = [];
const usersById: Record<string, string> = { "key-alice": "user-alice", "key-bob": "user-bob" };

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function fakePlanka(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  const url = new URL(urlOf(input));
  const headers = new Headers(init?.headers);
  const apiKey = headers.get("x-api-key");
  plankaCalls.push({ path: url.pathname, apiKey });
  const json = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  if (url.pathname === "/api/users/me") {
    return json({ item: { id: usersById[apiKey ?? ""] ?? "unknown" } });
  }
  if (url.pathname === "/api/projects") {
    return json({ items: [{ ...project, name: `projects of ${apiKey}` }] });
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.PLANKA_BASE_URL = PLANKA;
  // Must never be used in HTTP mode.
  process.env.PLANKA_API_KEY = "env-key";
  global.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    return urlOf(input).startsWith(PLANKA) ? fakePlanka(input, init) : realFetch(input, init);
  }) as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});

  const { startHttpServer } = await import("../common/http.js");
  const { createServer } = await import("../server.js");
  server = await startHttpServer(createServer, {
    host: "127.0.0.1",
    port: 0,
    apiKeyHeader: "X-Planka-Api-Key",
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  global.fetch = realFetch;
  delete process.env.PLANKA_API_KEY;
  jest.restoreAllMocks();
});

afterEach(() => {
  plankaCalls.length = 0;
});

async function callTool(apiKey: string, name: string, args: Record<string, unknown>) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const client = new Client({ name: "test", version: "0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { "X-Planka-Api-Key": apiKey } },
  });
  // Same exactOptionalPropertyTypes quirk as in common/http.ts.
  await client.connect(transport as Transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }>;
    return JSON.parse(content[0]?.text ?? "null");
  } finally {
    await client.close();
  }
}

describe("HTTP mode", () => {
  test("healthz answers without a key", async () => {
    const res = await realFetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  test("a request without the key header is refused", async () => {
    const res = await realFetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
    expect(plankaCalls).toHaveLength(0);
  });

  test("GET and DELETE are refused: the server is stateless", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await realFetch(`${base}/mcp`, {
        method,
        headers: { "X-Planka-Api-Key": "key-alice" },
      });
      expect(res.status).toBe(405);
    }
  });

  test("each caller's requests carry their own key, never the env key", async () => {
    const [alice, bob] = await Promise.all([
      callTool("key-alice", "mcp_kanban_project_board_manager", { action: "get_projects" }),
      callTool("key-bob", "mcp_kanban_project_board_manager", { action: "get_projects" }),
    ]);
    expect(JSON.stringify(alice)).toContain("projects of key-alice");
    expect(JSON.stringify(bob)).toContain("projects of key-bob");
    const keys = new Set(plankaCalls.map((c) => c.apiKey));
    expect(keys).toEqual(new Set(["key-alice", "key-bob"]));
  });
});

describe("acting user in a request context", () => {
  test("is the owner of the request's key, resolved once per request", async () => {
    const { requestContext } = await import("../common/context.js");
    const { getAdminUserId } = await import("../common/setup.js");

    const ids = await Promise.all(
      ["key-alice", "key-bob"].map((apiKey) =>
        requestContext.run({ apiKey }, async () => [
          await getAdminUserId(),
          await getAdminUserId(),
        ]),
      ),
    );
    expect(ids).toEqual([
      ["user-alice", "user-alice"],
      ["user-bob", "user-bob"],
    ]);
    const meCalls = plankaCalls.filter((c) => c.path === "/api/users/me");
    expect(meCalls.map((c) => c.apiKey).sort()).toEqual(["key-alice", "key-bob"]);
  });
});
