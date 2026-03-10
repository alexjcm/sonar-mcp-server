/**
 * Summary:
 *   Tools to fetch source code from SonarQube, in structured format or plain text.
 *
 * Endpoints:
 *   get_source_code  → GET api/sources/show
 *     Gets the source code. 
 *     Each element of the array of results is composed of:
 *     1. Line number
 *     2. Line content.
 * 
 *   get_source_raw   → GET api/sources/raw
 *     Gets the source code as plain text.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { buildQueryParams, handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";

// Input schema for api/sources/show
const inputSchema = z
  .object({
    key: z.string().min(1).describe("Clave del archivo (file key), p.ej. my_project:/src/foo/Bar.php"),
    from: z.number().int().min(1).optional().describe("Primera línea (1-based), por defecto 1"),
    to: z.number().int().min(1).optional().describe("Última línea (inclusive)"),
  })
  .strict()
  .refine(
    (v) => (v.from !== undefined && v.to !== undefined ? v.to >= v.from : true),
    { message: "'to' debe ser mayor o igual que 'from'", path: ["to"] }
  );

// Output schema based on example; allow loose
const outputSchema = z
  .object({
    sources: z.array(z.tuple([z.number().int(), z.string()])).optional(),
  })
  .loose();

export function registerSourcesTools(server: McpServer): void {
  server.registerTool(
    "get_source_code",
    {
      title: "Get Source Code",
      description: "Gets the source code of a file (api/sources/show)",
      inputSchema,
      outputSchema,
    },
    async (args: unknown) => {
      const parsed = inputSchema.parse(args ?? {});
      const params = buildQueryParams(parsed);

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/sources/show", params);
        const structured = outputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_source_raw — GET api/sources/raw (texto plano)
  // ─────────────────────────────────────────────────────────────
  const rawInput = z
    .object({
      key: z.string().min(1).describe("Clave del archivo (file key), p.ej. my_project:src/foo/Bar.php"),
    })
    .strict();

  server.registerTool(
    "get_source_raw",
    {
      title: "Get Source Code (Raw)",
      description: "Gets the source code as plain text (api/sources/raw)",
      inputSchema: rawInput,
    },
    async (args: unknown) => {
      const { key } = rawInput.parse(args ?? {});
      const client = getSonarqubeClient();
      try {
        const text = await client.getText("api/sources/raw", { key });
        return {
          content: [
            {
              type: "text" as const,
              text: text,
            },
          ],
        };
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
