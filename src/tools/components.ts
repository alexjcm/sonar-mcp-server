/**
 * Summary:
 *   Get information of components (file, directory, project, ...) and their descendants and ancestors.
 *
 * Endpoints:
 *   search_components           → GET api/components/tree
 *     Navigates/filters descendants of the base component.
 *     Navigates through components based on the selected strategy.
 *     By limiting the search with the `q` parameter, directories are not returned.
 * 
 *   search_components_catalog   → GET api/components/search
 *     Searches components.
 * 
 *   show_component              → GET api/components/show
 *     Returns a component (file, directory, project, portfolio...) and its ancestors.
 *     The ancestors are ordered from the parent to the root project.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { buildQueryParams, handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";

// Input schema aligned with SonarQube Web API for api/components/tree
const inputSchema = z
  .object({
    component: z.string().min(1).describe("Base component key (project/component key)"),
    branch: z.string().min(1).optional().describe("Branch key"),
    q: z.string().min(3).optional().describe("Filter: names containing, or exact key match"),
    qualifiers: z
      .string()
      .regex(/^(FIL|DIR|TRK|UTS)(,(FIL|DIR|TRK|UTS))*$/)
      .optional()
      .describe("Comma-separated qualifiers: FIL,DIR,TRK,UTS"),
    asc: z.boolean().optional().describe("Ascending sort"),
    p: z.number().int().positive().optional().describe("Page number (1-based)"),
    ps: z
      .number()
      .int()
      .positive()
      .max(500)
      .optional()
      .describe("Page size <= 500"),
    s: z
      .string()
      .regex(/^(name|path|qualifier)(,(name|path|qualifier))*$/)
      .optional()
      .describe("Comma-separated sort fields: name,path,qualifier"),
    strategy: z
      .enum(["children", "all", "leaves"])
      .optional()
      .describe("Search strategy for descendants"),
  })
  .strict();

// Output schema based on example response; allow passthrough for extra fields
const outputSchema = z
  .object({
    paging: z.object({
      pageIndex: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
    baseComponent: z
      .object({
        key: z.string(),
        description: z.string().optional(),
        qualifier: z.string().optional(),
        tags: z.array(z.string()).optional(),
        visibility: z.string().optional(),
      })
      .loose(),
    components: z.array(
      z
        .object({
          key: z.string(),
          name: z.string(),
          qualifier: z.string().optional(),
          path: z.string().optional(),
          language: z.string().optional(),
        })
        .loose()
    ),
  })
  .loose();

// Input schema for api/components/search
const catalogInputSchema = z
  .object({
    qualifiers: z
      .string()
      .regex(/^TRK(,TRK)*$/)
      .describe("Comma-separated qualifiers (only TRK supported by this endpoint)"),
    p: z.number().int().positive().optional().describe("Page number (1-based)"),
    ps: z.number().int().positive().max(500).optional().describe("Page size <= 500"),
    q: z.string().min(1).optional().describe("Filter: names containing, or exact key match"),
  })
  .strict();

// Output schema for api/components/search
const catalogOutputSchema = z
  .object({
    paging: z
      .object({
        pageIndex: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int(),
      })
      .loose(),
    components: z.array(
      z
        .object({
          key: z.string(),
          qualifier: z.string(),
          name: z.string(),
          project: z.string().optional(),
        })
        .loose()
    ),
  })
  .loose();

// Input schema for api/components/show
const showInputSchema = z
  .object({
    component: z.string().min(1).describe("Component key"),
    branch: z.string().min(1).optional().describe("Branch key (not in Community Edition)"),
  })
  .strict();

// Output schema for api/components/show (allow extra fields for resilience)
const showOutputSchema = z
  .object({
    component: z
      .object({
        key: z.string(),
        name: z.string().optional(),
        qualifier: z.string().optional(),
        language: z.string().optional(),
        path: z.string().optional(),
        analysisDate: z.string().optional(),
        leakPeriodDate: z.string().optional(),
        version: z.string().optional(),
      })
      .loose(),
    ancestors: z
      .array(
        z
          .object({
            key: z.string(),
            name: z.string().optional(),
            description: z.string().optional(),
            qualifier: z.string().optional(),
            language: z.string().optional(),
            path: z.string().optional(),
            analysisDate: z.string().optional(),
            leakPeriodDate: z.string().optional(),
            version: z.string().optional(),
            tags: z.array(z.string()).optional(),
            visibility: z.string().optional(),
          })
          .loose()
      )
      .optional(),
  })
  .loose();

export function registerComponentsTools(server: McpServer): void {
  server.registerTool(
    "search_components",
    {
      title: "Search Components (Tree)",
      description:
        "Navigates/filters descendant components of the base component via api/components/tree.",
      inputSchema,
      outputSchema,
    },
    async (args: unknown) => {
      const parsed = inputSchema.parse(args ?? {});
      const params = buildQueryParams(parsed);
      const client = getSonarqubeClient();

      try {
        const data = await client.get<unknown>("api/components/tree", params);
        const structured = outputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );

  server.registerTool(
    "search_components_catalog",
    {
      title: "Search Components (Catalog)",
      description: "Search for components by name or key in the catalog (api/components/search).",
      inputSchema: catalogInputSchema,
      outputSchema: catalogOutputSchema,
    },
    async (args: unknown) => {
      const parsed = catalogInputSchema.parse(args ?? {});
      const params = buildQueryParams(parsed);
      const client = getSonarqubeClient();

      try {
        const data = await client.get<unknown>("api/components/search", params);
        const structured = catalogOutputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );

  server.registerTool(
    "show_component",
    {
      title: "Show Component",
      description: "Returns a component and its ancestors (api/components/show).",
      inputSchema: showInputSchema,
      outputSchema: showOutputSchema,
    },
    async (args: unknown) => {
      const parsed = showInputSchema.parse(args ?? {});
      const params = buildQueryParams(parsed);
      const client = getSonarqubeClient();

      try {
        const data = await client.get<unknown>("api/components/show", params);
        const structured = showOutputSchema.parse(data);
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
