/**
 * tools/rules.ts
 * Tools to view rules in SonarQube.
 *
 * Tools:
 *  - show_rule → GET api/rules/show
 *     Gets detailed information about a single rule.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { buildQueryParams, handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";
  // ─────────────────────────────────────────────────────────────
  // search_rules — GET api/rules/search
  // ─────────────────────────────────────────────────────────────
  const searchRulesInput = z
    .object({
      activation: z.boolean().optional().describe("Filtra reglas activadas/desactivadas en qprofile (requiere qprofile)"),
      asc: z.boolean().optional().describe("Orden ascendente en el campo de ordenamiento (s)"),
      available_since: z.string().optional().describe("Reglas agregadas desde fecha yyyy-MM-dd"),
      cleanCodeAttributeCategories: z
        .string()
        .regex(/^(ADAPTABLE|CONSISTENT|INTENTIONAL|RESPONSIBLE)(,(ADAPTABLE|CONSISTENT|INTENTIONAL|RESPONSIBLE))*$/)
        .optional(),
      cwe: z.string().optional().describe("CWE IDs separados por coma; usar 'unknown' para sin asociación"),
      f: z.string().optional().describe("Campos adicionales a retornar (CSV), ej: actives,htmlDesc,params"),
      facets: z.string().optional().describe("Facetas a computar (CSV), ej: languages,repositories,tags"),
      impactSeverities: z
        .string()
        .regex(/^(LOW|MEDIUM|HIGH)(,(LOW|MEDIUM|HIGH))*$/)
        .optional(),
      impactSoftwareQualities: z
        .string()
        .regex(/^(MAINTAINABILITY|RELIABILITY|SECURITY)(,(MAINTAINABILITY|RELIABILITY|SECURITY))*$/)
        .optional(),
      include_external: z.boolean().optional().describe("Incluir reglas de motores externos"),
      inheritance: z
        .string()
        .regex(/^(NONE|INHERITED|OVERRIDES)(,(NONE|INHERITED|OVERRIDES))*$/)
        .optional(),
      is_template: z.boolean().optional().describe("Filtrar reglas plantilla (template)"),
      languages: z.string().optional().describe("Lenguajes CSV, ej: java,js"),
      owaspTop10: z.string().optional(),
      owaspTop10_2021: z.string().optional(),
      p: z.number().int().positive().optional().describe("Número de página (1-based)"),
      ps: z.number().int().positive().max(500).optional().describe("Tamaño de página (<= 500)"),
      q: z.string().min(2).optional().describe("Consulta de búsqueda UTF-8 (mín. 2 caracteres)"),
      qprofile: z.string().optional().describe("Quality profile key; relevante con activation/inheritance"),
      repositories: z.string().optional().describe("Repositorios CSV, ej: java,html"),
      rule_key: z.string().optional().describe("Clave exacta de regla a buscar, ej: java:S1144"),
      s: z.enum(["name", "createdAt", "updatedAt", "key"]).optional().describe("Campo de ordenamiento"),
      sonarsourceSecurity: z.string().optional().describe("Categorías de seguridad SonarSource CSV"),
      statuses: z
        .string()
        .regex(/^(BETA|DEPRECATED|READY|REMOVED)(,(BETA|DEPRECATED|READY|REMOVED))*$/)
        .optional(),
      tags: z.string().optional().describe("Tags CSV; la búsqueda hace OR"),
      template_key: z.string().optional().describe("Clave de regla plantilla para filtrar reglas custom"),
    })
    .strict();

  const searchRulesOutput = z
    .object({
      paging: z.object({ pageSize: z.number().int(), total: z.number().int(), pageIndex: z.number().int() }),
      rules: z.array(
        z
          .object({
            key: z.string(),
            repo: z.string().optional(),
            name: z.string().optional(),
            createdAt: z.string().optional(),
            updatedAt: z.string().optional(),
            htmlDesc: z.string().optional(),
            severity: z.string().optional(),
            status: z.string().optional(),
            internalKey: z.string().optional(),
            isTemplate: z.boolean().optional(),
            tags: z.array(z.string()).optional(),
            sysTags: z.array(z.string()).optional(),
            lang: z.string().optional(),
            langName: z.string().optional(),
            scope: z.string().optional(),
            isExternal: z.boolean().optional(),
            type: z.string().optional(),
            cleanCodeAttributeCategory: z.string().optional(),
            cleanCodeAttribute: z.string().optional(),
            impacts: z
              .array(
                z.object({ softwareQuality: z.string(), severity: z.string() })
              )
              .optional(),
            descriptionSections: z
              .array(
                z.object({
                  key: z.string(),
                  content: z.string(),
                  context: z.object({ displayName: z.string().optional(), key: z.string().optional() }).optional(),
                })
              )
              .optional(),
            params: z
              .array(z.object({ key: z.string(), desc: z.string().optional(), defaultValue: z.string().optional() }))
              .optional(),
          })
          .loose()
      ),
      actives: z.record(z.string(), z.array(
        z.object({
          qProfile: z.string(),
          inherit: z.string().optional(),
          severity: z.string().optional(),
          params: z.array(z.object({ key: z.string(), value: z.string().optional() })).optional(),
        }).loose()
      )).optional(),
      facets: z
        .array(
          z.object({
            name: z.string(),
            values: z.array(z.object({ val: z.string(), count: z.number().int() }).loose()),
          }).loose()
        )
        .optional(),
    })
    .loose();

// Input schema for api/rules/show
const showRuleInput = z
  .object({
    key: z
      .string()
      .min(1)
      .describe("Rule key in format <repo>:<rule> (e.g., javascript:EmptyBlock)"),
    actives: z
      .boolean()
      .optional()
      .describe("Include rule activations across all quality profiles"),
  })
  .strict();

// Output schema for api/rules/show
const showRuleOutput = z
  .object({
    rule: z
      .object({
        key: z.string(),
        repo: z.string().optional(),
        name: z.string().optional(),
        htmlDesc: z.string().optional(),
        severity: z.string().optional(),
        status: z.string().optional(),
        internalKey: z.string().optional(),
        template: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        sysTags: z.array(z.string()).optional(),
        remFnType: z.string().optional(),
        remFnGapMultiplier: z.string().optional(),
        remFnBaseEffort: z.string().optional(),
        defaultRemFnType: z.string().optional(),
        defaultRemFnGapMultiplier: z.string().optional(),
        defaultRemFnBaseEffort: z.string().optional(),
        remFnOverloaded: z.boolean().optional(),
        gapDescription: z.string().optional(),
        lang: z.string().optional(),
        langName: z.string().optional(),
        scope: z.string().optional(),
        isExternal: z.boolean().optional(),
        type: z.string().optional(),
        cleanCodeAttributeCategory: z.string().optional(),
        cleanCodeAttribute: z.string().optional(),
        impacts: z
          .array(z.object({ softwareQuality: z.string(), severity: z.string() }))
          .optional(),
        descriptionSections: z
          .array(
            z.object({
              key: z.string(),
              content: z.string(),
              context: z
                .object({ displayName: z.string().optional(), key: z.string().optional() })
                .optional(),
            })
          )
          .optional(),
        params: z
          .array(
            z.object({
              key: z.string(),
              desc: z.string().optional(),
              defaultValue: z.string().optional(),
            })
          )
          .optional(),
      })
      .loose(),
    actives: z
      .array(
        z
          .object({
            qProfile: z.string(),
            inherit: z.string().optional(),
            severity: z.string().optional(),
            params: z
              .array(z.object({ key: z.string(), value: z.string().optional() }))
              .optional(),
          })
          .loose()
      )
      .optional(),
  })
  .loose();

export function registerRulesTools(server: McpServer): void {

  server.registerTool(
    "search_rules",
    {
      title: "Search Rules",
      description: "Search rules with optional filters (api/rules/search)",
      inputSchema: searchRulesInput,
      outputSchema: searchRulesOutput,
    },
    async (args: unknown) => {
      const parsed = searchRulesInput.parse(args ?? {});

      const params = buildQueryParams(parsed, {
        owaspTop10_2021: "owaspTop10-2021"
      });

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/rules/search", params);
        const structured = searchRulesOutput.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // show_rule — GET api/rules/show
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "show_rule",
    {
      title: "Show Rule",
      description: "Gets detailed information about a rule (api/rules/show).",
      inputSchema: showRuleInput,
      outputSchema: showRuleOutput,
    },
    async (args: unknown) => {
      const parsed = showRuleInput.parse(args ?? {});
      const params = buildQueryParams(parsed);

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/rules/show", params);
        const structured = showRuleOutput.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
