# oapi-invoker-mcp 🚀

> Say goodbye to repetitive development of "API's API"

<img src="./logo.png" width="300" height="300" alt="oapi-invoker-logo">

`oapi-invoker-mcp` invokes any OpenAPI through Model Context Protocol (MCP)
server.

- [x] Easily invoke any OpenAPI service through MCP client 💻
- [x] Support specification patches (e.g., add API descriptions and examples to
      enhance documentation) 📝
- [x] Support custom authentication protocols, like
      `Tencent Cloud API Signature V3` 🔐
- [x] Powerful OpenAPI specification parsing with custom extensions 🔧
- [x] Advanced filtering and operation selection 🎯
- [x] Script-based dynamic value generation for headers, parameters, and
      authentication 📜
- [x] Built-in debug mode for development and troubleshooting 🔍
- [x] Data encryption/decryption (e.g., authentication headers) 🔒

## Key Features

### 🔧 Advanced OpenAPI Parsing with Extensions

`oapi-invoker-mcp` extends standard OpenAPI specifications with powerful custom
extensions that provide fine-grained control over API interactions:

#### Tool Configuration Extensions

- **`x-tool-name-format`**: Customize tool naming patterns (e.g.,
  `{method}-{cleanPath}`, `{operationId}`)
  - Available placeholders:
    - `{method}`: HTTP method (get, post, put, delete, etc.)
    - `{cleanPath}`: Sanitized path with special characters converted to
      underscores
    - `{operationId}`: OpenAPI operation ID (if available)
  - Note: Raw `{path}` is not supported to avoid unsafe characters in tool names
- **`x-tool-name-prefix/suffix`**: Add prefixes or suffixes to tool names
- **`x-filter-rules`**: Filter operations by path patterns, methods, operation
  IDs, or tags

#### Request Configuration Extensions

- **`x-request-config`**: Global request settings including:
  - Base URL configuration
  - Default headers and authentication
  - Proxy settings with parameter mapping
  - Timeout and retry configurations
  - Tencent Cloud authentication support

#### Operation-Level Extensions

- **`x-examples`**: Add request/response examples for better documentation
- **`x-remap-path-to-header`**: Map path parameters to request headers
- **`x-custom-base-url`**: Override base URL per operation
- **`x-sensitive-params`**: Mark sensitive data for automatic redaction
- **`x-sensitive-response-fields`**: Mark response fields as sensitive

#### Response Processing Extensions

- **`x-response-config`**: Control response handling:
  - Maximum response length limits
  - Include/exclude specific response keys
  - Mark sensitive response fields
- **`x-tree-shaking-func`**: Custom response data filtering

### 📜 Script-Based Dynamic Values

Generate dynamic values using Deno scripts in any configuration field:

```yaml
x-request-config:
  headers:
    "x-timestamp": |
      #!/usr/bin/env deno
      const timestamp = Date.now().toString();
      Deno.stdout.write(new TextEncoder().encode(timestamp));
    "x-signature": |
      #!/usr/bin/env deno
      const timestamp = Deno.env.get("x_timestamp") || "";
      const data = "secret" + timestamp;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
      Deno.stdout.write(new TextEncoder().encode(Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')));
```

#### URL Encoding in Input Parameters

For APIs that require URL-encoded parameters, you can use dynamic scripts in
`inputParams`:

**Using Node.js `encodeURIComponent`:**

```javascript
{
  "query": "#!/usr/bin/env node\nconst rawValue = \"hello world & special chars\";\nconst encoded = encodeURIComponent(rawValue);\nprocess.stdout.write(encoded);"
}
```

**Using Deno URL encoding:**

```javascript
{
  "searchTerm": "#!/usr/bin/env deno\nconst term = \"user search & query\";\nconst encoded = encodeURIComponent(term);\nDeno.stdout.write(new TextEncoder().encode(encoded));"
}
```

**Template variables with encoding:**

```javascript
{
  "encodedParam": "#!/usr/bin/env node\nconst value = process.env.SEARCH_TERM || 'default';\nprocess.stdout.write(encodeURIComponent(value));"
}
```

**Script Features:**

- 🔄 **Cross-script communication**: Script outputs become environment variables
  for subsequent scripts
- 🌍 **Environment variable templating**: Use `{VAR_NAME}` syntax for variable
  substitution
- 📁 **Temporary file management**: Automatic cleanup of temporary files
- 🔒 **Full Deno permissions**: Access to file system, network, and external
  modules
- 🌐 **Multiple runtimes**: Support for both Node.js and Deno scripts
- 🔤 **URL encoding**: Built-in support for parameter encoding using
  `encodeURIComponent`

### 🎯 Advanced Filtering

Filter OpenAPI operations with powerful rule-based system:

```yaml
x-filter-rules:
  - pathPattern: "^/api/v1/.*" # Include only v1 API paths
    methodPattern: "^(get|post)$" # Only GET and POST methods
    tags: ["user", "admin"] # Operations with specific tags
    exclude: false # Include matching operations
  - pathPattern: "/internal/.*" # Exclude internal APIs
    exclude: true
```

### 🔐 Authentication Support

Built-in support for complex authentication schemes:

- **Tencent Cloud API Signature V3**: Automatic signature generation
- **Custom authentication scripts**: Generate tokens, signatures, and headers
  dynamically
- **Sensitive parameter handling**: Automatic redaction in logs and debug output

# Quick Start

## 1. Basic Configuration

Configure the MCP server with environment variables to specify your OpenAPI
specification:

```bash
# Required: OpenAPI specification source
export SPEC_URL="https://api.example.com/openapi.json"
# OR
export SPEC_PATH="/path/to/openapi.json"
export SPEC_FORMAT="json"  # or "yaml"

# Optional: Extensions file for custom configurations
export SPEC_EXTENSION_PATH="/path/to/extensions.yaml"
export SPEC_EXTENSION_FORMAT="yaml"
```

## 2. MCP Server Configuration

### Using Node.js (npx)

```json
{
  "mcpServers": {
    "capi-invoker": {
      "command": "npx",
      "args": [
        "-y",
        "deno",
        "run",
        "--allow-all",
        "jsr:@mcpc/oapi-invoker-mcp/bin"
      ],
      "env": {
        "SPEC_URL": "https://api.github.com/openapi.json",
        "OAPI_INVOKER_DEBUG": "1"
      },
      "transportType": "stdio"
    }
  }
}
```

### Using Deno directly

```json
{
  "mcpServers": {
    "capi-invoker": {
      "command": "deno",
      "args": ["run", "--allow-all", "jsr:@mcpc/oapi-invoker-mcp/bin"],
      "env": {
        "SPEC_URL": "https://api.github.com/openapi.json",
        "GITHUB_TOKEN": "your-github-token"
      },
      "transportType": "stdio"
    }
  }
}
```

## 3. Extensions File Example

Create an extensions file to customize behavior:

```yaml
# extensions.yaml
x-request-config:
  baseUrl: "https://api.example.com"
  headers:
    "Authorization": "Bearer {API_TOKEN}"
    "Content-Type": "application/json"
    "X-Custom-Header": "custom-value"
  timeout: 30000
  retries: 3

x-filter-rules:
  - pathPattern: "^/api/v1/.*"
    methodPattern: "^(get|post)$"
    exclude: false
  - pathPattern: "/internal/.*"
    exclude: true

x-tool-name-format: "{method}-{operationId}"
x-tool-name-prefix: "api-"

# Mark sensitive fields
x-response-config:
  sensitiveResponseFields: ["password", "secret", "token"]
  maxLength: 10000
```

## 4. Complete GitHub API Example

See the complete feature demonstration in
[`src/source/github/github.patch.yaml`](src/source/github/github.patch.yaml),
which showcases:

### 🎯 **All Features in One File:**

- **Dynamic Script Execution**: Node.js and Deno scripts in headers and
  parameters
- **URL Encoding**: `encodeURIComponent` for search queries and special
  characters
- **Template Variables**: Environment variable substitution with
  `{GITHUB_TOKEN}`
- **Operation Filtering**: Include only useful GitHub operations, exclude admin
  APIs
- **Sensitive Data Protection**: Automatic redaction of tokens and private data
- **Response Optimization**: Size limits and field filtering for better
  performance

### 📋 **Usage Examples:**

```bash
# Set up GitHub token
export GITHUB_TOKEN="your-github-token"
export ISSUE_TITLE="Dynamic Issue Title"

# Use with MCP client
{
  "pathParams": {},
  "inputParams": {
    "owner": "mcpc-tech",
    "repo": "oapi-invoker-mcp"
  },
  "headerParams": {}
}
```

### 🔧 **Key Features Demonstrated:**

- **Repository Operations**: Get repo info, create issues, list pull requests
- **Search Operations**: Repository search with dynamic query encoding
- **User Operations**: Get current user with sensitive data protection
- **Dynamic Headers**: Auto-generated timestamps and request IDs
- **Automatic Encoding**: URL encoding for special characters and spaces

This example serves as a practical template for integrating any REST API with
advanced features.

## 5. Advanced Authentication Example

For APIs requiring complex authentication (e.g., signature-based):

```yaml
# extensions.yaml
x-request-config:
  baseUrl: "https://api.example.com"
  headers:
    "Content-Type": "application/json"
    "X-Timestamp": |
      #!/usr/bin/env deno
      const timestamp = Math.floor(Date.now() / 1000).toString();
      Deno.stdout.write(new TextEncoder().encode(timestamp));
    "X-Nonce": |
      #!/usr/bin/env deno
      const nonce = Math.random().toString(36).substr(2, 16);
      Deno.stdout.write(new TextEncoder().encode(nonce));
    "X-Signature": |
      #!/usr/bin/env deno
      import { encodeHex } from "jsr:@std/encoding/hex";
      const timestamp = Deno.env.get("X_Timestamp") || "";
      const nonce = Deno.env.get("X_Nonce") || "";
      const secret = Deno.env.get("API_SECRET") || "";
      const data = timestamp + nonce + secret;
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
      const signature = encodeHex(hashBuffer);
      Deno.stdout.write(new TextEncoder().encode(signature));

# Tencent Cloud API example
x-request-config:
  auth:
    TencentCloudAuth:
      secretId: "{TENCENT_SECRET_ID}"
      secretKey: "{TENCENT_SECRET_KEY}"
      service: "cvm"
      region: "ap-beijing"
      version: "2017-03-12"
```

## 6. Operation-Specific Extensions

Add operation-specific configurations directly in your OpenAPI spec:

```yaml
paths:
  /users/{id}:
    get:
      operationId: getUser
      x-examples:
        - "Get user with ID 123"
        - "Retrieve user profile information"
      x-sensitive-response-fields: ["email", "phone"]
      x-custom-base-url: "https://users-api.example.com"
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
          x-examples: ["123", "user-abc", "test-user"]
```

## 7. Debug Mode

`oapi-invoker-mcp` includes a comprehensive debug mode that provides detailed
information about the request/response process, making it easier to develop and
troubleshoot API integrations.

### Enabling Debug Mode

Set the environment variable `OAPI_INVOKER_DEBUG=1` to enable debug mode:

```bash
export OAPI_INVOKER_DEBUG=1
```

Or when configuring your MCP server:

```json
{
  "mcpServers": {
    "capi-invoker": {
      "command": "deno",
      "args": ["run", "--allow-all", "jsr:@mcpc/oapi-invoker-mcp/bin"],
      "env": {
        "OAPI_INVOKER_DEBUG": "1"
      },
      "transportType": "stdio"
    }
  }
}
```

### Debug Information

When debug mode is enabled, API responses include a `_debug` field with detailed
information about:

- **Tool Information**: Method, path, operation ID
- **Request Details**: Final URL, headers, body, timeout settings
- **Response Details**: Status, headers, content type
- **Processing Info**: Parameters, authentication, proxy usage

### Example Debug Output

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
      "contentType": "application/json"
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

### Use Cases for Debug Mode

Debug mode is particularly useful for:

- 🔧 **API Development**: Understanding parameter processing and transformation
- 🔐 **Authentication Debugging**: Verifying special auth mechanisms (e.g.,
  Tencent Cloud)
- 🌐 **Proxy Configuration**: Checking proxy settings usage
- 📋 **Header Analysis**: Examining final request/response headers
- 🔄 **Path Remapping**: Validating custom path-to-header remapping
- ⚡ **Performance Analysis**: Reviewing timeout and retry configurations
- 🐛 **Troubleshooting**: Diagnosing API call issues

> **Security Note**: Sensitive parameters are automatically masked with
> `***SENSITIVE***` in debug output. Debug mode should typically only be enabled
> in development environments.

## Real-World Use Cases

### 🐙 GitHub API Integration

```yaml
# github-extensions.yaml
x-request-config:
  baseUrl: "https://api.github.com"
  headers:
    "Authorization": "Bearer {GITHUB_TOKEN}"
    "Accept": "application/vnd.github+json"
    "X-GitHub-Api-Version": "2022-11-28"

x-filter-rules:
  - pathPattern: "^/repos/.*"
    methodPattern: "^(get|post|patch)$"
    exclude: false
  - pathPattern: "/admin/.*"
    exclude: true

x-tool-name-format: "github-{operationId}"
```

### ☁️ Tencent Cloud API Integration

```yaml
# tencent-cloud-extensions.yaml
x-request-config:
  baseUrl: "https://cvm.tencentcloudapi.com"
  auth:
    TencentCloudAuth:
      secretId: "{TENCENT_SECRET_ID}"
      secretKey: "{TENCENT_SECRET_KEY}"
      service: "cvm"
      region: "ap-beijing"
      version: "2017-03-12"

x-response-config:
  sensitiveResponseFields: ["SecretId", "SecretKey", "Token"]

x-tool-name-prefix: "tencent-"
```

### 🔐 Custom Authentication API

```yaml
# custom-auth-extensions.yaml
x-request-config:
  baseUrl: "https://secure-api.example.com"
  headers:
    "Content-Type": "application/json"
    "X-API-Key": "{API_KEY}"
    "X-Timestamp": |
      #!/usr/bin/env deno
      Deno.stdout.write(new TextEncoder().encode(Date.now().toString()));
    "X-Signature": |
      #!/usr/bin/env deno
      import { encodeHex } from "jsr:@std/encoding/hex";
      const timestamp = Deno.env.get("X_Timestamp") || "";
      const apiKey = Deno.env.get("API_KEY") || "";
      const message = `${timestamp}${apiKey}`;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
      Deno.stdout.write(new TextEncoder().encode(encodeHex(hash)));

x-sensitive-params:
  "X-Signature": "***REDACTED***"
  "X-API-Key": "***REDACTED***"
```

### 🌐 Multi-Environment Configuration

```yaml
# production-extensions.yaml
x-request-config:
  baseUrl: "{BASE_URL}" # https://api.prod.example.com
  timeout: 30000
  retries: 3
  headers:
    "Authorization": "Bearer {PROD_API_TOKEN}"
    "Environment": "production"

x-filter-rules:
  - tags: ["public", "v1"]
    exclude: false
  - tags: ["internal", "deprecated"]
    exclude: true

x-response-config:
  maxLength: 50000
  excludeResponseKeys: ["debug", "trace"]
```

## Environment Variables Reference

| Variable                | Description                         | Example                                |
| ----------------------- | ----------------------------------- | -------------------------------------- |
| `SPEC_URL`              | URL to OpenAPI specification        | `https://api.example.com/openapi.json` |
| `SPEC_PATH`             | Local path to OpenAPI specification | `/path/to/openapi.yaml`                |
| `SPEC_FORMAT`           | Format of the specification         | `json` or `yaml`                       |
| `SPEC_EXTENSION_URL`    | URL to extensions file              | `https://example.com/extensions.yaml`  |
| `SPEC_EXTENSION_PATH`   | Local path to extensions file       | `/path/to/extensions.yaml`             |
| `SPEC_EXTENSION_FORMAT` | Format of extensions file           | `json` or `yaml`                       |
| `OAPI_INVOKER_DEBUG`    | Enable debug mode                   | `1` or `true`                          |

## Contributing

We welcome contributions! Please feel free to submit issues, feature requests,
or pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
