import { assertEquals, assertExists } from "jsr:@std/assert";
import { openapiToAIToolSchema } from "../src/tool/translator.ts";

Deno.test("schema structure - header parameters should be in inputSchema", async () => {
  // Create OpenAPI spec with different parameter types
  const spec = {
    "x-sensitive-params": {},
    openapi: "3.1.0" as const,
    info: {
      title: "Test API",
      version: "1.0.0",
    },
    paths: {
      "/users/{id}": {
        get: {
          "x-sensitive-params": {},
          summary: "Get user by ID",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "User ID",
              schema: {
                type: "string",
              },
            },
            {
              name: "X-Request-ID",
              in: "header",
              description: "Request tracking ID",
              schema: {
                type: "string",
              },
            },
            {
              name: "Authorization",
              in: "header",
              required: true,
              description: "Bearer token",
              schema: {
                type: "string",
              },
            },
            {
              name: "limit",
              in: "query",
              description: "Limit results",
              schema: {
                type: "integer",
              },
            },
          ],
          responses: {
            "200": {
              description: "Success",
            },
          },
        },
      },
    },
  };

  // deno-lint-ignore no-explicit-any
  const result = await openapiToAIToolSchema(spec as any);

  // Should have one tool
  assertEquals(result.standardTools.length, 1);

  const tool = result.standardTools[0];
  const schema = tool.inputSchema;

  console.log("📋 Complete inputSchema structure:");
  console.log(JSON.stringify(schema, null, 2));

  // Check basic structure
  assertExists(schema.properties, "Schema should have properties");

  // Check pathParams
  assertExists(schema.properties.pathParams, "Should have pathParams");
  // deno-lint-ignore no-explicit-any
  const pathParams = schema.properties.pathParams as any;
  assertEquals(
    pathParams.properties?.id?.type,
    "string",
    "Path parameter should be included",
  );

  // Check inputParams (should contain both query and header parameters)
  assertExists(schema.properties.inputParams, "Should have inputParams");
  // deno-lint-ignore no-explicit-any
  const inputParams = schema.properties.inputParams as any;

  console.log("📋 inputParams properties:");
  console.log(JSON.stringify(inputParams.properties, null, 2));

  // Verify header parameters are now in headerParams (not inputParams)
  assertExists(
    tool.inputSchema.properties?.headerParams,
    "Should have headerParams property",
  );

  // deno-lint-ignore no-explicit-any
  const headerParams = tool.inputSchema.properties.headerParams as any;

  assertExists(
    headerParams.properties?.["X-Request-ID"],
    "Header parameter X-Request-ID should be in headerParams",
  );
  assertExists(
    headerParams.properties?.Authorization,
    "Header parameter Authorization should be in headerParams",
  );

  // Verify query parameters are in inputParams
  assertExists(
    inputParams.properties?.limit,
    "Query parameter limit should be in inputParams",
  );

  // Check required parameters for headers
  const requiredHeaders = headerParams.required || [];
  console.log("📋 Required headers:", requiredHeaders);

  // Authorization header should be required
  assertEquals(
    requiredHeaders.includes("Authorization"),
    true,
    "Required header parameter should be in headerParams required array",
  );
});

Deno.test("schema structure - should distinguish parameter types in descriptions", async () => {
  const spec = {
    "x-sensitive-params": {},
    openapi: "3.1.0" as const,
    info: {
      title: "Test API",
      version: "1.0.0",
    },
    paths: {
      "/test": {
        post: {
          "x-sensitive-params": {},
          parameters: [
            {
              name: "Content-Type",
              in: "header",
              description: "Content type header",
              schema: { type: "string" },
            },
            {
              name: "filter",
              in: "query",
              description: "Filter query parameter",
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };

  // deno-lint-ignore no-explicit-any
  const result = await openapiToAIToolSchema(spec as any);
  const tool = result.standardTools[0];
  // deno-lint-ignore no-explicit-any
  const headerParams = tool.inputSchema.properties?.headerParams as any;

  console.log("📋 Header parameter descriptions:");
  if (headerParams?.properties) {
    for (const [name, param] of Object.entries(headerParams.properties)) {
      // deno-lint-ignore no-explicit-any
      console.log(`  ${name}: ${(param as any).description}`);
    }
  }

  // deno-lint-ignore no-explicit-any
  const inputParams = tool.inputSchema.properties?.inputParams as any;
  console.log("📋 Query parameter descriptions:");
  if (inputParams?.properties) {
    for (const [name, param] of Object.entries(inputParams.properties)) {
      // deno-lint-ignore no-explicit-any
      console.log(`  ${name}: ${(param as any).description}`);
    }
  }

  // Header parameter should be in headerParams
  assertExists(
    headerParams?.properties?.["Content-Type"],
    "Header param should exist in headerParams",
  );
  // Query parameter should be in inputParams
  assertExists(
    inputParams?.properties?.filter,
    "Query param should exist in inputParams",
  );
});
