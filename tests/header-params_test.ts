import { assertEquals } from "@std/assert";
import { invoke } from "../src/tool/invoker.ts";
import {
  createBasicSpec,
  createBasicTool,
  createMockFetch,
  mockResponse,
} from "./test-utils.ts";

Deno.test("header parameters - basic functionality", async () => {
  const response = mockResponse({ success: true });
  const { mockFetch, getCapturedOptions } = createMockFetch(response);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/users");

  // Add header parameters to the tool
  tool._rawOperation.parameters = [
    {
      name: "X-Request-ID",
      in: "header",
      description: "Request tracking ID",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "X-API-Version",
      in: "header",
      description: "API version",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "limit",
      in: "query",
      description: "Limit results",
      schema: { type: "integer" },
    },
  ];

  const params = {
    pathParams: {},
    headerParams: {
      "X-Request-ID": "req-123",
      "X-API-Version": "2023-01-01",
    },
    inputParams: {
      "limit": 10,
    },
  };

  try {
    const result = await invoke(spec, tool, params);

    assertEquals(result.status, 200);

    const headers = getCapturedOptions()?.headers as Record<string, string>;
    assertEquals(headers["X-Request-ID"], "req-123");
    assertEquals(headers["X-API-Version"], "2023-01-01");
    assertEquals(getCapturedOptions()?.method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("header parameters - with dynamic script values", async () => {
  const response = mockResponse({ success: true });
  const { mockFetch, getCapturedOptions } = createMockFetch(response);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/users");

  tool._rawOperation.parameters = [
    {
      name: "X-Timestamp",
      in: "header",
      description: "Current timestamp",
      schema: { type: "string" },
    },
  ];

  const params = {
    pathParams: {},
    headerParams: {
      "X-Timestamp": `#!/usr/bin/env deno
const timestamp = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(timestamp));`,
    },
    inputParams: {},
  };

  try {
    const result = await invoke(spec, tool, params);

    assertEquals(result.status, 200);

    const headers = getCapturedOptions()?.headers as Record<string, string>;
    assertEquals(typeof headers["X-Timestamp"], "string");
    assertEquals(headers["X-Timestamp"].length > 10, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
