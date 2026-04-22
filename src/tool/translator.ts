/**
 * Converts OpenAPI specification to AI Tool Schema
 * 1. Takes a function that fetches OpenAPI spec
 * 2. Returns an array of AI Tool Schema objects
 * 3. Can use caching to avoid re-processing same specs
 * 4. Allows filtering operations and patching OpenAPI operations
 * 5. Properly extracts path parameters from URL paths like /api/v3/projects/{id_or_path}/repository/tags/{tag}
 * 6. Separates pathParams and inputParams in the schema
 * 7. Includes response definitions as hidden parameters
 * 8. Supports dynamic headers with script execution and template variables
 */
import type { ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type {
  OAPIOperation,
  OAPISpecDocument,
  ParameterExtension,
} from "./parser.ts";
import type { OpenAPI } from "@scalar/openapi-types";
import { p } from "../utils/template.ts";
import { SENSITIVE_MARK } from "./constants.ts";

/**
 * Tool schema from model context protocol
 */
export type AIToolSchema = z.infer<typeof ToolSchema>;

export interface ExtendedAIToolSchema extends AIToolSchema {
  _responseSchema?: Record<string, unknown>;
  _rawOperation?: OAPIOperation;
  _meta?: { method: string; path: string };
  method?: string;
  path?: string;
  inputSchema: {
    type: "object";
    properties: {
      pathParams: AIToolSchema["inputSchema"];
      inputParams: AIToolSchema["inputSchema"];
      headerParams: AIToolSchema["inputSchema"];
    };
    required?: string[];
  };
  outputSchema?: AIToolSchema["outputSchema"];
  // 显式声明基类型属性，因为 zod 3.25+ 的 infer 对 $strip 的处理可能导致属性丢失
  name: string;
  description?: string;
  examples?: AIToolSchema["examples"];
}

export interface AIToolSchemaRes {
  standardTools: Array<AIToolSchema>;
  toolToExtendInfo: Record<string, ExtendedAIToolSchema>;
}

// Helper function to extract path parameters from URL path
function extractPathParameters(path: string): string[] {
  const matches = path.match(/{([^}]+)}/g) || [];
  return matches.map((match) => match.slice(1, -1));
}

/**
 * Creates a basic tool schema structure
 */
function createBasicToolSchema(
  method: string,
  path: string,
  operation: OAPIOperation,
  specification: OAPISpecDocument,
): ExtendedAIToolSchema {
  // Helper function to format a single response entry
  const formatResponse = ([code, response]: any) => {
    const schema = response.content?.["application/json"]?.schema ||
      response.content?.["*/*"]?.schema ||
      response.schema;
    const schemaInfo = schema
      ? p(` (schema: {schema})`)({
        schema: JSON.stringify(schema),
      })
      : "";
    return `${code}: ${response.description || "No description"}${schemaInfo}`;
  };

  const formatToolName = () => {
    const template = specification["x-tool-name-format"];

    // Create clean path for use in both template and fallback
    const cleanPath = path
      .replace(/[{}]/g, "") // Remove braces
      .replace(/[^a-zA-Z0-9]/g, "_") // Replace special chars with underscore
      .replace(/_+/g, "_") // Collapse multiple underscores
      .replace(/^_|_$/g, ""); // Remove leading/trailing underscores

    let toolName: string;

    if (!template) {
      // Prioritize operationId as it's more semantic and standard
      if (operation.operationId) {
        toolName = operation.operationId;
      } else {
        // Fallback: create readable name from method and clean path
        toolName = `${method}_${cleanPath}`;
      }
    } else {
      const placeholderValues: Record<string, string> = {
        method,
        cleanPath,
        operationId: operation.operationId || "",
      };

      toolName = p(template)(placeholderValues);
    }

    // Apply prefix and suffix regardless of whether template is used
    const prefix = specification["x-tool-name-prefix"] ?? "";
    const suffix = specification["x-tool-name-suffix"] ?? "";

    return `${prefix}${toolName}${suffix}`;
  };

  const examples = operation["x-examples"] ?? [];

  const name = formatToolName();

  const examplesSection = examples.length
    ? `\nExamples:\n${examples.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  const description = p(
    `{description}

API Endpoint: {method} {path}
{examplesSection}Parameter Usage:
- pathParams: Required for URLs with placeholders. Provide concrete values.
- inputParams: Required for query/body/form data. Provide as needed.
- headerParams: Optional. For dynamic headers only. If omitted, global headers will be used automatically.`,
  )({
    method: method.toUpperCase(),
    path,
    description: operation.description ||
      operation.summary ||
      `Execute ${method.toUpperCase()} request to ${path}`,
    examplesSection,
  });

  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        pathParams: {
          type: "object",
          description:
            `URL path variables. Provide string values or scripts for placeholders in the path. Required when path has variables.`,
          properties: {},
          required: [],
        },
        inputParams: {
          type: "object",
          description:
            `Request data for the API call. Provide string values or scripts for query parameters, body fields, or form data.`,
          properties: {},
          required: [],
        },
        headerParams: {
          type: "object",
          description:
            `HTTP headers for the request. Optional - if omitted, global headers will be used automatically. Only provide specific header values when needed.`,
          properties: {},
          required: [],
        },
      },
    },
    _rawOperation: operation,
    _meta: {
      method,
      path,
    },
  };
}

/**
 * Processes path parameters extracted from URL
 */
function processPathParameters(
  tool: ExtendedAIToolSchema,
  pathParams: string[],
): void {
  const pathParamProperties = tool.inputSchema.properties.pathParams.properties;
  const pathParamRequired = tool.inputSchema.properties.pathParams
    .required as string[];

  if (!pathParamProperties) {
    tool.inputSchema.properties.pathParams.properties = {};
  }

  for (const pathParam of pathParams) {
    tool.inputSchema.properties.pathParams.properties![pathParam] = {
      type: "string",
      description: p(`URL path parameter: {pathParam}`)({
        pathParam,
      }),
    };

    if (!pathParamRequired) {
      tool.inputSchema.properties.pathParams.required = [];
    }

    // Path parameters are always required
    pathParamRequired.push(pathParam);

    // If pathParams has required fields, make pathParams itself required
    if (!tool.inputSchema.required?.includes("pathParams")) {
      tool.inputSchema.required = tool.inputSchema.required || [];
      tool.inputSchema.required.push("pathParams");
    }
  }
}

/**
 * Processes operation parameters from OpenAPI spec
 */
function processOperationParameters(
  tool: ExtendedAIToolSchema,
  operation: OpenAPI.Operation,
): void {
  if (!operation.parameters) return;
  const sensitiveKV = operation["x-sensitive-params"] ?? {};

  for (const param of operation.parameters) {
    const typedParam = param as OpenAPI.Parameter & ParameterExtension;

    // Handle different parameter schema structures based on OpenAPI version
    let paramType = "string";
    let paramDescription = typedParam.description || "";
    let paramSchema: any = null;

    if ("schema" in typedParam && typedParam.schema) {
      // OpenAPI v3 style
      paramSchema = typedParam.schema;
      paramType = paramSchema.type || "string";
    } else if ("type" in typedParam) {
      // OpenAPI v2 style
      paramType = (typedParam as any).type || "string";
    }

    // Exclude sensitive parameters from tool input schema
    if (sensitiveKV[param.name]) {
      paramType = SENSITIVE_MARK;
    }

    if (typedParam.in === "path") {
      // processPathParameter(tool, typedParam, paramType, paramDescription);
    } else if (typedParam.in === "header") {
      processHeaderParameter(tool, typedParam, paramType, paramDescription);
    } else if (["query", "body", "formData"].includes(typedParam.in)) {
      processInputParameter(tool, typedParam, paramType, paramDescription);
    }
  }
}

/**
 * Processes an input parameter (query, body, formData)
 */
function processInputParameter(
  tool: ExtendedAIToolSchema,
  param: OpenAPI.Parameter,
  paramType: string,
  paramDescription: string,
): void {
  if (!tool.inputSchema.properties.inputParams.properties) {
    tool.inputSchema.properties.inputParams.properties = {};
  }

  if (!tool.inputSchema.properties.inputParams.required) {
    tool.inputSchema.properties.inputParams.required = [];
  }

  if (!tool.inputSchema.required) {
    tool.inputSchema.required = [];
  }

  const inputParamProperties =
    tool.inputSchema.properties.inputParams.properties;
  const inputParamRequired = tool.inputSchema.properties.inputParams
    .required as string[];

  if (paramType === SENSITIVE_MARK) {
    inputParamProperties[param.name] = {
      const: SENSITIVE_MARK,
      description: paramDescription,
    };
  } else {
    inputParamProperties[param.name] = {
      type: paramType,
      description: paramDescription,
    };
  }

  // Add to required list if parameter is required
  if (param.required) {
    inputParamRequired.push(param.name);

    // If inputParams has required fields, make inputParams itself required
    if (!tool.inputSchema.required.includes("inputParams")) {
      tool.inputSchema.required.push("inputParams");
    }
  }
}

/**
 * Processes a header parameter
 */
function processHeaderParameter(
  tool: ExtendedAIToolSchema,
  param: OpenAPI.Parameter,
  paramType: string,
  paramDescription: string,
): void {
  if (!tool.inputSchema.properties.headerParams.properties) {
    tool.inputSchema.properties.headerParams.properties = {};
  }

  if (!tool.inputSchema.properties.headerParams.required) {
    tool.inputSchema.properties.headerParams.required = [];
  }

  if (!tool.inputSchema.required) {
    tool.inputSchema.required = [];
  }

  const headerProperties = tool.inputSchema.properties.headerParams.properties;
  const headerRequired = tool.inputSchema.properties.headerParams
    .required as string[];

  if (paramType === SENSITIVE_MARK) {
    headerProperties[param.name] = {
      const: SENSITIVE_MARK,
      description: paramDescription,
    };
  } else {
    headerProperties[param.name] = {
      type: paramType,
      description: paramDescription,
    };
  }

  // Add to required list if parameter is required
  if (param.required) {
    // Note: We don't make headerParams itself required to keep it optional
    // Individual headers within headerParams can still be required
    // headerRequired.push(param.name);
  }
}

/**
 * Processes request body from OpenAPI v3 spec
 */
function processRequestBody(
  tool: ExtendedAIToolSchema,
  operation: OpenAPI.Operation,
): void {
  if (!operation.requestBody) return;

  const requestBody = operation.requestBody;
  const content = requestBody.content;

  if (
    !content ||
    !content["application/json"] ||
    !content["application/json"].schema
  ) {
    return;
  }

  let schema = content["application/json"].schema;
  const inputParamProperties =
    tool.inputSchema.properties.inputParams.properties || {};
  const inputParamRequired = tool.inputSchema.properties.inputParams
    .required as string[];

  // Merge request body properties into inputParams
  if (schema.properties) {
    for (const propName in schema.properties) {
      let propSchema = schema.properties[propName];
      inputParamProperties[propName] = propSchema as OpenAPI.SchemaObject;
    }
  }

  // Add required properties
  if (schema.required && Array.isArray(schema.required)) {
    inputParamRequired.push(...schema.required);

    // If inputParams has required fields, make inputParams itself required
    if (!tool.inputSchema.required?.includes("inputParams")) {
      tool.inputSchema.required = tool.inputSchema.required || [];
      tool.inputSchema.required.push("inputParams");
    }
  }
}

/**
 * Processes response schemas from OpenAPI spec
 */
function processResponseSchemas(
  tool: ExtendedAIToolSchema,
  operation: OpenAPI.Operation,
): void {
  if (!operation.responses) return;

  tool._responseSchema = {};

  for (const [code, response] of Object.entries(operation.responses)) {
    const typedResponse = response;
    let schema;

    if (
      "content" in typedResponse &&
      typedResponse.content &&
      (typedResponse.content["application/json"] ||
        typedResponse.content["*/*"]) &&
      (typedResponse.content["application/json"]?.schema ||
        typedResponse.content["*/*"]?.schema)
    ) {
      schema = typedResponse.content["application/json"]?.schema ||
        typedResponse.content["*/*"]?.schema;
    } else if ("schema" in typedResponse && typedResponse.schema) {
      // OpenAPI v2 style
      schema = typedResponse.schema;
    }

    if (schema) {
      tool._responseSchema[code] = schema;
    }
  }
}

export async function openapiToAIToolSchema(
  specification: OAPISpecDocument,
): Promise<AIToolSchemaRes> {
  let tools: Array<ExtendedAIToolSchema> = [];
  // Extract paths from the OpenAPI spec
  const paths = specification.paths || {};

  // Process each path and method
  for (const path in paths) {
    const pathItem = paths[path];

    // Extract path parameters from the URL path
    const pathParams = extractPathParameters(path);

    // Process each HTTP method (GET, POST, PUT, DELETE, etc.)
    for (const method in pathItem) {
      if (["get", "post", "put", "delete", "patch"].includes(method)) {
        const operation = pathItem[
          method as keyof typeof pathItem
        ] as OAPIOperation;

        const tool = createBasicToolSchema(
          method,
          path,
          operation,
          specification,
        );

        // Process response schemas with specification for ref resolution
        processResponseSchemas(tool, operation);

        // Process path parameters
        processPathParameters(tool, pathParams);

        // Process operation parameters with specification for ref resolution
        processOperationParameters(tool, operation);

        // Process request body with specification for ref resolution
        processRequestBody(tool, operation);

        // Add method and path as separate properties to the tool schema
        tool.method = method.toUpperCase();
        tool.path = path;

        tools.push(tool);
      }
    }
  }

  // Ensure all tools have unique names for better agent consumption
  tools = ensureUniqueToolNames(tools);

  // Strip internal properties for standardTools
  const standardTools = tools.map((t) => {
    const standardTool: AIToolSchema = {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      method: t.method,
      path: t.path,
    };

    if (t.examples) {
      standardTool.examples = t.examples;
    }

    // Derive outputSchema from the 200/2xx response schema if available.
    // MCP SDK requires outputSchema.type to be exactly "object", so we only
    // forward schemas that already declare that type.
    const successSchema = t._responseSchema
      ? (t._responseSchema["200"] || t._responseSchema["201"] ||
        t._responseSchema["202"])
      : undefined;
    if (
      successSchema &&
      typeof successSchema === "object" &&
      successSchema !== null &&
      (successSchema as Record<string, unknown>).type === "object"
    ) {
      standardTool.outputSchema = successSchema as AIToolSchema["outputSchema"];
    }

    return standardTool;
  });

  // Build lookup map for extended tool info
  const toolToExtendInfo = tools.reduce((acc, t) => {
    acc[t.name] = t;
    return acc;
  }, {} as Record<string, ExtendedAIToolSchema>);

  const res = {
    standardTools,
    toolToExtendInfo,
  };

  return res;
}

// Helper function to ensure unique tool names
function ensureUniqueToolNames(
  tools: ExtendedAIToolSchema[],
): ExtendedAIToolSchema[] {
  const seen = new Set<string>();

  return tools.map((tool) => {
    let candidate = tool.name;
    let suffix = 1;

    while (seen.has(candidate)) {
      candidate = `${tool.name}_${suffix}`;
      suffix++;
    }

    seen.add(candidate);
    tool.name = candidate;
    return tool;
  });
}
