/**
 * Creates the McpServer, registers all tools, and starts the
 * StdioServerTransport. The server connects to the MCP client
 * via stdin/stdout (JSON-RPC protocol).
 *
 * IMPORTANT: Never write to stdout from the tools — it is
 * reserved exclusively for the MCP protocol. Use stderr
 * for any diagnostic logs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.ts";

const SERVER_NAME = "sonar-mcp-server";
const SERVER_VERSION = "1.0.0";

async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[${SERVER_NAME}] v${SERVER_VERSION} — MCP server is running... (stdio)\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[sonar-mcp-server] ERROR fatal: ${String(err)}\n`);
  process.exit(1);
});
