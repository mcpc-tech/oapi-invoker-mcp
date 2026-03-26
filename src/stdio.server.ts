import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./app.ts";

(async () => {
  const transport = new StdioServerTransport();
  const server = await createServer();
  await server.connect(transport);
})();
