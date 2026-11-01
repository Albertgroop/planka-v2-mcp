#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startHttpServer } from "./common/http.js";
import { createServer } from "./server.js";

/**
 * Transport: `--http` / `--stdio` on the command line, else MCP_TRANSPORT
 * (default stdio).
 *
 * - stdio: one local user, credentials from the PLANKA_* environment variables.
 * - http: multi-user, behind an authentication gateway that forwards each
 *   caller's own Planka API key (header MCP_API_KEY_HEADER). PLANKA_API_KEY and
 *   the agent email/password are not used in this mode.
 */
function selectedTransport(): "stdio" | "http" {
  if (process.argv.includes("--http")) return "http";
  if (process.argv.includes("--stdio")) return "stdio";
  return process.env.MCP_TRANSPORT === "http" ? "http" : "stdio";
}

async function runServer() {
  if (selectedTransport() === "http") {
    const host = process.env.HTTP_HOST || "0.0.0.0";
    const port = Number(process.env.HTTP_PORT || 8000);
    const apiKeyHeader = process.env.MCP_API_KEY_HEADER || "X-Planka-Api-Key";
    await startHttpServer(createServer, { host, port, apiKeyHeader });
    console.error(`Planka MCP server listening on http://${host}:${port}/mcp`);
    return;
  }

  const server = createServer();
  await server.connect(new StdioServerTransport());
}

runServer().catch((err) => {
  console.error("Error running server:", err);
  process.exit(1);
});
