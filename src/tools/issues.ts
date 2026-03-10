/**
 * Summary:
 *   Tools to query issues (bugs, vulnerabilities, code smells) with advanced filters.
 *
 * Endpoints:
 *   search_issues → GET api/issues/search
 *     Search for issues with multiple filters and optional facets support.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { buildQueryParams, handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";

// Input schema aligned with SonarQube Web API for api/issues/search
const inputSchema = z
  .object({
    additionalFields: z
      .string()
      .regex(
        /^(_all|comments|languages|rules|ruleDescriptionContextKey|transitions|actions|users)(,(_all|comments|languages|rules|ruleDescriptionContextKey|transitions|actions|users))*$/
      )
      .optional()
      .describe("Campos opcionales a incluir en la respuesta (p.ej., comments,rules,users)"),
    asc: z.boolean().optional().describe("Orden ascendente en el campo de ordenamiento (s)"),
    branch: z.string().min(1).optional().describe("Clave de la rama (branch key)"),
    cleanCodeAttributeCategories: z
      .string()
      .regex(/^(ADAPTABLE|CONSISTENT|INTENTIONAL|RESPONSIBLE)(,(ADAPTABLE|CONSISTENT|INTENTIONAL|RESPONSIBLE))*$/)
      .optional(),
    codeVariants: z.string().optional(),
    components: z.string().optional().describe("Claves de componentes separados por coma (portfolio, proyecto, módulo, directorio o archivo)"),
    cwe: z.string().optional(),
    facets: z.string().optional().describe("Facetas a computar (p.ej., severities,rules,projects,files)"),
    impactSeverities: z
      .string()
      .regex(/^(LOW|MEDIUM|HIGH)(,(LOW|MEDIUM|HIGH))*$/)
      .optional(),
    impactSoftwareQualities: z
      .string()
      .regex(/^(MAINTAINABILITY|RELIABILITY|SECURITY)(,(MAINTAINABILITY|RELIABILITY|SECURITY))*$/)
      .optional(),
    issues: z.string().optional(),
    languages: z.string().optional().describe("Lenguajes separados por coma (p.ej., java,js,py)"),
    onComponentOnly: z.boolean().optional().describe("Solo issues al nivel del componente sin incluir descendientes (requiere components)"),
    owaspAsvs_4_0: z.string().optional(),
    owaspAsvsLevel: z.enum(["1", "2", "3"]).optional(),
    owaspTop10: z.string().optional(),
    owaspTop10_2021: z.string().optional(),
    p: z.number().int().positive().optional().describe("Número de página (1-based)"),
    ps: z.number().int().positive().max(500).optional().describe("Tamaño de página (<= 500)"),
    rules: z.string().optional().describe("Claves de reglas separados por coma en formato <repo>:<regla> (p.ej., java:S1144)"),
    s: z.enum([
      "CREATION_DATE",
      "CLOSE_DATE",
      "SEVERITY",
      "STATUS",
      "FILE_LINE",
      "HOTSPOTS",
      "UPDATE_DATE",
    ]).optional().describe("Campo por el cual ordenar (p.ej., CREATION_DATE, SEVERITY)"),
    severities: z
      .string()
      .regex(/^(INFO|MINOR|MAJOR|CRITICAL|BLOCKER)(,(INFO|MINOR|MAJOR|CRITICAL|BLOCKER))*$/)
      .optional()
      .describe("Severidades separadas por coma (INFO,MINOR,MAJOR,CRITICAL,BLOCKER)"),
    types: z
      .string()
      .regex(/^(CODE_SMELL|BUG|VULNERABILITY)(,(CODE_SMELL|BUG|VULNERABILITY))*$/)
      .optional()
      .describe("Tipos de issue separados por coma (CODE_SMELL,BUG,VULNERABILITY)"),
  })
  .strict();

// Output schema based on example; allow passthrough to be resilient
const outputSchema = z
  .object({
    paging: z.object({
      pageIndex: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
    issues: z.array(
      z
        .object({
          key: z.string(),
          component: z.string().optional(),
          project: z.string().optional(),
          rule: z.string().optional(),
          status: z.string().optional(),
          resolution: z.string().optional(),
          severity: z.string().optional(),
          cleanCodeAttribute: z.string().optional(),
          cleanCodeAttributeCategory: z.string().optional(),
          impacts: z
            .array(
              z.object({
                softwareQuality: z.string(),
                severity: z.string(),
              })
            )
            .optional(),
          message: z.string().optional(),
          line: z.number().int().optional(),
          author: z.string().optional(),
          effort: z.string().optional(),
          creationDate: z.string().optional(),
          updateDate: z.string().optional(),
          tags: z.array(z.string()).optional(),
          type: z.string().optional(),
          comments: z.any().optional(),
          transitions: z.array(z.string()).optional(),
          actions: z.array(z.string()).optional(),
          textRange: z
            .object({
              startLine: z.number().int(),
              endLine: z.number().int(),
              startOffset: z.number().int().optional(),
              endOffset: z.number().int().optional(),
            })
            .optional(),
          flows: z.any().optional(),
          ruleDescriptionContextKey: z.string().optional(),
          codeVariants: z.array(z.string()).optional(),
        })
        .loose()
    ),
    components: z.array(z.any()).optional(),
    rules: z.array(
      z
        .object({
          key: z.string(),
          name: z.string().optional(),
          status: z.string().optional(),
          lang: z.string().optional(),
          langName: z.string().optional(),
        })
        .loose()
    ).optional(),
    users: z.array(
      z
        .object({
          login: z.string(),
          name: z.string().optional(),
          active: z.boolean().optional(),
          avatar: z.string().optional(),
        })
        .loose()
    ).optional(),
  })
  .loose();

export function registerIssuesTools(server: McpServer): void {
  server.registerTool(
    "search_issues",
    {
      title: "Search Issues",
      description: "Search issues (bugs, vulnerabilities, code smells) with optional filters.",
      inputSchema,
      outputSchema,
    },
    async (args: unknown) => {
      const parsed = inputSchema.parse(args ?? {});

      const params = buildQueryParams(parsed, {
        owaspAsvs_4_0: "owaspAsvs-4.0",
        owaspTop10_2021: "owaspTop10-2021"
      });

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/issues/search", params);
        const structured = outputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
