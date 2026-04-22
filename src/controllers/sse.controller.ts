import type { OpenAPIHono } from "@hono/zod-openapi";
import { registerNotImplemented } from "./not-implemented.ts";

export const sseHandler = (app: OpenAPIHono) => {
  registerNotImplemented(app, "get", "/sse");
};
