/**
 * Central registry point for all MCP server tools.
 * Imports and registers each tool module in the server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSystemTools } from "./system.ts";
import { registerProjectBranchesTools } from "./project-branches.ts";
import { registerComponentsTools } from "./components.ts";
import { registerIssuesTools } from "./issues.ts";
import { registerRulesTools } from "./rules.ts";
import { registerHotspotsTools } from "./hotspots.ts";
import { registerMeasuresTools } from "./measures.ts";
import { registerSourcesTools } from "./sources.ts";

export function registerAllTools(server: McpServer): void {
  registerSystemTools(server);
  registerProjectBranchesTools(server);
  registerComponentsTools(server);
  registerIssuesTools(server);
  registerRulesTools(server);
  registerHotspotsTools(server);
  registerMeasuresTools(server);
  registerSourcesTools(server);
  // Add other tool modules here
}
