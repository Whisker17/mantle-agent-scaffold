import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonSchema, tool, type ToolSet } from "ai";

interface McpToolSchema {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
  [key: string]: unknown;
}

interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: McpToolSchema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function normalizeMcpResult(result: unknown): unknown {
  if (!isRecord(result)) {
    return result;
  }

  if ("toolResult" in result) {
    return result.toolResult;
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const normalizedContent = content.map((part) => {
    if (!isRecord(part)) {
      return part;
    }

    if (part.type === "text" && typeof part.text === "string") {
      return parseMaybeJsonText(part.text);
    }

    return part;
  });

  const compactedContent =
    normalizedContent.length === 1 ? normalizedContent[0] : normalizedContent;

  return {
    is_error: result.isError === true,
    content: compactedContent,
    structured_content: isRecord(result.structuredContent) ? result.structuredContent : null
  };
}

function normalizeSchema(schema: McpToolSchema): McpToolSchema {
  return {
    ...schema,
    type: "object",
    properties: schema.properties ?? {},
    required: Array.isArray(schema.required) ? schema.required : []
  };
}

export function convertToAiSdkTools(
  mcpTools: McpToolDefinition[],
  client: Client
): ToolSet {
  return Object.fromEntries(
    mcpTools.map((mcpTool) => [
      mcpTool.name,
      tool({
        description: mcpTool.description ?? "",
        inputSchema: jsonSchema(normalizeSchema(mcpTool.inputSchema) as never),
        execute: async (args: unknown) => {
          const callResult = await client.callTool({
            name: mcpTool.name,
            arguments: isRecord(args) ? args : {}
          });

          return normalizeMcpResult(callResult);
        }
      })
    ])
  );
}
