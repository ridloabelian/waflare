import type { Env, McpRequest, McpResponse } from "../types.ts";
import type { AgentRuntime } from "../agents/orchestrator.ts";
import { executeMcpTool, MCP_TOOLS } from "./tools.ts";

/**
 * Streamable HTTP JSON-RPC 2.0 MCP server (2025-03-26) supporting dual Read-Only / Read-Write modes.
 */
export async function handleMcpRequest(
  request: Request,
  runtime: AgentRuntime,
  env: Env
): Promise<Response> {
  if (env.MCP_AUTH_TOKEN) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${env.MCP_AUTH_TOKEN}`) {
      return Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized MCP bearer token" } },
        { status: 401 }
      );
    }
  }

  let body: McpRequest;
  try {
    body = (await request.json()) as McpRequest;
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: invalid JSON" } },
      { status: 400 }
    );
  }

  const id = body.id ?? null;
  const readOnlyMode = (env.MCP_READ_ONLY ?? "false").toLowerCase() === "true";

  if (body.method === "initialize") {
    const resp: McpResponse = {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "waflare-mcp",
          version: "1.0.0",
          mode: readOnlyMode ? "read-only" : "read-write"
        }
      }
    };
    return Response.json(resp);
  }

  if (body.method === "ping") {
    return Response.json({ jsonrpc: "2.0", id, result: {} });
  }

  if (body.method === "tools/list") {
    const visibleTools = MCP_TOOLS.map((t) => ({
      name: t.name,
      description: readOnlyMode && !t.readOnly ? `[LOCKED IN READ-ONLY MODE] ${t.description}` : t.description,
      inputSchema: t.inputSchema,
      annotations: {
        readOnlyHint: t.readOnly,
        module: t.module,
        blockedByPolicy: readOnlyMode && !t.readOnly
      }
    }));
    return Response.json({ jsonrpc: "2.0", id, result: { tools: visibleTools } });
  }

  if (body.method === "tools/call") {
    const toolName = String(body.params?.name ?? "");
    const args = (body.params?.arguments as Record<string, unknown> | undefined) ?? {};
    const def = MCP_TOOLS.find((t) => t.name === toolName);

    if (!def) {
      return Response.json(
        { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${toolName}` } },
        { status: 404 }
      );
    }

    if (readOnlyMode && !def.readOnly) {
      return Response.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32003,
            message: `Tool '${toolName}' is blocked because MCP_READ_ONLY=true (finereli read-only safety lock).`
          }
        },
        { status: 403 }
      );
    }

    try {
      const result = await executeMcpTool(toolName, args, runtime, env);
      return Response.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result
        }
      });
    } catch (err) {
      return Response.json(
        {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) }
        },
        { status: 500 }
      );
    }
  }

  return Response.json(
    { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${body.method}` } },
    { status: 404 }
  );
}
