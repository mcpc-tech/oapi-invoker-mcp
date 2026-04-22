import type { OpenAPIHono } from "@hono/zod-openapi";
import { registerNotImplemented } from "./not-implemented.ts";

export const messageHandler = (app: OpenAPIHono) => {
  registerNotImplemented(app, "post", "/messages");
};
