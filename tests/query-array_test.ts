import { assertEquals, assertStringIncludes } from "@std/assert";
import type { OpenAPI } from "@scalar/openapi-types";
import { invoke } from "../src/tool/invoker.ts";
import {
  createBasicSpec,
  createBasicTool,
  createMockFetch,
  mockResponse,
} from "./test-utils.ts";

Deno.test("invoke - array query param expands per collectionFormat=multi", async () => {
  const response = mockResponse({ success: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = {
    ...createBasicTool("get", "/test"),
    _rawOperation: {
      "x-sensitive-params": {},
      parameters: [
        { name: "ids[]", in: "query" },
      ] as OpenAPI.Parameter[],
    },
  };

  const params = {
    pathParams: {},
    inputParams: { "ids[]": [1, 2] },
  };

  try {
    const result = await invoke(spec, tool, params);
    assertEquals(result.status, 200);

    const url = getCapturedUrl();
    // Should repeat the key per element (form style, explode=true).
    assertStringIncludes(url, "ids%5B%5D=1");
    assertStringIncludes(url, "ids%5B%5D=2");
    // Must NOT contain the broken JSON-array form.
    assertEquals(url.includes("%5B1%2C2%5D"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
