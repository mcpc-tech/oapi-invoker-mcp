#!/usr/bin/env deno
import { invoke } from "./src/tool/invoker.ts";

// Test script execution functionality
async function testScriptExecution() {
  const mockSpec = {
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: {
        "Content-Type": "application/json",
        "x-timestamp": `#!/usr/bin/env deno
const timestamp = (Date.now()/1000).toFixed();
Deno.stdout.write(new TextEncoder().encode(timestamp));`,
        "x-nonce": `#!/usr/bin/env deno
const nonce = Math.random().toString(36).substr(2);
Deno.stdout.write(new TextEncoder().encode(nonce));`,
        "x-signature": `#!/usr/bin/env deno
const timestamp = Deno.env.get("x_timestamp") || "";
const data = "test" + timestamp;
const messageBuffer = new TextEncoder().encode(data);
const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
const hash = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
Deno.stdout.write(new TextEncoder().encode(hash));`
      }
    },
    servers: [{ url: "https://api.example.com" }]
  };

  const mockTool = {
    name: "test-tool",
    method: "get",
    path: "/test",
    _rawOperation: {}
  };

  const params = {
    pathParams: {},
    inputParams: {
      "dynamic-value": `#!/usr/bin/env deno
const value = "generated-" + Date.now();
Deno.stdout.write(new TextEncoder().encode(value));`,
      "template-value": "{X_TEST_VAR}",
      "nested": {
        "script-in-object": `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("nested-script-result"));`
      }
    }
  };

  // Set environment variable for template test
  Deno.env.set("X_TEST_VAR", "test-env-value");

  try {
    console.log("Testing script execution in invoker...");
    // This will fail at the actual HTTP request, but we want to see if script processing works
    await invoke(mockSpec as any, mockTool as any, params);
  } catch (error) {
    console.log("Expected error (no actual server):", error.message);
  }
}

if (import.meta.main) {
  await testScriptExecution();
}
