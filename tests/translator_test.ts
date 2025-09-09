import { assertEquals, assertExists } from "jsr:@std/assert";
import { openapiToAIToolSchema } from "../src/tool/translator.ts";
import type { OAPISpecDocument } from "../src/tool/parser.ts";

Deno.test("translator - basic OpenAPI conversion", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          "x-sensitive-params": {},
          summary: "Get users",
          operationId: "getUsers",
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);

  assertEquals(result.standardTools.length, 1);
  assertEquals(result.standardTools[0].name, "getUsers"); // Use operationId when available
  assertEquals(result.standardTools[0].method, "GET");
  assertEquals(result.standardTools[0].path, "/users");
});

Deno.test("translator - path parameters extraction", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/users/{id}": {
        get: {
          "x-sensitive-params": {},
          summary: "Get user",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "User ID",
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  assertExists(tool.inputSchema.properties);
  const pathParams = tool.inputSchema.properties.pathParams;
  assertExists(pathParams);
  assertExists((pathParams as Record<string, unknown>).properties);
});

Deno.test("translator - header parameters processing", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/api/data": {
        post: {
          "x-sensitive-params": {},
          summary: "Create data",
          parameters: [
            {
              name: "Authorization",
              in: "header",
              required: true,
              description: "Bearer token",
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  assertExists(tool.inputSchema.properties);
  const headerParams = tool.inputSchema.properties.headerParams;
  assertExists(headerParams);
  assertExists((headerParams as Record<string, unknown>).properties);
});

Deno.test("translator - query parameters processing", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/search": {
        get: {
          "x-sensitive-params": {},
          summary: "Search items",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description: "Search query",
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  assertExists(tool.inputSchema.properties);
  const inputParams = tool.inputSchema.properties.inputParams;
  assertExists(inputParams);
  assertExists((inputParams as Record<string, unknown>).properties);
});

Deno.test("translator - tool name formatting", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    "x-tool-name-format": "{operationId}",
    "x-tool-name-prefix": "api_",
    "x-tool-name-suffix": "_v1",
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          "x-sensitive-params": {},
          operationId: "getUsers",
          summary: "Get users",
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  assertEquals(tool.name, "api_getUsers_v1");
});

Deno.test("translator - template with cleanPath and prefix/suffix independence", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    "x-tool-name-format": "{method}_{cleanPath}",
    "x-tool-name-prefix": "prefix_",
    "x-tool-name-suffix": "_suffix",
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/api/v1/users/{user-id}/posts/{post_id}": {
        get: {
          "x-sensitive-params": {},
          summary: "Get user posts",
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  // Template should use cleanPath: /api/v1/users/{user-id}/posts/{post_id} becomes api_v1_users_user_id_posts_post_id
  // Final result: prefix_ + get_api_v1_users_user_id_posts_post_id + _suffix
  assertEquals(tool.name, "prefix_get_api_v1_users_user_id_posts_post_id_suffix");
});

Deno.test("translator - prefix/suffix without template", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    // No template, should use fallback logic with prefix/suffix
    "x-tool-name-prefix": "pre_",
    "x-tool-name-suffix": "_suf",
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/api/v2/data": {
        post: {
          "x-sensitive-params": {},
          summary: "Create data",
          responses: { "201": { description: "Created" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  // No operationId, so fallback to method_cleanPath with prefix/suffix
  // /api/v2/data becomes api_v2_data
  assertEquals(tool.name, "pre_post_api_v2_data_suf");
});

Deno.test("translator - template with all placeholders", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    "x-tool-name-format": "{method}_{cleanPath}_{operationId}",
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/api/v1/complex-path/{id}": {
        post: {
          "x-sensitive-params": {},
          operationId: "createItem",
          summary: "Create item",
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  // cleanPath: /api/v1/complex-path/{id} becomes api_v1_complex_path_id
  // Template: {method}_{cleanPath}_{operationId} becomes post_api_v1_complex_path_id_createItem
  assertEquals(tool.name, "post_api_v1_complex_path_id_createItem");
});

Deno.test("translator - template only supports safe placeholders", async () => {
  // Test that path parameter is not available in template (only cleanPath should work)
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    // This template should only have access to method, cleanPath, and operationId
    // path parameter should not be available to avoid unsafe characters
    "x-tool-name-format": "{method}_{cleanPath}",
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/api/v1/unsafe-chars/{param-with-dash}": {
        get: {
          "x-sensitive-params": {},
          summary: "Get with unsafe path",
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  // Should use cleanPath which converts unsafe characters to underscores
  assertEquals(tool.name, "get_api_v1_unsafe_chars_param_with_dash");
});

Deno.test("translator - multiple operations create unique tools", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          "x-sensitive-params": {},
          summary: "Get users",
          responses: { "200": { description: "Success" } },
        },
        post: {
          "x-sensitive-params": {},
          summary: "Create user",
          responses: { "201": { description: "Created" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);

  assertEquals(result.standardTools.length, 2);
  assertEquals(result.standardTools[0].name, "get_users"); // Clean fallback format when no operationId
  assertEquals(result.standardTools[1].name, "post_users"); // Clean fallback format when no operationId

  for (const tool of result.standardTools) {
    assertExists(tool.inputSchema.properties);
    assertExists(tool.inputSchema.properties.pathParams);
    assertExists(tool.inputSchema.properties.inputParams);
    assertExists(tool.inputSchema.properties.headerParams);
  }
});

Deno.test("translator - response schema extraction", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          "x-sensitive-params": {},
          summary: "Get users",
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                      },
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

  const result = await openapiToAIToolSchema(spec);
  const extendedTool = result.toolToExtendInfo[result.standardTools[0].name];

  assertExists(extendedTool._responseSchema);
  assertExists(extendedTool._responseSchema["200"]);
});

Deno.test("translator - inputParams schema supports dynamic scripts", async () => {
  const spec: OAPISpecDocument = {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/search": {
        get: {
          "x-sensitive-params": {},
          summary: "Search with encoding",
          description:
            "Search endpoint that supports dynamic URL encoding in inputParams",
          "x-examples": [
            "Use Node.js encodeURIComponent: #!/usr/bin/env node\nprocess.stdout.write(encodeURIComponent('search term'));",
            "Use Deno encoding: #!/usr/bin/env deno\nDeno.stdout.write(new TextEncoder().encode(encodeURIComponent('search term')));",
          ],
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description: "Search query (supports dynamic encoding scripts)",
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Success" } },
        },
      },
    },
  };

  const result = await openapiToAIToolSchema(spec);
  const tool = result.standardTools[0];

  assertExists(tool.description);
  assertEquals(tool.description.includes("encodeURIComponent"), true);
  assertEquals(tool.description.includes("Node.js"), true);
  assertEquals(tool.description.includes("Deno"), true);

  assertExists(tool.inputSchema.properties);
  const inputParams = tool.inputSchema.properties.inputParams;
  assertExists(inputParams);
  assertEquals(
    (inputParams as Record<string, unknown>).description?.toString().includes(
      "Request data",
    ),
    true,
  );
});
