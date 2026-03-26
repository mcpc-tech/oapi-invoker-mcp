import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  executeScript,
  headerKeyToEnvVar,
  processStringValue,
} from "../src/tool/script-executor.ts";

Deno.test("executeScript - runs simple scripts", async () => {
  const script = `#!/usr/bin/env deno
const timestamp = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(timestamp));`;

  const result = await executeScript(script);

  assertEquals(typeof result, "string");
  assertEquals(result.length > 10, true);
  assertEquals(/^\d+$/.test(result), true);
});

Deno.test("executeScript - supports environment variables", async () => {
  const script = `#!/usr/bin/env -S deno run --allow-env
const testVar = Deno.env.get("TEST_VAR") || "default";
Deno.stdout.write(new TextEncoder().encode("value:" + testVar));`;

  const env = { TEST_VAR: "custom-value" };
  const result = await executeScript(script, env);

  assertEquals(result, "value:custom-value");
});

Deno.test("executeScript - handles crypto operations", async () => {
  const script = `#!/usr/bin/env deno
import { encodeHex } from "jsr:@std/encoding/hex";
const data = "test-data";
const hash = encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
Deno.stdout.write(new TextEncoder().encode(hash));`;

  const result = await executeScript(script);

  assertEquals(typeof result, "string");
  assertEquals(result.length, 64);
  assertEquals(/^[a-f0-9]+$/.test(result), true);
});

Deno.test("executeScript - supports node runtime", async () => {
  const script = `#!/usr/bin/env node
process.stdout.write("node-output");`;

  const result = await executeScript(script);
  assertEquals(result, "node-output");
});

Deno.test("processStringValue - replaces template variables", async () => {
  Deno.env.set("TEST_VAR", "replaced-value");

  const value = "prefix_{TEST_VAR}_suffix";
  const result = await processStringValue(value);

  assertEquals(result, "prefix_replaced-value_suffix");

  Deno.env.delete("TEST_VAR");
});

Deno.test("processStringValue - executes scripts", async () => {
  const value = `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("script-output"));`;

  const result = await processStringValue(value);
  assertEquals(result, "script-output");
});

Deno.test("processStringValue - passes through regular strings", async () => {
  const value = "just-a-regular-string";
  const result = await processStringValue(value);
  assertEquals(result, "just-a-regular-string");
});

Deno.test("headerKeyToEnvVar - converts header names", () => {
  assertEquals(headerKeyToEnvVar("x-api-key"), "x_api_key");
  assertEquals(headerKeyToEnvVar("Content-Type"), "content_type");
  assertEquals(headerKeyToEnvVar("X-Custom-Header"), "x_custom_header");
});

Deno.test("executeScript - handles errors", async () => {
  const script = `#!/usr/bin/env deno
throw new Error("Test error");`;

  try {
    await executeScript(script);
    assertEquals(false, true, "Should have thrown an error");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    assertStringIncludes(errorMessage, "Script execution failed");
  }
});
