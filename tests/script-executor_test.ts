/**
 * Tests for the script executor functionality
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { executeScript, processStringValue, headerKeyToEnvVar } from "../src/tool/script-executor.ts";

Deno.test("executeScript - simple timestamp script", async () => {
  const script = `#!/usr/bin/env deno
const timestamp = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(timestamp));`;

  const result = await executeScript(script);
  
  assertEquals(typeof result, "string");
  assertEquals(result.length > 10, true); // timestamp should be long
  assertEquals(/^\d+$/.test(result), true); // should be all digits
});

Deno.test("executeScript - script with environment variables", async () => {
  const script = `#!/usr/bin/env -S deno run --allow-env
const testVar = Deno.env.get("TEST_SCRIPT_VAR") || "default";
Deno.stdout.write(new TextEncoder().encode("value:" + testVar));`;

  const env = { TEST_SCRIPT_VAR: "custom-value" };
  const result = await executeScript(script, env);
  
  assertEquals(result, "value:custom-value");
});

Deno.test("executeScript - script with crypto operations", async () => {
  const script = `#!/usr/bin/env deno
import { encodeHex } from "jsr:@std/encoding/hex";
const data = "test-data";
const messageBuffer = new TextEncoder().encode(data);
const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
const hash = encodeHex(hashBuffer);
Deno.stdout.write(new TextEncoder().encode(hash));`;

  const result = await executeScript(script);
  
  assertEquals(typeof result, "string");
  assertEquals(result.length, 64); // SHA-256 hex is 64 characters
  assertEquals(/^[a-f0-9]+$/.test(result), true); // should be hex
});

Deno.test("executeScript - script with math operations", async () => {
  const script = `#!/usr/bin/env deno
const random = Math.random().toString(36).substr(2, 8);
Deno.stdout.write(new TextEncoder().encode("rand_" + random));`;

  const result = await executeScript(script);
  
  assertEquals(typeof result, "string");
  assertStringIncludes(result, "rand_");
  assertEquals(result.length, 13); // "rand_" + 8 characters
});

Deno.test("processStringValue - template variable replacement", async () => {
  Deno.env.set("TEST_TEMPLATE_VAR", "replaced-value");
  
  const value = "prefix_{TEST_TEMPLATE_VAR}_suffix";
  const result = await processStringValue(value);
  
  assertEquals(result, "prefix_replaced-value_suffix");
  
  Deno.env.delete("TEST_TEMPLATE_VAR");
});

Deno.test("processStringValue - multiple template variables", async () => {
  Deno.env.set("VAR1", "first");
  Deno.env.set("VAR2", "second");
  
  const value = "{VAR1}-middle-{VAR2}";
  const result = await processStringValue(value);
  
  assertEquals(result, "first-middle-second");
  
  Deno.env.delete("VAR1");
  Deno.env.delete("VAR2");
});

Deno.test("processStringValue - script execution", async () => {
  const value = `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("script-output"));`;

  const result = await processStringValue(value);
  
  assertEquals(result, "script-output");
});

Deno.test("processStringValue - regular string passthrough", async () => {
  const value = "just-a-regular-string";
  const result = await processStringValue(value);
  
  assertEquals(result, "just-a-regular-string");
});

Deno.test("headerKeyToEnvVar - conversion", () => {
  assertEquals(headerKeyToEnvVar("x-api-key"), "x_api_key");
  assertEquals(headerKeyToEnvVar("Content-Type"), "content_type");
  assertEquals(headerKeyToEnvVar("X-Custom-Header"), "x_custom_header");
  assertEquals(headerKeyToEnvVar("simple"), "simple");
});

Deno.test("processStringValue - env variable from previous processing", async () => {
  const env = { 
    x_timestamp: "1234567890",
    x_api_key: "secret-key"
  };
  
  const value = "data:{x_timestamp}:key:{x_api_key}";
  const result = await processStringValue(value, env);
  
  assertEquals(result, "data:1234567890:key:secret-key");
});

Deno.test("executeScript - error handling", async () => {
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

Deno.test("processStringValue - complex script with dependencies", async () => {
  const env = {
    base_value: "hello"
  };
  
  const value = `#!/usr/bin/env -S deno run --allow-env
const baseValue = Deno.env.get("base_value") || "default";
const result = baseValue.toUpperCase() + "_PROCESSED";
Deno.stdout.write(new TextEncoder().encode(result));`;

  const result = await processStringValue(value, env);
  
  assertEquals(result, "HELLO_PROCESSED");
});
