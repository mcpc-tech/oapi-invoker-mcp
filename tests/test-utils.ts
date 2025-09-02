import type { OpenAPI } from "@scalar/openapi-types";

export function mockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "content-type": "application/json" },
  });
}

export function createMockFetch(response: Response) {
  let capturedUrl = "";
  let capturedOptions: RequestInit | undefined;

  const mockFetch = (url: string | URL | Request, options?: RequestInit) => {
    capturedUrl = url.toString();
    capturedOptions = options;
    return Promise.resolve(response);
  };

  return {
    mockFetch,
    getCapturedUrl: () => capturedUrl,
    getCapturedOptions: () => capturedOptions,
  };
}

export function createBasicSpec() {
  return {
    "x-sensitive-params": {},
    servers: [{ url: "https://api.example.com" }],
  };
}

export function createBasicTool(method = "get", path = "/test") {
  return {
    name: "test-tool",
    method,
    path,
    _rawOperation: {
      "x-sensitive-params": {},
      parameters: [] as OpenAPI.Parameter[],
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        pathParams: { type: "object" as const, properties: {} },
        inputParams: { type: "object" as const, properties: {} },
        headerParams: { type: "object" as const, properties: {} },
      },
    },
  };
}

export function withCleanup<T>(
  setup: () => T,
  cleanup: (value: T) => void,
  test: (value: T) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const value = setup();
    try {
      await test(value);
    } finally {
      cleanup(value);
    }
  };
}

export function mockFetchGlobally(response: Response): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(response);
  return () => {
    globalThis.fetch = originalFetch;
  };
}
