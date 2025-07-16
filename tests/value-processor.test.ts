/**
 * Test suite for value processor functionality
 */

import { assertEquals } from "jsr:@std/assert";
import { 
  processValue, 
  processHeaders, 
  processPathParams, 
  processInputParams 
} from "../src/tool/value-processor.ts";

Deno.test("Value Processor Tests", async (t) => {
  await t.step("processValue - should handle string values", async () => {
    const result = await processValue("simple string");
    assertEquals(result, "simple string");
  });

  await t.step("processValue - should handle template variables in strings", async () => {
    Deno.env.set("TEST_VALUE_VAR", "test_result");
    
    const result = await processValue("Value: {TEST_VALUE_VAR}");
    assertEquals(result, "Value: test_result");
    
    Deno.env.delete("TEST_VALUE_VAR");
  });

  await t.step("processValue - should handle arrays", async () => {
    const input = ["string1", "string2", "{TEST_ARRAY_VAR}"];
    Deno.env.set("TEST_ARRAY_VAR", "replaced");
    
    const result = await processValue(input) as string[];
    assertEquals(result, ["string1", "string2", "replaced"]);
    
    Deno.env.delete("TEST_ARRAY_VAR");
  });

  await t.step("processValue - should handle objects", async () => {
    const input = {
      key1: "value1",
      key2: "{TEST_OBJECT_VAR}",
      nested: {
        nestedKey: "nested_{TEST_OBJECT_VAR}"
      }
    };
    
    Deno.env.set("TEST_OBJECT_VAR", "replaced");
    
    const result = await processValue(input) as Record<string, unknown>;
    assertEquals(result.key1, "value1");
    assertEquals(result.key2, "replaced");
    assertEquals((result.nested as Record<string, unknown>).nestedKey, "nested_replaced");
    
    Deno.env.delete("TEST_OBJECT_VAR");
  });

  await t.step("processValue - should handle scripts in objects", async () => {
    const input = {
      normalValue: "test",
      scriptValue: `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("script_result"));`
    };
    
    const result = await processValue(input) as Record<string, unknown>;
    assertEquals(result.normalValue, "test");
    assertEquals(result.scriptValue, "script_result");
  });

  await t.step("processHeaders - should process headers in order", async () => {
    const headers = {
      "x-timestamp": `#!/usr/bin/env deno
const ts = "1234567890";
Deno.stdout.write(new TextEncoder().encode(ts));`,
      "x-signature": `#!/usr/bin/env -S deno run --allow-env
const timestamp = Deno.env.get("x_timestamp") || "unknown";
const result = "sig_" + timestamp;
Deno.stdout.write(new TextEncoder().encode(result));`
    };
    
    const result = await processHeaders(headers);
    assertEquals(result["x-timestamp"], "1234567890");
    assertEquals(result["x-signature"], "sig_1234567890");
  });

  await t.step("processHeaders - should handle template variables", async () => {
    Deno.env.set("TEST_HEADER_VAR", "header_value");
    
    const headers = {
      "content-type": "application/json",
      "authorization": "Bearer {TEST_HEADER_VAR}"
    };
    
    const result = await processHeaders(headers);
    assertEquals(result["content-type"], "application/json");
    assertEquals(result["authorization"], "Bearer header_value");
    
    Deno.env.delete("TEST_HEADER_VAR");
  });

  await t.step("processPathParams - should process path parameters", async () => {
    const pathParams = {
      id: "123",
      type: "{PATH_TYPE}",
      dynamic: `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("dynamic_path"));`
    };
    
    Deno.env.set("PATH_TYPE", "user");
    
    const result = await processPathParams(pathParams);
    assertEquals((result as Record<string, unknown>).id, "123");
    assertEquals((result as Record<string, unknown>).type, "user");
    assertEquals((result as Record<string, unknown>).dynamic, "dynamic_path");
    
    Deno.env.delete("PATH_TYPE");
  });

  await t.step("processInputParams - should process input parameters", async () => {
    const inputParams = {
      name: "test",
      timestamp: `#!/usr/bin/env deno
const ts = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(ts));`,
      nested: {
        value: "{NESTED_VAR}"
      }
    };
    
    Deno.env.set("NESTED_VAR", "nested_value");
    
    const result = await processInputParams(inputParams);
    const resultObj = result as Record<string, unknown>;
    
    assertEquals(resultObj.name, "test");
    assertEquals(typeof resultObj.timestamp, "string");
    assertEquals(isNaN(Number(resultObj.timestamp)), false); // Should be a valid timestamp
    assertEquals((resultObj.nested as Record<string, unknown>).value, "nested_value");
    
    Deno.env.delete("NESTED_VAR");
  });

  await t.step("processValue - should handle null and undefined", async () => {
    assertEquals(await processValue(null), null);
    assertEquals(await processValue(undefined), undefined);
    assertEquals(await processValue(0), 0);
    assertEquals(await processValue(false), false);
  });

  await t.step("processValue - should handle complex nested structures", async () => {
    const input = {
      array: [
        "item1",
        {
          script: `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("array_script"));`,
          template: "{COMPLEX_VAR}"
        }
      ],
      object: {
        level1: {
          level2: {
            value: `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("deep_script"));`
          }
        }
      }
    };
    
    Deno.env.set("COMPLEX_VAR", "complex_value");
    
    const result = await processValue(input) as Record<string, unknown>;
    const array = result.array as unknown[];
    const arrayItem = array[1] as Record<string, unknown>;
    const object = result.object as Record<string, unknown>;
    const level1 = object.level1 as Record<string, unknown>;
    const level2 = level1.level2 as Record<string, unknown>;
    
    assertEquals(array[0], "item1");
    assertEquals(arrayItem.script, "array_script");
    assertEquals(arrayItem.template, "complex_value");
    assertEquals(level2.value, "deep_script");
    
    Deno.env.delete("COMPLEX_VAR");
  });
});
