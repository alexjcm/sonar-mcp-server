import { SonarqubeApiError } from "../sonarqube-client.ts";

/**
 * Normalizes Zod parsed arguments into string records for the SonarQube API.
 * Converts booleans to "true"/"false" strings and numbers to strings.
 * Applies optional key mapping for parameters that have illegal characters in TS.
 */
export function buildQueryParams(
  parsedArgs: Record<string, unknown>,
  keyMapping?: Record<string, string>
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsedArgs)) {
    if (v === undefined) continue;
    const finalKey = keyMapping?.[k] ?? k;
    if (typeof v === "boolean") {
      params[finalKey] = v ? "true" : "false";
    } else if (typeof v === "string" || typeof v === "number") {
      params[finalKey] = String(v);
    }
  }
  return params;
}

/**
 * Standardizes API and unexpected errors into MCP-compatible error responses.
 */
export function handleMcpError(err: unknown) {
  if (err instanceof SonarqubeApiError) {
    let parsedBody: unknown = undefined;
    try {
      parsedBody = JSON.parse(err.body);
    } catch {
      // JSON.parse failed — fall back to raw body string
    }
    const pretty = parsedBody ? JSON.stringify(parsedBody, null, 2) : err.body;
    return {
      content: [{ type: "text" as const, text: `${err.message}\n${pretty}`.trim() }],
      isError: true,
    };
  }
  const message = `Unexpected error: ${String(err)}`;
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/**
 * Formats a successful JSON response for MCP.
 */
export function createMcpSuccessResponse(structuredData: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: "```json\n" + JSON.stringify(structuredData, null, 2) + "\n```",
      },
    ],
    // The MCP SDK expects structuredContent to be { [x: string]: unknown } or similar, but any valid JSON object is fine.
    structuredContent: structuredData as Record<string, unknown>,
  };
}
