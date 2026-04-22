import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./app.ts";

(async () => {
  const transport = new StdioServerTransport();
  const server = await createServer({
    strictOutputSchema: Deno.env.get("STRICT_OUTPUT_SCHEMA") === "true",
  });
  // deno-lint-ignore no-explicit-any
  await (server as any).connect(transport);
})();
