import { assertEquals } from "@std/assert";
import { invoke, type InvokeHookContext } from "../src/tool/invoker.ts";
import {
  createBasicSpec,
  createBasicTool,
  createMockFetch,
  mockResponse,
} from "./test-utils.ts";

// ─── Feature A: inputParams exposed as INPUT_* env vars ─────────────────────

Deno.test("sensitive param template resolves INPUT_* from user inputParams", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/api/data");

  // Simulate x-sensitive-params with a template referencing INPUT_APPID
  tool._rawOperation["x-sensitive-params"] = {
    masterkey: "{INPUT_APPID}_secret",
  };
  // Mark masterkey as query param so it appears in URL
  tool._rawOperation.parameters = [
    { name: "appid", in: "query" as const, required: true },
    { name: "masterkey", in: "query" as const, required: true },
  ];

  const params = {
    inputParams: { appid: "myapp" },
  };

  try {
    await invoke(spec, tool, params);
    const url = getCapturedUrl();
    // masterkey should be resolved to "myapp_secret" via INPUT_APPID
    assertEquals(
      url.includes("masterkey=myapp_secret"),
      true,
      `URL was: ${url}`,
    );
    assertEquals(url.includes("appid=myapp"), true, `URL was: ${url}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("sensitive param script can read INPUT_* env vars", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/api/data");

  // Use a shebang script that reads INPUT_APPID from env
  tool._rawOperation["x-sensitive-params"] = {
    masterkey:
      '#!/usr/bin/env node\nprocess.stdout.write("key_" + process.env.INPUT_APPID);',
  };
  tool._rawOperation.parameters = [
    { name: "appid", in: "query" as const, required: true },
    { name: "masterkey", in: "query" as const, required: true },
  ];

  const params = {
    inputParams: { appid: "testapp" },
  };

  try {
    await invoke(spec, tool, params);
    const url = getCapturedUrl();
    assertEquals(
      url.includes("masterkey=key_testapp"),
      true,
      `URL was: ${url}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("INPUT_* vars support number and boolean inputParams", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/api/data");

  tool._rawOperation["x-sensitive-params"] = {
    token: "{INPUT_PORT}_{INPUT_ENABLED}",
  };
  tool._rawOperation.parameters = [
    { name: "port", in: "query" as const },
    { name: "enabled", in: "query" as const },
    { name: "token", in: "query" as const },
  ];

  const params = {
    inputParams: { port: 8080, enabled: true },
  };

  try {
    await invoke(spec, tool, params);
    const url = getCapturedUrl();
    assertEquals(url.includes("token=8080_true"), true, `URL was: ${url}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── Feature B: beforeInvoke hook ───────────────────────────────────────────

Deno.test("beforeInvoke hook can dynamically set sensitiveParams", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/api/data");

  // Start with a placeholder sensitive param
  tool._rawOperation["x-sensitive-params"] = {
    masterkey: "placeholder",
  };
  tool._rawOperation.parameters = [
    { name: "appid", in: "query" as const, required: true },
    { name: "masterkey", in: "query" as const, required: true },
  ];

  const KEYS: Record<string, string> = {
    app1: "secret_for_app1",
    app2: "secret_for_app2",
  };

  const params = {
    inputParams: { appid: "app2" },
  };

  const beforeInvoke = (ctx: InvokeHookContext) => {
    const appid = ctx.inputParams.appid as string;
    ctx.sensitiveParams.masterkey = KEYS[appid] || "unknown";
  };

  try {
    await invoke(spec, tool, params, {}, beforeInvoke);
    const url = getCapturedUrl();
    assertEquals(
      url.includes("masterkey=secret_for_app2"),
      true,
      `URL was: ${url}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("beforeInvoke hook can inject env vars for template resolution", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/api/data");

  // Use a template that references a dynamic env var
  tool._rawOperation["x-sensitive-params"] = {
    masterkey: "{DYNAMIC_KEY}",
  };
  tool._rawOperation.parameters = [
    { name: "appid", in: "query" as const },
    { name: "masterkey", in: "query" as const },
  ];

  const params = {
    inputParams: { appid: "myapp" },
  };

  const beforeInvoke = (ctx: InvokeHookContext) => {
    // Inject a dynamic env var based on inputParams
    ctx.env["DYNAMIC_KEY"] = `resolved_${ctx.inputParams.appid}`;
  };

  try {
    await invoke(spec, tool, params, {}, beforeInvoke);
    const url = getCapturedUrl();
    assertEquals(
      url.includes("masterkey=resolved_myapp"),
      true,
      `URL was: ${url}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("beforeInvoke hook receives correct context fields", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("post", "/api/{id}/action");
  tool._rawOperation["x-sensitive-params"] = { token: "tok" };
  tool._rawOperation.parameters = [
    { name: "id", in: "path" as const, required: true },
  ];

  let capturedCtx: InvokeHookContext | null = null;

  const beforeInvoke = (ctx: InvokeHookContext) => {
    capturedCtx = {
      ...ctx,
      sensitiveParams: { ...ctx.sensitiveParams },
      env: { ...ctx.env },
    };
  };

  const params = {
    pathParams: { id: "123" },
    inputParams: { foo: "bar" },
  };

  try {
    await invoke(spec, tool, params, { STATIC: "val" }, beforeInvoke);

    assertEquals(capturedCtx!.toolName, "test-tool");
    assertEquals(capturedCtx!.method, "post");
    assertEquals(capturedCtx!.inputParams.foo, "bar");
    assertEquals(capturedCtx!.pathParams.id, "123");
    assertEquals(capturedCtx!.sensitiveParams.token, "tok");
    assertEquals(capturedCtx!.env["STATIC"], "val");
    assertEquals(capturedCtx!.env["INPUT_FOO"], "bar");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("no hook — sensitive params still resolve templates from static env", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/api/data");

  tool._rawOperation["x-sensitive-params"] = {
    masterkey: "{MY_SECRET}",
  };
  tool._rawOperation.parameters = [
    { name: "masterkey", in: "query" as const },
  ];

  try {
    // No hook, just static env
    await invoke(spec, tool, {}, { MY_SECRET: "s3cret" });
    const url = getCapturedUrl();
    assertEquals(url.includes("masterkey=s3cret"), true, `URL was: ${url}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("async beforeInvoke hook is awaited", async () => {
  const response = mockResponse({ ok: true });
  const { mockFetch, getCapturedUrl } = createMockFetch(response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  const spec = createBasicSpec();
  const tool = createBasicTool("get", "/api/data");

  tool._rawOperation["x-sensitive-params"] = { key: "placeholder" };
  tool._rawOperation.parameters = [
    { name: "key", in: "query" as const },
  ];

  const beforeInvoke = async (ctx: InvokeHookContext) => {
    // Simulate async lookup
    await new Promise((r) => setTimeout(r, 10));
    ctx.sensitiveParams.key = "async_resolved";
  };

  try {
    await invoke(spec, tool, {}, {}, beforeInvoke);
    const url = getCapturedUrl();
    assertEquals(url.includes("key=async_resolved"), true, `URL was: ${url}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
