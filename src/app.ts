import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import {
  createOapiInvokerServer,
  type OapiInvokerConfig,
} from "./set-up-mcp.ts";
import type { ComposableMCPServer } from "@mcpc/core";

export type { OapiInvokerConfig };
export type { InvokeHook, InvokeHookContext } from "./tool/invoker.ts";

export const createServer = (
  config?: OapiInvokerConfig,
): Promise<ComposableMCPServer> =>
  createOapiInvokerServer(
    config ?? {},
    {
      name: "oapi-invoker-mcp",
      version: "0.1.0",
    },
    { capabilities: { tools: {} } },
  );

export const createApp: () => OpenAPIHono = () => {
  const app = new OpenAPIHono();

  // Register routes
  registerAgent(app);

  return app;
};
