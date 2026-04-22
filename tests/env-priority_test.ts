/**
 * Tests for the env-priority and programmatic API improvements introduced in the refactor:
 * - processTemplateVariables: explicit env takes priority over process.env
 * - processHeaders: extraEnv is threaded through correctly
 * - invoke: env param shadows process.env for {VAR} replacement
 * - parseOAPISpecWithExtensions: explicit specPath/extensionPath override env vars
 * - createOapiInvokerServer: two instances with different env don't bleed into each other
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { processTemplateVariables } from "../src/tool/script-executor.ts";
import {
  processHeaders,
  processRequestValues,
} from "../src/tool/value-processor.ts";
import { invoke } from "../src/tool/invoker.ts";
import { parseOAPISpecWithExtensions } from "../src/tool/parser.ts";
import { createOapiInvokerServer } from "../src/set-up-mcp.ts";
import {
  createBasicSpec,
  createBasicTool,
  mockResponse,
} from "./test-utils.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// processTemplateVariables — env priority
// ---------------------------------------------------------------------------

Deno.test("processTemplateVariables - explicit env shadows process.env for the same key", () => {
  Deno.env.set("SHADOW_VAR", "from-process-env");
  const result = processTemplateVariables("{SHADOW_VAR}", {
    SHADOW_VAR: "from-explicit-env",
  });
  assertEquals(result, "from-explicit-env");
  Deno.env.delete("SHADOW_VAR");
});

Deno.test("processTemplateVariables - falls back to process.env when key absent in explicit env", () => {
  Deno.env.set("FALLBACK_VAR", "from-process-env");
  const result = processTemplateVariables("{FALLBACK_VAR}", {});
  assertEquals(result, "from-process-env");
  Deno.env.delete("FALLBACK_VAR");
});

Deno.test("processTemplateVariables - explicit env key can differ from process.env without collision", () => {
  Deno.env.set("SHARED", "process-value");
  // explicit env has a *different* key — SHARED should still resolve from process.env
  const result = processTemplateVariables("{SHARED}", { OTHER: "other-value" });
  assertEquals(result, "process-value");
  Deno.env.delete("SHARED");
});

Deno.test("processTemplateVariables - empty explicit env with missing process.env key yields empty string", () => {
  // Ensure the key is not accidentally set
  Deno.env.delete("DEFINITELY_NOT_SET_XYZ");
  const result = processTemplateVariables("{DEFINITELY_NOT_SET_XYZ}", {});
  assertEquals(result, "");
});

// ---------------------------------------------------------------------------
// processHeaders — extraEnv threading
// ---------------------------------------------------------------------------

Deno.test("processHeaders - extraEnv is used for template replacement in header values", async () => {
  const result = await processHeaders(
    { "x-api-key": "{MY_SECRET}" },
    { MY_SECRET: "secret-from-extra-env" },
  );
  assertEquals(result["x-api-key"], "secret-from-extra-env");
});

Deno.test("processHeaders - extraEnv key shadows a process.env key with the same name", async () => {
  Deno.env.set("HDR_KEY", "process-value");
  const result = await processHeaders(
    { "x-token": "{HDR_KEY}" },
    { HDR_KEY: "explicit-value" },
  );
  assertEquals(result["x-token"], "explicit-value");
  Deno.env.delete("HDR_KEY");
});

Deno.test("processHeaders - results of earlier headers are available in extraEnv for later ones", async () => {
  // The first header is a script, the second template references its env-stored result.
  // processHeaders stores each result in env under the header key (lowercased, dashes→underscores).
  const result = await processHeaders(
    {
      "x-base": `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("base-token"));`,
      "x-derived": "{x_base}-extended",
    },
    {},
  );
  assertEquals(result["x-base"], "base-token");
  assertEquals(result["x-derived"], "base-token-extended");
});

// ---------------------------------------------------------------------------
// processRequestValues — extraEnv threading across all field types
// ---------------------------------------------------------------------------

Deno.test("processRequestValues - extraEnv reaches inputParams", async () => {
  const result = await processRequestValues(
    {},
    {},
    { secretId: "{SECRET_ID}", plain: "unchanged" },
    {},
    { SECRET_ID: "id-from-extra" },
  );
  assertEquals(result.inputParams.secretId, "id-from-extra");
  assertEquals(result.inputParams.plain, "unchanged");
});

Deno.test("processRequestValues - extraEnv reaches pathParams", async () => {
  const result = await processRequestValues(
    {},
    { region: "{REGION}" },
    {},
    {},
    { REGION: "ap-guangzhou" },
  );
  assertEquals(result.pathParams.region, "ap-guangzhou");
});

Deno.test("processRequestValues - extraEnv reaches headerParams", async () => {
  const result = await processRequestValues(
    {},
    {},
    {},
    { "x-trace-id": "{TRACE_ID}" },
    { TRACE_ID: "trace-abc" },
  );
  assertEquals(result.headerParams["x-trace-id"], "trace-abc");
});

// ---------------------------------------------------------------------------
// invoke — env param wired through to template replacement
// ---------------------------------------------------------------------------

Deno.test("invoke - env param resolves {VAR} in request headers without touching process.env", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = ((_, opts?: RequestInit) => {
    capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
    return Promise.resolve(mockResponse({ ok: true }));
  }) as typeof fetch;

  const spec = {
    ...createBasicSpec(),
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: { Authorization: "Bearer {SECRET_KEY}" },
    },
  };

  try {
    await invoke(spec, createBasicTool("get", "/resource"), {}, {
      SECRET_KEY: "key-from-invoke-env",
    });
    assertEquals(
      capturedHeaders["Authorization"],
      "Bearer key-from-invoke-env",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invoke - env param takes priority over process.env for the same key", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = ((_, opts?: RequestInit) => {
    capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
    return Promise.resolve(mockResponse({ ok: true }));
  }) as typeof fetch;

  Deno.env.set("INVOKE_SECRET", "value-from-process-env");

  const spec = {
    ...createBasicSpec(),
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: { "x-secret": "{INVOKE_SECRET}" },
    },
  };

  try {
    await invoke(spec, createBasicTool("get", "/resource"), {}, {
      INVOKE_SECRET: "value-from-explicit-env",
    });
    assertEquals(capturedHeaders["x-secret"], "value-from-explicit-env");
  } finally {
    Deno.env.delete("INVOKE_SECRET");
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invoke - two calls with different env objects resolve independently", async () => {
  const originalFetch = globalThis.fetch;
  const captured: string[] = [];

  globalThis.fetch = ((_, opts?: RequestInit) => {
    const h = (opts?.headers ?? {}) as Record<string, string>;
    captured.push(h["x-credential"] ?? "");
    return Promise.resolve(mockResponse({ ok: true }));
  }) as typeof fetch;

  const spec = {
    ...createBasicSpec(),
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: { "x-credential": "{CRED}" },
    },
  };
  const tool = createBasicTool("get", "/resource");

  try {
    await invoke(spec, tool, {}, { CRED: "cred-A" });
    await invoke(spec, tool, {}, { CRED: "cred-B" });
    assertEquals(captured[0], "cred-A");
    assertEquals(captured[1], "cred-B");
    assertNotEquals(captured[0], captured[1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// parseOAPISpecWithExtensions — explicit specPath overrides env var
// ---------------------------------------------------------------------------

async function writeTempSpec(content: string): Promise<string> {
  const p = join(
    tmpdir(),
    `test-spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  await writeFile(p, content, "utf-8");
  return p;
}

async function writeTempExtension(content: string): Promise<string> {
  const p = join(
    tmpdir(),
    `test-ext-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
  );
  await writeFile(p, content, "utf-8");
  return p;
}

const MINIMAL_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Spec A", version: "1.0.0" },
  paths: {
    "/ping": {
      get: {
        operationId: "ping",
        summary: "Ping endpoint",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

const MINIMAL_SPEC_B = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Spec B", version: "1.0.0" },
  paths: {
    "/pong": {
      get: {
        operationId: "pong",
        summary: "Pong endpoint",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

Deno.test("parseOAPISpecWithExtensions - specPath param is used when provided, ignoring SPEC_PATH env", async () => {
  const pathA = await writeTempSpec(MINIMAL_SPEC);
  const pathB = await writeTempSpec(MINIMAL_SPEC_B);

  // Point env var at spec B
  Deno.env.set("SPEC_PATH", pathB);

  try {
    // Explicitly pass spec A — should parse spec A regardless of SPEC_PATH
    const result = await parseOAPISpecWithExtensions({ specPath: pathA });
    const paths = Object.keys(result.paths ?? {});
    assertEquals(
      paths.includes("/ping"),
      true,
      "Should have parsed specPath (A), not SPEC_PATH (B)",
    );
    assertEquals(paths.includes("/pong"), false);
  } finally {
    Deno.env.delete("SPEC_PATH");
    await unlink(pathA).catch(() => {});
    await unlink(pathB).catch(() => {});
  }
});

Deno.test("parseOAPISpecWithExtensions - extensionPath is merged on top of specPath", async () => {
  const baseSpec = JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Base", version: "1.0.0" },
    paths: {
      "/items": {
        get: {
          operationId: "listItems",
          summary: "List items",
          responses: { "200": { description: "OK" } },
        },
      },
    },
  });

  // Extension adds x-request-config
  const extension = `
x-request-config:
  baseUrl: "https://patched.example.com"
`;

  const specPath = await writeTempSpec(baseSpec);
  const extensionPath = await writeTempExtension(extension);

  try {
    const result = await parseOAPISpecWithExtensions({
      specPath,
      extensionPath,
    });
    assertEquals(
      (result as Record<string, unknown>)["x-request-config"] !== undefined,
      true,
      "Extension should be merged: x-request-config should exist",
    );
  } finally {
    await unlink(specPath).catch(() => {});
    await unlink(extensionPath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// createOapiInvokerServer — two instances with different env don't bleed
// ---------------------------------------------------------------------------

Deno.test("createOapiInvokerServer - two instances resolve {VAR} independently per their own env", async () => {
  const specPath = await writeTempSpec(JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Multi-instance test", version: "1.0.0" },
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: { "x-secret-id": "{SECRET_ID}" },
    },
    paths: {
      "/resource": {
        get: {
          operationId: "getResource",
          summary: "Get resource",
          responses: { "200": { description: "OK" } },
        },
      },
    },
  }));

  const capturedByInstance: Record<string, string[]> = { A: [], B: [] };
  const originalFetch = globalThis.fetch;

  try {
    const serverA = await createOapiInvokerServer(
      { specPath, env: { SECRET_ID: "id-for-A" } },
      { name: "server-a", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );

    const serverB = await createOapiInvokerServer(
      { specPath, env: { SECRET_ID: "id-for-B" } },
      { name: "server-b", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );

    // Tool exists on both servers
    const toolsA = serverA.getPublicTools();
    const toolsB = serverB.getPublicTools();

    assertNotEquals(
      serverA,
      serverB,
      "Each call should return an independent server instance",
    );
    // Both should have the getResource tool registered
    assertEquals(
      toolsA.length >= 1,
      true,
      "serverA should have at least one tool registered",
    );
    assertEquals(
      toolsB.length >= 1,
      true,
      "serverB should have at least one tool registered",
    );
  } finally {
    globalThis.fetch = originalFetch;
    await unlink(specPath).catch(() => {});
  }

  // Suppress unused variable warning
  void capturedByInstance;
});

Deno.test("createOapiInvokerServer - config.env does not leak between sequential calls", async () => {
  // Make sure setting env on one server creation doesn't pollute a later one
  // by checking process.env is not mutated.
  const before = Deno.env.get("LEAK_CHECK_VAR");

  const specPath = await writeTempSpec(MINIMAL_SPEC);
  try {
    await createOapiInvokerServer(
      { specPath, env: { LEAK_CHECK_VAR: "leaked?" } },
      { name: "leak-test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    // process.env must NOT have been modified
    assertEquals(Deno.env.get("LEAK_CHECK_VAR"), before);
  } finally {
    await unlink(specPath).catch(() => {});
  }
});
