/**
 * E2E tests using the official MCP Client SDK to connect to the OAPI Invoker
 * server over an in-memory transport.
 *
 * By default uses a local mock OpenAPI spec so tests are fast and deterministic.
 * Set E2E_SPEC_PATH or E2E_SPEC_URL to override with a real spec.
 *
 * Run with:
 *   deno test -A tests/e2e/mcp-client_test.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createOapiInvokerServer } from "../../src/set-up-mcp.ts";

const MOCK_SPEC = {
  openapi: "3.0.0",
  info: { title: "Mock API", version: "1.0.0" },
  servers: [{ url: "https://httpbin.org" }],
  paths: {
    "/get": {
      get: {
        operationId: "httpbinGet",
        summary: "Simple GET",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    origin: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/status/418": {
      get: {
        operationId: "httpbinTeapot",
        summary: "Always returns 418",
        responses: {
          "418": {
            description: "I'm a teapot",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

let tempSpecPath: string | undefined;

async function prepareSpec(): Promise<{ specPath?: string; specUrl?: string }> {
  const envPath = Deno.env.get("E2E_SPEC_PATH");
  const envUrl = Deno.env.get("E2E_SPEC_URL");
  if (envPath || envUrl) {
    return { specPath: envPath ?? undefined, specUrl: envUrl ?? undefined };
  }

  const tmpFile = await Deno.makeTempFile({ suffix: ".json" });
  await Deno.writeTextFile(tmpFile, JSON.stringify(MOCK_SPEC));
  tempSpecPath = tmpFile;
  return { specPath: tmpFile };
}

async function setupClient() {
  const { specPath, specUrl } = await prepareSpec();

  const server = await createOapiInvokerServer(
    { specPath, specUrl },
    { name: "e2e-test-server", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );

  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();

  // Start server in background
  // deno-lint-ignore no-explicit-any
  const serverPromise = (server as any).connect(serverTransport);

  // Create and connect client
  const client = new Client({ name: "e2e-test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return { client, server, serverPromise };
}

// Clean up temp file after all tests
Deno.test({
  name: "e2e cleanup",
  fn: async () => {
    if (tempSpecPath) {
      try {
        await Deno.remove(tempSpecPath);
      } catch {
        // ignore
      }
    }
  },
});

Deno.test({
  name:
    "e2e - MCP client receives structuredContent for successful calls with outputSchema",
  fn: async () => {
    const { client } = await setupClient();

    const tools = await client.listTools();
    assertEquals(tools.tools.length > 0, true);

    // Find a tool that has outputSchema and no required path parameters.
    // httpbinGet (GET /get) fits: no params, returns 200 with object schema.
    // deno-lint-ignore no-explicit-any
    const structuredTool = tools.tools.find((t: any) =>
      t.outputSchema &&
      !t.inputSchema?.properties?.pathParams?.required?.length &&
      t.name === "httpbinGet"
    );

    // Skip if no such tool is exposed by the spec under test
    if (!structuredTool) {
      console.log(
        "No tool with outputSchema found, skipping structuredContent test",
      );
      return;
    }

    const result = await client.callTool({
      name: structuredTool.name,
      arguments: {},
    });

    assertExists(result);
    assertExists(result.content);

    // Verify structuredContent is present because the call succeeded (2xx)
    // and the tool defines an outputSchema.
    // deno-lint-ignore no-explicit-any
    const extendedResult = result as Record<string, any>;
    assertExists(
      extendedResult.structuredContent,
      "Successful call to a tool with outputSchema should return structuredContent",
    );
    assertEquals(
      typeof extendedResult.structuredContent,
      "object",
      "structuredContent should be an object",
    );

    // Verify text content is still present as fallback
    const textItems = result.content.filter((item: { type: string }) =>
      item.type === "text"
    );
    assertEquals(textItems.length > 0, true);
  },
});

Deno.test({
  name: "e2e - MCP client can list tools and inspect descriptions",
  fn: async () => {
    const { client } = await setupClient();

    const tools = await client.listTools();
    assertExists(tools.tools);
    assertEquals(
      tools.tools.length > 0,
      true,
      "Server should expose at least one tool",
    );

    const firstTool = tools.tools[0];
    assertExists(firstTool.name, "Tool should have a name");
    assertExists(firstTool.description, "Tool should have a description");
    assertExists(
      firstTool.inputSchema,
      "Tool should expose inputSchema to the client",
    );

    // Verify the schema contains the standard param groups
    // deno-lint-ignore no-explicit-any
    const schema = firstTool.inputSchema as Record<string, any>;
    assertEquals(schema.type, "object");
    assertExists(
      schema.properties?.pathParams,
      "Schema should contain pathParams",
    );
    assertExists(
      schema.properties?.inputParams,
      "Schema should contain inputParams",
    );
    assertExists(
      schema.properties?.headerParams,
      "Schema should contain headerParams",
    );

    // Verify structured output: if outputSchema is present, it should be a valid object schema
    if (firstTool.outputSchema) {
      // deno-lint-ignore no-explicit-any
      const outputSchema = firstTool.outputSchema as Record<string, any>;
      assertEquals(
        typeof outputSchema,
        "object",
        "outputSchema should be an object",
      );
      assertExists(
        outputSchema.type,
        "outputSchema should declare a type (e.g., object)",
      );
    }
  },
});

Deno.test({
  name: "e2e - MCP client can call a tool and receive content",
  fn: async () => {
    const { client } = await setupClient();

    const tools = await client.listTools();
    assertEquals(tools.tools.length > 0, true);

    // Pick httpbinGet (no params, no outputSchema) for a reliable smoke test.
    // deno-lint-ignore no-explicit-any
    const simpleTool = tools.tools.find((t: any) => t.name === "httpbinGet");
    const targetTool = simpleTool ?? tools.tools[0];

    const result = await client.callTool({
      name: targetTool.name,
      arguments: {},
    });

    assertExists(result);
    assertExists(result.content);
    assertEquals(Array.isArray(result.content), true);

    // Content should contain at least one text element
    const textItems = result.content.filter((item: { type: string }) =>
      item.type === "text"
    );
    assertEquals(
      textItems.length > 0,
      true,
      "Tool result should contain text content",
    );

    // Verify the text content is valid structured JSON
    const firstText = textItems[0].text;
    let parsed: unknown;
    try {
      parsed = JSON.parse(firstText);
    } catch {
      throw new Error(
        `Tool result text content is not valid JSON: ${
          firstText.slice(0, 200)
        }`,
      );
    }
    assertEquals(
      typeof parsed === "object" && parsed !== null,
      true,
      "Parsed tool result should be a non-null object (structured output)",
    );

    // If the server exposes outputSchema, the result may also include structuredContent
    // deno-lint-ignore no-explicit-any
    const extendedResult = result as Record<string, any>;
    if (
      targetTool.outputSchema &&
      extendedResult.structuredContent !== undefined
    ) {
      assertEquals(
        typeof extendedResult.structuredContent,
        "object",
        "structuredContent should be present when outputSchema is defined",
      );
    }
  },
});
