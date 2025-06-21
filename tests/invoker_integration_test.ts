/**
 * Integration tests for the invoker functionality
 * Tests the complete flow with script execution and value processing
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { invoke } from "../src/tool/invoker.ts";

// Mock HTTP server responses for testing
const mockResponse = (data: unknown, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
};

// Create a global fetch mock
const originalFetch = globalThis.fetch;

Deno.test("invoke - basic functionality with processRequestValues", async () => {
  // Mock fetch to avoid real HTTP requests
  globalThis.fetch = async (_url: string | URL | Request, _options?: RequestInit) => {
    return mockResponse({ success: true, message: "test response" });
  };

  const spec = {
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: {
        "Content-Type": "application/json",
        "x-test-header": "test-value"
      }
    },
    servers: [{ url: "https://api.example.com" }]
  };

  const extendTool = {
    name: "test-tool",
    method: "get",
    path: "/test",
    _rawOperation: {}
  };

  const params = {
    pathParams: {},
    inputParams: {
      message: "hello world"
    }
  };

  try {
    const result = await invoke(spec as any, extendTool as any, params);
    
    assertEquals(result.status, 200);
    assertEquals(typeof result.data, "object");
    assertEquals((result.data as any).success, true);
  } finally {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invoke - with script execution in headers", async () => {
  let capturedUrl = "";
  let capturedOptions: RequestInit | undefined;

  // Mock fetch to capture the request
  globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
    capturedUrl = url.toString();
    capturedOptions = options;
    return mockResponse({ message: "success" });
  };

  const spec = {
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: {
        "Content-Type": "application/json",
        "x-timestamp": `#!/usr/bin/env deno
const timestamp = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(timestamp));`,
        "x-nonce": `#!/usr/bin/env deno
const nonce = Math.random().toString(36).substr(2, 8);
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

  const extendTool = {
    name: "test-tool",
    method: "post",
    path: "/api/test",
    _rawOperation: {}
  };

  const params = {
    pathParams: {},
    inputParams: {
      data: "test payload"
    }
  };

  try {
    const result = await invoke(spec as any, extendTool as any, params);
    
    assertEquals(result.status, 200);
    assertStringIncludes(capturedUrl, "https://api.example.com/api/test");
    
    // Check that headers were processed correctly
    const headers = capturedOptions?.headers as Record<string, string>;
    assertEquals(headers["Content-Type"], "application/json");
    assertEquals(typeof headers["x-timestamp"], "string");
    assertEquals(headers["x-timestamp"].length > 10, true); // timestamp should be long
    assertEquals(typeof headers["x-nonce"], "string");
    assertEquals(headers["x-nonce"].length, 8); // nonce should be 8 characters
    assertEquals(typeof headers["x-signature"], "string");
    assertEquals(headers["x-signature"].length, 64); // SHA-256 hex is 64 characters
    
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invoke - with template variables", async () => {
  let capturedOptions: RequestInit | undefined;

  // Set environment variables for testing
  Deno.env.set("API_KEY", "test-api-key");
  Deno.env.set("USER_ID", "user123");

  globalThis.fetch = async (_url: string | URL | Request, options?: RequestInit) => {
    capturedOptions = options;
    return mockResponse({ success: true });
  };

  const spec = {
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: {
        "Authorization": "Bearer {API_KEY}",
        "x-user-id": "{USER_ID}"
      }
    },
    servers: [{ url: "https://api.example.com" }]
  };

  const extendTool = {
    name: "test-tool",
    method: "get",
    path: "/user/{USER_ID}/profile",
    _rawOperation: {}
  };

  const params = {
    pathParams: {
      USER_ID: "{USER_ID}"
    },
    inputParams: {}
  };

  try {
    const result = await invoke(spec as any, extendTool as any, params);
    
    assertEquals(result.status, 200);
    
    const headers = capturedOptions?.headers as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer test-api-key");
    assertEquals(headers["x-user-id"], "user123");
    
  } finally {
    Deno.env.delete("API_KEY");
    Deno.env.delete("USER_ID");
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invoke - with dynamic input parameters", async () => {
  let capturedOptions: RequestInit | undefined;

  globalThis.fetch = async (_url: string | URL | Request, options?: RequestInit) => {
    capturedOptions = options;
    return mockResponse({ result: "processed" });
  };

  const spec = {
    "x-request-config": {
      baseUrl: "https://api.example.com",
      headers: {
        "Content-Type": "application/json"
      }
    },
    servers: [{ url: "https://api.example.com" }]
  };

  const extendTool = {
    name: "test-tool",
    method: "post",
    path: "/process",
    _rawOperation: {}
  };

  const params = {
    pathParams: {},
    inputParams: {
      timestamp: `#!/usr/bin/env deno
const timestamp = Date.now();
Deno.stdout.write(new TextEncoder().encode(timestamp.toString()));`,
      staticData: "unchanged",
      nested: {
        dynamicId: `#!/usr/bin/env deno
const id = "gen_" + Math.random().toString(36).substr(2, 6);
Deno.stdout.write(new TextEncoder().encode(id));`,
        staticValue: "static"
      }
    }
  };

  try {
    const result = await invoke(spec as any, extendTool as any, params);
    
    assertEquals(result.status, 200);
    
    const body = JSON.parse(capturedOptions?.body as string);
    assertEquals(typeof body.timestamp, "string");
    assertEquals(body.timestamp.length > 10, true); // timestamp should be long
    assertEquals(body.staticData, "unchanged");
    assertEquals(typeof body.nested.dynamicId, "string");
    assertStringIncludes(body.nested.dynamicId, "gen_");
    assertEquals(body.nested.staticValue, "static");
    
  } finally {
    globalThis.fetch = originalFetch;
  }
});
