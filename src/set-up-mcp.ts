import { ComposableMCPServer } from "@mcpc/core";

import { parseOAPISpecWithExtensions } from "./tool/parser.ts";
import { openapiToAIToolSchema } from "./tool/translator.ts";
import { invoke, type InvokerParams } from "./tool/invoker.ts";
import { jsonSchema, type Schema } from "ai";

export const INCOMING_MSG_ROUTE_PATH = "/oapi/messages";

/**
 * Configuration for creating an OAPI Invoker MCP server programmatically.
 * All fields are optional — unset fields fall back to the corresponding
 * environment variables (SPEC_PATH, SPEC_URL, SPEC_EXTENSION_PATH, etc.).
 */
export interface OapiInvokerConfig {
  /** Path to the OpenAPI spec file. Takes priority over SPEC_PATH env var. */
  specPath?: string;
  /** URL of the OpenAPI spec. Takes priority over SPEC_URL env var. */
  specUrl?: string;
  /** Path to the OpenAPI extension/patch file. Takes priority over SPEC_EXTENSION_PATH env var. */
  extensionPath?: string;
  /** URL of the OpenAPI extension/patch. Takes priority over SPEC_EXTENSION_URL env var. */
  extensionUrl?: string;
  /**
   * Extra environment variables used for `{VAR_NAME}` template replacement at
   * invoke time (e.g. credentials). These take priority over process.env.
   */
  env?: Record<string, string>;
}

/**
 * Creates a fully configured MCP server for the given OAPI spec.
 * Each call produces an independent server instance with its own spec and env,
 * enabling multiple servers with different credentials in the same process.
 */
export async function createOapiInvokerServer(
  config: OapiInvokerConfig,
  ...serverArgs: ConstructorParameters<typeof ComposableMCPServer>
): Promise<InstanceType<typeof ComposableMCPServer>> {
  const specification = await parseOAPISpecWithExtensions({
    specPath: config.specPath,
    specUrl: config.specUrl,
    extensionPath: config.extensionPath,
    extensionUrl: config.extensionUrl,
  });

  const { standardTools, toolToExtendInfo } = await openapiToAIToolSchema(
    specification,
  );

  const server = new ComposableMCPServer(...serverArgs);
  const invokeEnv = config.env ?? {};

  standardTools.forEach((tool) => {
    const hasOutputSchema = !!tool.outputSchema;

    server.tool(
      tool.name,
      tool.description ?? "",
      jsonSchema(tool.inputSchema as unknown as Schema),
      async (params, _extra) => {
        const res = await invoke(
          specification,
          toolToExtendInfo[tool.name],
          params as InvokerParams,
          invokeEnv,
        );

        const textContent: Array<{ type: "text"; text: string }> = [
          {
            type: "text" as const,
            text: JSON.stringify(res.data),
          },
        ];

        if (res.debugInfo) {
          textContent.push({
            type: "text" as const,
            text: JSON.stringify({ debug: res.debugInfo }),
          });
        }

        const isSuccess = res.status >= 200 && res.status < 300;

        const result: {
          content: Array<{ type: "text"; text: string }>;
          structuredContent?: unknown;
          isError?: boolean;
        } = {
          content: textContent,
        };

        // MCP requires:
        // - If tool has outputSchema and call is successful → MUST return structuredContent
        // - If tool has outputSchema and call failed → MUST set isError: true
        //   (then structuredContent is optional and won't be validated)
        if (hasOutputSchema) {
          if (isSuccess) {
            result.structuredContent = res.data;
          } else {
            result.isError = true;
          }
        }

        return result;
      },
      {
        internal: false,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      },
    );
  });

  return server;
}

/**
 * @deprecated Use `createOapiInvokerServer` instead.
 * Kept for backward compatibility — reads all config from process.env.
 */
export function setUpMcpServer(
  ...args: ConstructorParameters<typeof ComposableMCPServer>
): Promise<InstanceType<typeof ComposableMCPServer>> {
  return createOapiInvokerServer({}, ...args);
}
