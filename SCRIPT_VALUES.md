# Script-based Values in OAPI Invoker

This document demonstrates how to use script-based values in the OAPI Invoker MCP server.

## Features

The invoker now supports:

1. **Script execution in all values** (not just headers)
2. **Environment variable templating** using `{VAR_NAME}` syntax
3. **Cross-script communication** where script outputs can be used as environment variables in subsequent scripts
4. **Temporary file management** using system tmpdir with proper cleanup

## Example Configuration

```yaml
x-request-config:
  headers:
    "Content-Type": "application/json"
    "x-rio-paasid": "{X_RIO_PAASID}"
    "x-rio-paas-token": "{X_RIO_PAAS_TOKEN}"
    "x-rio-timestamp": |
      #!/usr/bin/env deno
      const timestamp = (Date.now()/1000).toFixed();
      Deno.stdout.write(new TextEncoder().encode(timestamp));
    "x-rio-nonce": |
      #!/usr/bin/env deno
      const nonce = Math.random().toString(36).substr(2);
      Deno.stdout.write(new TextEncoder().encode(nonce));
    "x-rio-signature": |
      #!/usr/bin/env deno
      import { encodeHex } from "jsr:@std/encoding/hex";
      const timestamp = Deno.env.get("x_rio_timestamp");
      const nonce = Deno.env.get("x_rio_nonce") || "";
      const paasToken = Deno.env.get("x_rio_paas_token") || "";
      const data = timestamp + paasToken + nonce + timestamp;
      const messageBuffer = new TextEncoder().encode(data);
      const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
      const hash = encodeHex(hashBuffer);
      Deno.stdout.write(new TextEncoder().encode(hash));
```

## Script Features

### 1. Shebang Support
All scripts must start with `#!/usr/bin/env deno` and will be executed with full permissions (`--allow-all`).

### 2. Environment Variables
- Template variables like `{X_RIO_PAASID}` are replaced with actual environment variable values
- Script outputs are automatically available as environment variables for subsequent scripts
- Header names are converted to environment variable format (e.g., `x-rio-timestamp` becomes `x_rio_timestamp`)

### 3. Value Processing
Scripts can be used in:
- **Headers**: For authentication, timestamps, signatures, etc.
- **Request body parameters**: For dynamic values
- **Path parameters**: For computed path segments
- **Query parameters**: For dynamic query values
- **Nested objects**: Scripts work recursively in nested structures

### 4. Cross-Script Dependencies
Scripts are processed in order, allowing later scripts to use the output of earlier ones:

```yaml
"x-timestamp": |
  #!/usr/bin/env deno
  const timestamp = Date.now().toString();
  Deno.stdout.write(new TextEncoder().encode(timestamp));

"x-signature": |
  #!/usr/bin/env deno
  const timestamp = Deno.env.get("x_timestamp") || "";
  const data = "data" + timestamp;
  // ... generate signature using timestamp
```

## Security Notes

- Scripts are executed with full Deno permissions (`--allow-all`)
- Temporary files are created in system tmpdir and cleaned up automatically
- Environment variables from parent process are available to scripts
- Scripts have access to the full Deno standard library and external modules

## Use Cases

1. **API Authentication**: Generate timestamps, nonces, and signatures
2. **Dynamic Content**: Create UUIDs, random values, computed fields
3. **Complex Transformations**: Process data before sending requests
4. **Conditional Logic**: Use environment variables to conditionally set values
5. **External Service Integration**: Call external services for tokens or data
