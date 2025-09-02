import { assertEquals } from "jsr:@std/assert";
import { invoke } from "../src/tool/invoker.ts";
import {
  createBasicSpec,
  createBasicTool,
  createMockFetch,
  mockResponse,
} from "./test-utils.ts";

Deno.test("invoke - basic API call", async () => {
  const response = mockResponse({ success: true, message: "test response" });
  const { mockFetch } = createMockFetch(response);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/test");
  const params = { pathParams: {}, inputParams: { message: "hello" } };

  try {
    const result = await invoke(spec, tool, params);

    assertEquals(result.status, 200);
    assertEquals((result.data as { success: boolean }).success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invoke - with template variables", async () => {
  const response = mockResponse({ success: true });
  const { mockFetch, getCapturedOptions } = createMockFetch(response);
  const originalFetch = globalThis.fetch;

  Deno.env.set("API_KEY", "test-api-key");
  Deno.env.set("USER_ID", "user123");

  globalThis.fetch = mockFetch;

  const spec = {
    ...createBasicSpec(),
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: {
        "Authorization": "Bearer {API_KEY}",
        "x-user-id": "{USER_ID}",
      },
    },
  };

  const tool = createBasicTool("get", "/user/{USER_ID}/profile");
  const params = {
    pathParams: { USER_ID: "{USER_ID}" },
    inputParams: {},
  };

  try {
    const result = await invoke(spec, tool, params);

    assertEquals(result.status, 200);

    const headers = getCapturedOptions()?.headers as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer test-api-key");
    assertEquals(headers["x-user-id"], "user123");
  } finally {
    Deno.env.delete("API_KEY");
    Deno.env.delete("USER_ID");
    globalThis.fetch = originalFetch;
  }
});
