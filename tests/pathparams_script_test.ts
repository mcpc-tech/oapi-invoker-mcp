import { assertEquals } from "@std/assert";
import { invoke } from "../src/tool/invoker.ts";
import type { OAPISpecDocument } from "../src/tool/parser.ts";
import type { ExtendedAIToolSchema } from "../src/tool/translator.ts";

let capturedUrl = "";

const originalFetch = globalThis.fetch;

globalThis.fetch = ((url: RequestInfo | URL) => {
  capturedUrl = url.toString();
  return Promise.resolve(
    new Response('{"success": true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}) as typeof fetch;

function createTestSpec(): OAPISpecDocument {
  return {
    "x-sensitive-params": {},
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    servers: [{ url: "https://api.test.com" }],
    paths: {},
  };
}

function createTestTool(path: string): ExtendedAIToolSchema {
  return {
    name: "test-tool",
    description: "Test tool",
    method: "GET",
    path,
    inputSchema: {
      type: "object",
      properties: {
        pathParams: { type: "object", properties: {}, required: [] },
        inputParams: { type: "object", properties: {}, required: [] },
        headerParams: { type: "object", properties: {}, required: [] },
      },
      required: [],
    },
  };
}

Deno.test("pathParams executes scripts correctly", async () => {
  const script =
    "#!/usr/bin/env node\nprocess.stdout.write(encodeURIComponent('TCBTeam/agents'))";

  await invoke(
    createTestSpec(),
    createTestTool("/projects/{id_or_path}/tags/{tag}"),
    {
      pathParams: {
        id_or_path: script,
        tag: "v1.0.0",
      },
    },
  );

  const expected = "TCBTeam%2Fagents";
  assertEquals(
    capturedUrl.includes(`/projects/${expected}/tags/v1.0.0`),
    true,
    `URL should contain encoded value: ${expected}`,
  );
});

Deno.test("pathParams handles mixed script and static values", async () => {
  const script =
    "#!/usr/bin/env node\nprocess.stdout.write(encodeURIComponent('My Project'))";

  await invoke(
    createTestSpec(),
    createTestTool("/users/{user_id}/projects/{name}"),
    {
      pathParams: {
        user_id: "123",
        name: script,
      },
    },
  );

  const expected = "My%20Project";
  assertEquals(
    capturedUrl.includes(`/users/123/projects/${expected}`),
    true,
    `URL should contain both static and encoded values`,
  );
});

// Restore original fetch after all tests
Deno.test({
  name: "cleanup - restore fetch",
  fn: () => {
    globalThis.fetch = originalFetch;
  },
});
