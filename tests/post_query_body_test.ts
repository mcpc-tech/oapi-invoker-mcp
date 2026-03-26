import { assertEquals, assertStringIncludes } from "@std/assert";
import { invoke } from "../src/tool/invoker.ts";
import type { OAPISpecDocument } from "../src/tool/parser.ts";
import type { ExtendedAIToolSchema } from "../src/tool/translator.ts";

Deno.test("invoke - POST with query and body parameters", async () => {
  // Mock OpenAPI spec with a POST endpoint that has both query and body parameters
  const spec: OAPISpecDocument = {
    "x-request-config": {
      baseUrl: "https://httpbin.org",
    },
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {},
  } as unknown as OAPISpecDocument;

  // Mock extended tool with raw operation that has both query and body parameters
  const extendTool: ExtendedAIToolSchema = {
    name: "testPostWithQueryAndBody",
    description: "Test POST with mixed parameters",
    method: "post",
    path: "/post",
    inputSchema: {
      type: "object",
      properties: {
        pathParams: {
          type: "object",
          properties: {},
          required: [],
        },
        inputParams: {
          type: "object",
          properties: {
            // This should go in query string
            filter: { type: "string", description: "Filter parameter" },
            // These should go in request body
            name: { type: "string", description: "User name" },
            age: { type: "number", description: "User age" },
          },
          required: [],
        },
        headerParams: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    _rawOperation: {
      "x-sensitive-params": {},
      parameters: [
        {
          name: "filter",
          in: "query",
          schema: { type: "string" },
        },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "number" },
              },
            },
          },
        },
      },
    },
  };

  // Invoke with both query and body parameters
  const response = await invoke(spec, extendTool, {
    inputParams: {
      filter: "active", // Should go to query string
      name: "John Doe", // Should go to request body
      age: 30, // Should go to request body
    },
  });

  // Verify response
  assertEquals(response.status, 200);

  // Parse the response data (httpbin.org echoes request details)
  const data = response.data as {
    url: string;
    json: { name: string; age: number };
    headers: { "Content-Type": string };
  };

  // Verify query parameters were added to URL
  assertStringIncludes(data.url, "filter=active");

  // Verify body parameters were sent in request body
  assertEquals(data.json.name, "John Doe");
  assertEquals(data.json.age, 30);

  // Verify Content-Type header was set
  assertEquals(data.headers["Content-Type"], "application/json");
});

Deno.test("invoke - POST with only query parameters", async () => {
  const spec: OAPISpecDocument = {
    "x-request-config": {
      baseUrl: "https://httpbin.org",
    },
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {},
  } as unknown as OAPISpecDocument;

  const extendTool: ExtendedAIToolSchema = {
    name: "testPostQueryOnly",
    description: "Test POST with only query parameters",
    method: "post",
    path: "/post",
    inputSchema: {
      type: "object",
      properties: {
        pathParams: { type: "object", properties: {}, required: [] },
        inputParams: {
          type: "object",
          properties: {
            search: { type: "string" },
            limit: { type: "number" },
          },
          required: [],
        },
        headerParams: { type: "object", properties: {}, required: [] },
      },
    },
    _rawOperation: {
      "x-sensitive-params": {},
      parameters: [
        { name: "search", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "number" } },
      ],
    },
  };

  const response = await invoke(spec, extendTool, {
    inputParams: {
      search: "test",
      limit: 10,
    },
  });

  assertEquals(response.status, 200);

  const data = response.data as {
    url: string;
    args: Record<string, unknown>;
    data: string;
  };

  // All parameters should be in query string
  assertStringIncludes(data.url, "search=test");
  assertStringIncludes(data.url, "limit=10");

  // No request body should be sent
  assertEquals(data.data, "");
});

Deno.test("invoke - POST with only body parameters", async () => {
  const spec: OAPISpecDocument = {
    "x-request-config": {
      baseUrl: "https://httpbin.org",
    },
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {},
  } as unknown as OAPISpecDocument;

  const extendTool: ExtendedAIToolSchema = {
    name: "testPostBodyOnly",
    description: "Test POST with only body parameters",
    method: "post",
    path: "/post",
    inputSchema: {
      type: "object",
      properties: {
        pathParams: { type: "object", properties: {}, required: [] },
        inputParams: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: [],
        },
        headerParams: { type: "object", properties: {}, required: [] },
      },
    },
    _rawOperation: {
      "x-sensitive-params": {},
      // No query parameters defined
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
              },
            },
          },
        },
      },
    },
  };

  const response = await invoke(spec, extendTool, {
    inputParams: {
      title: "Test Post",
      content: "This is test content",
    },
  });

  assertEquals(response.status, 200);

  const data = response.data as {
    args: Record<string, unknown>;
    json: { title: string; content: string };
    headers: { "Content-Type": string };
  };

  // No query parameters in URL
  assertEquals(data.args, {});

  // All parameters should be in request body
  assertEquals(data.json.title, "Test Post");
  assertEquals(data.json.content, "This is test content");

  // Verify Content-Type header was set
  assertEquals(data.headers["Content-Type"], "application/json");
});
