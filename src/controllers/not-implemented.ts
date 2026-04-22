import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";

/**
 * Registers a placeholder route that returns HTTP 501 Not Implemented.
 * Used for routes that are not yet supported by the current @mcpc/core version.
 */
export function registerNotImplemented(
  app: OpenAPIHono,
  method: "get" | "post",
  path: string,
): void {
  app.openapi(
    createRoute({
      method,
      path,
      responses: {
        200: {
          content: {
            "text/event-stream": {
              schema: z.any(),
            },
          },
          description: "Returns the processed message",
        },
        400: {
          content: {
            "application/json": {
              schema: z.any(),
            },
          },
          description: "Returns an error",
        },
      },
    }),
    async (c) => {
      return c.json(
        { error: "Not implemented with current @mcpc/core version" },
        501,
      );
    },
    (result, c) => {
      if (!result.success) {
        return c.json(
          {
            code: 400,
            message: result.error.message,
          },
          400,
        );
      }
    },
  );
}
