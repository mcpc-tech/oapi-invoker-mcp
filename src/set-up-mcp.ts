import { ComposableMCPServer } from "@mcpc/core";

import { parseOAPISpecWithExtensions } from "./tool/parser.ts";
import { openapiToAIToolSchema } from "./tool/translator.ts";
import { invoke, type InvokerParams } from "./tool/invoker.ts";
import { jsonSchema, type Schema } from "ai";

export const INCOMING_MSG_ROUTE_PATH = "/oapi/messages";

const specification = await parseOAPISpecWithExtensions({});

const { standardTools, toolToExtendInfo } = await openapiToAIToolSchema(
  specification
);

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof ComposableMCPServer>
): InstanceType<typeof ComposableMCPServer> {
  const server = new ComposableMCPServer(...args);

  standardTools.map((tool) => {
    server.tool(
      tool.name,
      tool.description ?? "",
      jsonSchema(tool.inputSchema as unknown as Schema),
      async (params, extra) => {
        const res = await invoke(
          specification,
          toolToExtendInfo[tool.name],
          params as InvokerParams
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res.data),
            },
          ].concat(
            res.debugInfo
              ? [
                  {
                    type: "text",
                    text: JSON.stringify({ debug: res.debugInfo }),
                  },
                ]
              : []
          ),
        };
      },
      { internal: false }
    );
  });

  return server;
}
