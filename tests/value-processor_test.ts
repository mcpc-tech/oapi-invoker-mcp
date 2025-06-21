/**
 * Tests for the unified processRequestValues function
 */

import { assertEquals } from "jsr:@std/assert";
import { processRequestValues } from "../src/tool/value-processor.ts";

Deno.test("processRequestValues - basic functionality", async () => {
  const headers = {
    "Content-Type": "application/json",
    "x-test": "simple-value"
  };
  
  const pathParams = {
    userId: "123",
    action: "update"
  };
  
  const inputParams = {
    name: "John Doe",
    email: "john@example.com"
  };

  const result = await processRequestValues(headers, pathParams, inputParams);

  assertEquals(result.headers["Content-Type"], "application/json");
  assertEquals(result.headers["x-test"], "simple-value");
  assertEquals(result.pathParams.userId, "123");
  assertEquals(result.pathParams.action, "update");
  assertEquals(result.inputParams.name, "John Doe");
  assertEquals(result.inputParams.email, "john@example.com");
});

Deno.test("processRequestValues - template variables", async () => {
  // Set environment variable for testing
  Deno.env.set("TEST_VAR", "test-value");
  
  const headers = {
    "x-api-key": "{TEST_VAR}",
    "x-static": "static-value"
  };
  
  const pathParams = {
    endpoint: "api/{TEST_VAR}"
  };
  
  const inputParams = {
    token: "{TEST_VAR}",
    data: "normal-data"
  };

  const result = await processRequestValues(headers, pathParams, inputParams);

  assertEquals(result.headers["x-api-key"], "test-value");
  assertEquals(result.headers["x-static"], "static-value");
  assertEquals(result.pathParams.endpoint, "api/test-value");
  assertEquals(result.inputParams.token, "test-value");
  assertEquals(result.inputParams.data, "normal-data");
  
  // Clean up
  Deno.env.delete("TEST_VAR");
});

Deno.test("processRequestValues - script execution", async () => {
  const headers = {
    "x-timestamp": `#!/usr/bin/env deno
const timestamp = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(timestamp));`,
    "x-static": "static-header"
  };
  
  const pathParams = {
    id: "123"
  };
  
  const inputParams = {
    dynamicValue: `#!/usr/bin/env deno
const value = "generated-" + Math.random().toString(36).substr(2, 5);
Deno.stdout.write(new TextEncoder().encode(value));`,
    staticValue: "unchanged"
  };

  const result = await processRequestValues(headers, pathParams, inputParams);

  // Check that script outputs are strings with expected patterns
  assertEquals(typeof result.headers["x-timestamp"], "string");
  assertEquals(result.headers["x-timestamp"].length > 10, true); // timestamp should be long
  assertEquals(result.headers["x-static"], "static-header");
  
  assertEquals(result.pathParams.id, "123");
  
  assertEquals(typeof result.inputParams.dynamicValue, "string");
  assertEquals((result.inputParams.dynamicValue as string).startsWith("generated-"), true);
  assertEquals(result.inputParams.staticValue, "unchanged");
});

Deno.test("processRequestValues - nested objects", async () => {
  const headers = {
    "Content-Type": "application/json"
  };
  
  const pathParams = {
    version: "v1"
  };
  
  const inputParams = {
    user: {
      profile: {
        name: "John",
        settings: {
          theme: "dark",
          script: `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("script-result"));`
        }
      }
    },
    metadata: ["tag1", "tag2"]
  };

  const result = await processRequestValues(headers, pathParams, inputParams);

  assertEquals(result.headers["Content-Type"], "application/json");
  assertEquals(result.pathParams.version, "v1");
  
  const user = result.inputParams.user as Record<string, unknown>;
  const profile = user.profile as Record<string, unknown>;
  const settings = profile.settings as Record<string, unknown>;
  assertEquals(profile.name, "John");
  assertEquals(settings.theme, "dark");
  assertEquals(settings.script, "script-result");
  
  const metadata = result.inputParams.metadata as string[];
  assertEquals(metadata[0], "tag1");
  assertEquals(metadata[1], "tag2");
});

Deno.test("processRequestValues - header env variable passing", async () => {
  const headers = {
    "x-first": `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("first-value"));`,
    "x-second": `#!/usr/bin/env deno
const firstValue = Deno.env.get("x_first") || "not-found";
Deno.stdout.write(new TextEncoder().encode("second-" + firstValue));`
  };
  
  const pathParams = {};
  const inputParams = {};

  const result = await processRequestValues(headers, pathParams, inputParams);

  assertEquals(result.headers["x-first"], "first-value");
  assertEquals(result.headers["x-second"], "second-first-value");
});
