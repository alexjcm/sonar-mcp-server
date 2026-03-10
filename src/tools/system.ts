/**
 * Summary:
 *   System tools to check connectivity and status of SonarQube.
 *
 * Endpoints:
 *   ping_system         → GET api/system/ping
 *     Returns "pong" in plain text if the server is accessible.
 *   get_system_status   → GET api/system/status
 *     Returns status (UP/DOWN/STARTING/RESTARTING) and the installed server version.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";

export interface SystemStatus {
  version: string;
  status: "STARTING" | "UP" | "DOWN" | "RESTARTING";
  [key: string]: unknown;
}

export function registerSystemTools(server: McpServer): void {
  // ─────────────────────────────────────────────────────────────
  // ping_system
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "ping_system",
    {
      title: "Ping SonarQube",
      description:
        'Verifies that the SonarQube server is active. Returns "pong" if the server responds correctly.',
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const client = getSonarqubeClient();
      try {
        const response = await client.getText("api/system/ping");
        return {
          content: [{ type: "text" as const, text: response.trim() }],
        };
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_system_status
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_system_status",
    {
      title: "Get SonarQube System Status",
      description:
        "Gets the current status of the SonarQube server. " +
        "Returns the status (UP, DOWN, STARTING, RESTARTING), " +
        "the installed version and the instance ID.",
      inputSchema: z.object({}).strict(),
      outputSchema: z
        .object({
          version: z.string(),
          status: z.enum(["STARTING", "UP", "DOWN", "RESTARTING"]),
        })
        .loose(),
    },
    async () => {
      const client = getSonarqubeClient();
      try {
        const status = await client.get<SystemStatus>("api/system/status");
        return createMcpSuccessResponse(status);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
