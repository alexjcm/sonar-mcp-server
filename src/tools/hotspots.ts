/**
 * Summary:
 *   Tools to query Security Hotspots.
 *
 * Endpoints:
 *   search_hotspots   → GET api/hotspots/search
 *     Search Security Hotspots by project/files with filters.
 * 
 *   show_hotspot      → GET api/hotspots/show
 *     Returns the detail of a Security Hotspot.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { buildQueryParams, handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";

// Input schema aligned with SonarQube Web API for api/hotspots/search
const inputSchema = z
  .object({
    // Required unless hotspots is provided
    project: z.string().min(1).optional().describe("Clave del proyecto o aplicación"),
    // Alternative: list of hotspot keys
    hotspots: z.string().optional().describe("Claves de Security Hotspots separadas por coma"),

    branch: z.string().min(1).optional().describe("Clave de la rama (branch key)"),
    cwe: z.string().optional().describe("Lista de CWE separados por coma (ej. 89,434,352)"),
    files: z
      .string()
      .optional()
      .describe("Lista de archivos separados por coma para limitar hotspots devueltos"),
    owaspAsvs_4_0: z
      .string()
      .optional()
      .describe("OWASP ASVS v4.0 categorías/reglas separadas por coma (usar con owaspAsvsLevel)"),
    owaspAsvsLevel: z.enum(["1", "2", "3"]).optional().describe("Nivel OWASP ASVS <= nivel indicado"),
    owaspTop10: z
      .string()
      .optional()
      .describe("OWASP Top 10 2017 categorías en minúscula (a1..a10) separadas por coma"),
    owaspTop10_2021: z
      .string()
      .optional()
      .describe("OWASP Top 10 2021 categorías en minúscula (a1..a10) separadas por coma"),
    pciDss_3_2: z.string().optional().describe("PCI DSS v3.2 categorías separadas por coma"),
    pciDss_4_0: z.string().optional().describe("PCI DSS v4.0 categorías separadas por coma"),
    sonarsourceSecurity: z
      .string()
      .optional()
      .describe(
        "Categorías SonarSource separadas por coma (ej. sql-injection,xss,others)"
      ),
    p: z.number().int().positive().optional().describe("Número de página (1-based)"),
    ps: z.number().int().positive().max(500).optional().describe("Tamaño de página (<= 500)"),
  })
  .strict()
  .refine(
    ({ project, hotspots }) => Boolean(project) || Boolean(hotspots),
    {
      message: "Debe proveerse 'project' o 'hotspots' (al menos uno)",
      path: ["project"],
    }
  );

// Output schema based on example response; allow loose fields
const outputSchema = z
  .object({
    paging: z.object({
      pageIndex: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
    hotspots: z
      .array(
        z
          .object({
            key: z.string(),
            component: z.string().optional(),
            project: z.string().optional(),
            securityCategory: z.string().optional(),
            vulnerabilityProbability: z.string().optional(),
            status: z.string().optional(),
            line: z.number().int().optional(),
            message: z.string().optional(),
            messageFormattings: z.array(z.any()).optional(),
            assignee: z.string().optional(),
            author: z.string().optional(),
            creationDate: z.string().optional(),
            updateDate: z.string().optional(),
            flows: z.array(z.any()).optional(),
            ruleKey: z.string().optional(),
          })
          .loose()
      )
      .optional(),
    components: z.array(
      z
        .object({
          key: z.string(),
          qualifier: z.string().optional(),
          name: z.string().optional(),
          longName: z.string().optional(),
          path: z.string().optional(),
        })
        .loose()
    ).optional(),
  })
  .loose();

const showHotspotInput = z
  .object({
    hotspot: z.string().min(1).describe("Security Hotspot Key"),
  })
  .strict();

const showHotspotOutput = z
  .object({
    key: z.string(),
    component: z
      .object({
        key: z.string(),
        qualifier: z.string().optional(),
        name: z.string().optional(),
        longName: z.string().optional(),
        path: z.string().optional(),
      })
      .loose()
      .optional(),
    project: z
      .object({
        key: z.string(),
        qualifier: z.string().optional(),
        name: z.string().optional(),
        longName: z.string().optional(),
      })
      .loose()
      .optional(),
    rule: z
      .object({
        key: z.string(),
        name: z.string().optional(),
        securityCategory: z.string().optional(),
        vulnerabilityProbability: z.string().optional(),
      })
      .loose()
      .optional(),
    status: z.string().optional(),
    line: z.number().int().optional(),
    hash: z.string().optional(),
    message: z.string().optional(),
    messageFormattings: z.array(z.any()).optional(),
    assignee: z.string().optional(),
    author: z.string().optional(),
    creationDate: z.string().optional(),
    updateDate: z.string().optional(),
    changelog: z
      .array(
        z
          .object({
            user: z.string().optional(),
            userName: z.string().optional(),
            creationDate: z.string().optional(),
            diffs: z
              .array(
                z.object({
                  key: z.string().optional(),
                  newValue: z.string().optional(),
                  oldValue: z.string().optional(),
                })
              )
              .optional(),
            avatar: z.string().optional(),
            isUserActive: z.boolean().optional(),
          })
          .loose()
      )
      .optional(),
    comment: z
      .array(
        z
          .object({
            key: z.string(),
            login: z.string().optional(),
            htmlText: z.string().optional(),
            markdown: z.string().optional(),
            createdAt: z.string().optional(),
          })
          .loose()
      )
      .optional(),
    users: z
      .array(
        z
          .object({
            login: z.string(),
            name: z.string().optional(),
            active: z.boolean().optional(),
          })
          .loose()
      )
      .optional(),
    canChangeStatus: z.boolean().optional(),
    codeVariants: z.array(z.string()).optional(),
  })
  .loose();

export function registerHotspotsTools(server: McpServer): void {
  server.registerTool(
    "search_hotspots",
    {
      title: "Search Security Hotspots",
      description: "Search Security Hotspots (api/hotspots/search)",
      inputSchema,
      outputSchema,
    },
    async (args: unknown) => {
      const parsed = inputSchema.parse(args ?? {});

      const params = buildQueryParams(parsed, {
        owaspAsvs_4_0: "owaspAsvs-4.0",
        owaspTop10_2021: "owaspTop10-2021",
        pciDss_3_2: "pciDss-3.2",
        pciDss_4_0: "pciDss-4.0"
      });

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/hotspots/search", params);
        const structured = outputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // show_hotspot — GET api/hotspots/show
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "show_hotspot",
    {
      title: "Show Security Hotspot",
      description: "Returns the details of a Security Hotspot (api/hotspots/show)",
      inputSchema: showHotspotInput,
      outputSchema: showHotspotOutput,
    },
    async (args: unknown) => {
      const { hotspot } = showHotspotInput.parse(args ?? {});
      const params = { hotspot };

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/hotspots/show", params);
        const structured = showHotspotOutput.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
