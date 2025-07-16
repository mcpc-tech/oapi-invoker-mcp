/**
 * Test suite for script executor functionality
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { 
  executeScript, 
  isScript, 
  processTemplateVariables, 
  processStringValue,
  headerKeyToEnvVar 
} from "../src/tool/script-executor.ts";

Deno.test("Script Executor Tests", async (t) => {
  await t.step("isScript - should identify scripts correctly", () => {
    assertEquals(isScript("#!/usr/bin/env deno\nconsole.log('test');"), true);
    assertEquals(isScript("  #!/usr/bin/env deno\nconsole.log('test');"), true);
    assertEquals(isScript("regular string"), false);
    assertEquals(isScript(""), false);
    assertEquals(isScript(null), false);
    assertEquals(isScript(undefined), false);
    assertEquals(isScript(123), false);
  });

  await t.step("processTemplateVariables - should replace template variables", () => {
    // Set test environment variable
    Deno.env.set("TEST_VAR", "test_value");
    
    const result = processTemplateVariables("Hello {TEST_VAR}!");
    assertEquals(result, "Hello test_value!");
    
    // Test with custom env
    const resultWithEnv = processTemplateVariables("Hello {CUSTOM_VAR}!", { CUSTOM_VAR: "custom_value" });
    assertEquals(resultWithEnv, "Hello custom_value!");
    
    // Test with missing variable
    const resultMissing = processTemplateVariables("Hello {MISSING_VAR}!");
    assertEquals(resultMissing, "Hello !");
    
    // Clean up
    Deno.env.delete("TEST_VAR");
  });

  await t.step("headerKeyToEnvVar - should convert header keys to env var format", () => {
    assertEquals(headerKeyToEnvVar("x-rio-timestamp"), "x_rio_timestamp");
    assertEquals(headerKeyToEnvVar("Content-Type"), "content_type");
    assertEquals(headerKeyToEnvVar("authorization"), "authorization");
    assertEquals(headerKeyToEnvVar("X-Custom-Header"), "x_custom_header");
  });

  await t.step("executeScript - should execute simple scripts", async () => {
    const script = `#!/usr/bin/env deno
const message = "Hello from script!";
Deno.stdout.write(new TextEncoder().encode(message));`;

    const result = await executeScript(script);
    assertEquals(result, "Hello from script!");
  });

  await t.step("executeScript - should pass environment variables to scripts", async () => {
    const script = `#!/usr/bin/env -S deno run --allow-env
const value = Deno.env.get("TEST_SCRIPT_VAR") || "default";
Deno.stdout.write(new TextEncoder().encode(value));`;

    const result = await executeScript(script, { TEST_SCRIPT_VAR: "test_value" });
    assertEquals(result, "test_value");
  });

  await t.step("executeScript - should handle script errors", async () => {
    const script = `#!/usr/bin/env deno
throw new Error("Script error!");`;

    await assertRejects(
      () => executeScript(script),
      Error,
      "Script execution failed"
    );
  });

  await t.step("processStringValue - should process regular strings with templates", async () => {
    Deno.env.set("TEST_PROCESS_VAR", "processed_value");
    
    const result = await processStringValue("Value: {TEST_PROCESS_VAR}");
    assertEquals(result, "Value: processed_value");
    
    Deno.env.delete("TEST_PROCESS_VAR");
  });

  await t.step("processStringValue - should execute scripts", async () => {
    const script = `#!/usr/bin/env deno
const timestamp = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(timestamp));`;

    const result = await processStringValue(script);
    // Check that result is a numeric timestamp string
    assertEquals(typeof result, "string");
    assertEquals(isNaN(Number(result)), false);
  });

  await t.step("executeScript - should generate timestamp", async () => {
    const script = `#!/usr/bin/env deno
const timestamp = (Date.now()/1000).toFixed();
Deno.stdout.write(new TextEncoder().encode(timestamp));`;

    const result = await executeScript(script);
    
    // Verify it's a valid timestamp
    const timestamp = Number(result);
    assertEquals(isNaN(timestamp), false);
    assertEquals(timestamp > 0, true);
  });

  await t.step("executeScript - should generate nonce", async () => {
    const script = `#!/usr/bin/env deno
const nonce = Math.random().toString(36).substr(2);
Deno.stdout.write(new TextEncoder().encode(nonce));`;

    const result = await executeScript(script);
    
    // Verify it's a valid nonce (alphanumeric string)
    assertEquals(typeof result, "string");
    assertEquals(result.length > 0, true);
    assertEquals(/^[a-z0-9]+$/.test(result), true);
  });

  await t.step("executeScript - should generate signature using environment variables", async () => {
    const script = `#!/usr/bin/env -S deno run --allow-env
import { encodeHex } from "jsr:@std/encoding/hex";
const timestamp = Deno.env.get("timestamp") || "1234567890";
const data = "test" + timestamp;
const messageBuffer = new TextEncoder().encode(data);
const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
const hash = encodeHex(hashBuffer);
Deno.stdout.write(new TextEncoder().encode(hash));`;

    const result = await executeScript(script, { timestamp: "1234567890" });
    
    // Verify it's a valid SHA-256 hash (64 character hex string)
    assertEquals(typeof result, "string");
    assertEquals(result.length, 64);
    assertEquals(/^[a-f0-9]+$/.test(result), true);
  });
});
