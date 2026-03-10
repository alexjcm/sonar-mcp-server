/**
 * Summary:
 *   Tools to view project branches in SonarQube.
 *
 * Endpoints:
 *   list_project_branches → GET api/project_branches/list
 *     Lists the branches of a project or application.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSonarqubeClient } from "../sonarqube-client.ts";
import { handleMcpError, createMcpSuccessResponse } from "./utils.ts";
import { z } from "zod";

type Branch = {
  name: string;
  isMain?: boolean;
  type?: string;
  status?: { qualityGateStatus?: string };
  analysisDate?: string;
  excludedFromPurge?: boolean;
};

type ProjectBranchesResponse = {
  branches: Branch[];
};

export function registerProjectBranchesTools(server: McpServer): void {
  server.registerTool(
    "list_project_branches",
    {
      title: "List Project Branches",
      description: "List the branches of a project.",
      inputSchema: z.object({
        project: z.string().min(1).describe("Project key"),
      }),
      outputSchema: z.object({
        projectKey: z.string(),
        branches: z.array(
          z.object({
            name: z.string(),
            isMain: z.boolean().nullable(),
            type: z.string().nullable(),
            qualityGateStatus: z.string().nullable(),
            analysisDate: z.string().nullable(),
            excludedFromPurge: z.boolean().nullable(),
          })
        ),
      }),
    },
    async (args: unknown) => {
      const { project: projectKey } = z
        .object({ project: z.string().min(1) })
        .parse(args ?? {});

      const client = getSonarqubeClient();
      try {
        const data = await client.get<ProjectBranchesResponse>(
          "api/project_branches/list",
          { project: projectKey }
        );

        const branches = (data.branches ?? []).map((b) => ({
          name: b.name,
          isMain: Boolean(b.isMain),
          type: b.type ?? null,
          qualityGateStatus: b.status?.qualityGateStatus ?? null,
          analysisDate: b.analysisDate ?? null,
          excludedFromPurge: typeof b.excludedFromPurge === "boolean" ? b.excludedFromPurge : null,
        }));

        const structured = { projectKey, branches };
        return createMcpSuccessResponse(structured);
      } catch (err) {
        return handleMcpError(err);
      }
    }
  );
}
