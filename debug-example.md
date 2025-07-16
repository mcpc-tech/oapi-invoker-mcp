# Debug Mode Documentation

The OAPI Invoker MCP now includes a debug mode that provides detailed information about the request/response process when enabled.

## Enabling Debug Mode

Set the environment variable `OAPI_INVOKER_DEBUG=1` to enable debug mode:

```bash
export OAPI_INVOKER_DEBUG=1
```

or when running your application:

```bash
OAPI_INVOKER_DEBUG=1 deno run your-app.ts
```

## Debug Information Structure

When debug mode is enabled, the response data will include a `_debug` field with the following structure:

```typescript
interface DebugInfo {
  tool: {
    name: string;              // Tool name
    method: string;            // HTTP method (GET, POST, etc.)
    path: string;              // API path template
    operationId?: string;      // OpenAPI operation ID if available
  };
  request: {
    url: string;               // Final request URL
    finalHeaders: Record<string, string>;  // Final request headers
    body?: string;             // Request body (if any)
    timeout: number;           // Request timeout in ms
    retries: number;           // Number of retries configured
  };
  response: {
    status: number;            // HTTP status code
    statusText: string;        // HTTP status text
    contentType: string;       // Response content type
    headers: Record<string, string>;  // Response headers
  };
  processing: {
    pathParams: Record<string, unknown>;     // Path parameters used
    inputParams: Record<string, unknown>;    // Input parameters used
    sensitiveParams: Record<string, unknown>; // Sensitive parameters applied
    usedProxy: boolean;        // Whether proxy was used
    usedTencentCloudAuth: boolean;  // Whether Tencent Cloud auth was used
    pathRemapped: boolean;     // Whether path-to-header remapping was used
  };
}
```

## Example Usage

### Original Response (debug mode disabled)
```json
{
  "result": "success",
  "data": [1, 2, 3]
}
```

### Response with Debug Info (debug mode enabled)
```json
{
  "result": "success",
  "data": [1, 2, 3],
  "_debug": {
    "tool": {
      "name": "getUserList",
      "method": "get",
      "path": "/api/users",
      "operationId": "listUsers"
    },
    "request": {
      "url": "https://api.example.com/api/users?limit=10",
      "finalHeaders": {
        "authorization": "Bearer ***SENSITIVE***",
        "content-type": "application/json"
      },
      "timeout": 30000,
      "retries": 0
    },
    "response": {
      "status": 200,
      "statusText": "OK",
      "contentType": "application/json",
      "headers": {
        "content-type": "application/json",
        "content-length": "156"
      }
    },
    "processing": {
      "pathParams": {},
      "inputParams": { "limit": 10 },
      "sensitiveParams": {},
      "usedProxy": false,
      "usedTencentCloudAuth": false,
      "pathRemapped": false
    }
  }
}
```

### Non-Object Response with Debug Info
If the original response is not an object (e.g., a string or array), the debug info is wrapped differently:

```json
{
  "originalData": "Plain text response",
  "_debug": {
    // ... debug info structure
  }
}
```

## Use Cases

Debug mode is particularly useful for:

1. **API Development**: Understanding how parameters are processed and transformed
2. **Authentication Debugging**: Seeing if special auth mechanisms like Tencent Cloud are being applied
3. **Proxy Configuration**: Verifying if proxy settings are being used
4. **Header Analysis**: Examining final request/response headers
5. **Path Remapping**: Checking if custom path-to-header remapping is working
6. **Performance Analysis**: Seeing timeout and retry configurations
7. **Troubleshooting**: Diagnosing issues with API calls

## Security Considerations

- Sensitive parameters are masked with `*SENSITIVE*` in the debug output
- Debug mode should typically only be enabled in development environments
- Be cautious when logging debug information as it may contain sensitive data in headers or URLs
