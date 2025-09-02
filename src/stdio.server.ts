import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./app.ts";

const transport = new StdioServerTransport();
await createServer().then((server) => server.connect(transport));
