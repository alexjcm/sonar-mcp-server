/**
 * Summary:
 *   Tools to query components or their children with specified metrics.
 *
 * Endpoints:
 *   get_component_measures      → GET api/measures/component
 *     Returns a component with the specified metrics.
 * 
 *   get_component_tree_measures → GET api/measures/component_tree
 *     Navigates through components based on the selected strategy with the specified metrics.
 *     By limiting the search with the `q` parameter, directories are not returned.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { buildQueryParams, handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";

// Input schema for api/measures/component
const inputSchema = z
  .object({
    component: z.string().min(1).describe("Clave del componente (proyecto, módulo, directorio o archivo)"),
    metricKeys: z
      .string()
      .min(1)
      .describe("Claves de métricas separadas por coma (p.ej., ncloc,complexity,violations)"),
    additionalFields: z
      .string()
      .regex(/^(metrics|period)(,(metrics|period))*$/)
      .optional()
      .describe("Campos adicionales a incluir: metrics, period"),
    branch: z.string().min(1).optional().describe("Clave de la rama (branch key)"),
  })
  .strict();

// Output schema based on the example; allow loose to be resilient to API changes
const outputSchema = z
  .object({
    component: z
      .object({
        key: z.string(),
        name: z.string().optional(),
        qualifier: z.string().optional(),
        language: z.string().optional(),
        path: z.string().optional(),
        measures: z
          .array(
            z
              .object({
                metric: z.string(),
                value: z.string().optional(),
                period: z
                  .object({
                    value: z.string().optional(),
                    bestValue: z.boolean().optional(),
                  })
                  .loose()
                  .optional(),
              })
              .loose()
          )
          .optional(),
      })
      .loose(),
    metrics: z
      .array(
        z
          .object({
            key: z.string(),
            name: z.string().optional(),
            description: z.string().optional(),
            domain: z.string().optional(),
            type: z.string().optional(),
            higherValuesAreBetter: z.boolean().optional(),
            qualitative: z.boolean().optional(),
            hidden: z.boolean().optional(),
          })
          .loose()
      )
      .optional(),
    period: z
      .object({
        mode: z.string().optional(),
        date: z.string().optional(),
        parameter: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

// Input schema for api/measures/component_tree
const componentTreeInputSchema = z
  .object({
    component: z.string().min(1).describe("Base component key (project/module/directory/file)"),
    metricKeys: z
      .string()
      .min(1)
      .refine((s) => s.split(",").filter(Boolean).length <= 15, {
        message: "metricKeys cannot have more than 15 metrics",
      })
      .describe("Comma-separated metric keys (max 15). DATA/DISTRIB types not allowed"),
    additionalFields: z
      .string()
      .regex(/^(metrics|period)(,(metrics|period))*$/)
      .optional()
      .describe("Additional fields to include: metrics, period"),
    asc: z.union([z.boolean(), z.enum(["true", "false", "yes", "no"])]).optional().describe("Ascending order"),
    branch: z.string().min(1).optional().describe("Branch key"),
    metricPeriodSort: z.union([z.literal(1), z.literal("1")]).optional().describe("Sort measures by leak period; requires s=metricPeriod"),
    metricSort: z.string().min(1).optional().describe("Metric to sort by; must be included in metricKeys"),
    metricSortFilter: z
      .enum(["all", "withMeasuresOnly"]).optional()
      .describe("Filter components when sorting by metric"),
    p: z.number().int().min(1).optional().describe("Page number (1-based)"),
    ps: z.number().int().min(1).max(500).optional().describe("Page size (1..500)"),
    q: z.string().min(3).optional().describe("Filter by name contains or exact key (min 3)"),
    qualifiers: z
      .string()
      .regex(/^(FIL|DIR|TRK|UTS)(,(FIL|DIR|TRK|UTS))*$/)
      .optional()
      .describe("Comma-separated qualifier codes: FIL,DIR,TRK,UTS"),
    s: z
      .string()
      .regex(/^(metric|metricPeriod|name|path|qualifier)(,(metric|metricPeriod|name|path|qualifier))*$/)
      .optional()
      .describe("Sort fields: metric,metricPeriod,name,path,qualifier"),
    strategy: z.enum(["all", "children", "leaves"]).optional().describe("Descendant navigation strategy"),
  })
  .strict();

// Output schema for api/measures/component_tree (based on example, loose to allow extra fields)
const componentTreeOutputSchema = z
  .object({
    paging: z
      .object({ pageIndex: z.number(), pageSize: z.number(), total: z.number() })
      .loose()
      .optional(),
    baseComponent: z
      .object({
        key: z.string(),
        name: z.string().optional(),
        qualifier: z.string().optional(),
        language: z.string().optional(),
        path: z.string().optional(),
        measures: z
          .array(
            z
              .object({
                metric: z.string(),
                value: z.string().optional(),
                period: z.object({ value: z.string().optional() }).loose().optional(),
              })
              .loose()
          )
          .optional(),
      })
      .loose()
      .optional(),
    components: z
      .array(
        z
          .object({
            key: z.string(),
            name: z.string().optional(),
            qualifier: z.string().optional(),
            language: z.string().optional(),
            path: z.string().optional(),
            measures: z
              .array(
                z
                  .object({
                    metric: z.string(),
                    value: z.string().optional(),
                    period: z.object({ value: z.string().optional() }).loose().optional(),
                  })
                  .loose()
              )
              .optional(),
          })
          .loose()
      )
      .optional(),
    metrics: z
      .array(
        z
          .object({
            key: z.string(),
            name: z.string().optional(),
            description: z.string().optional(),
            domain: z.string().optional(),
            type: z.string().optional(),
            higherValuesAreBetter: z.boolean().optional(),
            qualitative: z.boolean().optional(),
            hidden: z.boolean().optional(),
            bestValue: z.string().optional(),
          })
          .loose()
      )
      .optional(),
    period: z
      .object({ mode: z.string().optional(), date: z.string().optional(), parameter: z.string().optional() })
      .loose()
      .optional(),
  })
  .loose();

export function registerMeasuresTools(server: McpServer): void {
  server.registerTool(
    "get_component_measures",
    {
      title: "Get Component Measures",
      description: "Returns a component with the requested metrics (api/measures/component)",
      inputSchema,
      outputSchema,
    },
    async (args: unknown) => {
      const parsed = inputSchema.parse(args ?? {});
      const params = buildQueryParams(parsed);

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/measures/component", params);
        const structured = outputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );


  server.registerTool(
    "get_component_tree_measures",
    {
      title: "Get Component Tree Measures",
      description:
        "Navigates descendants of the base component and returns measures by component (api/measures/component_tree)",
      inputSchema: componentTreeInputSchema,
      outputSchema: componentTreeOutputSchema,
    },
    async (args: unknown) => {
      const parsed = componentTreeInputSchema.parse(args ?? {});
      const params = buildQueryParams(parsed);

      const client = getSonarqubeClient();
      try {
        const data = await client.get<unknown>("api/measures/component_tree", params);
        const structured = componentTreeOutputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
