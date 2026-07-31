import {
  cloneDeep,
  extend,
  flow,
  get,
  has,
  isArray,
  isNull,
  isObject,
  map,
  reduce,
  set,
  unset,
} from "@es-toolkit/es-toolkit/compat";
import {
  generateTencentCloudSignature,
  type TencentCloudAuthConfig,
} from "./adapters/auth/tc3-hmac-sha256.ts";
import type { OAPISpecDocument } from "./parser.ts";
import type { ExtendedAIToolSchema } from "./translator.ts";
import { p } from "../utils/template.ts";
import { processRequestValues, processValue } from "./value-processor.ts";
import { SENSITIVE_MARK } from "./constants.ts";
import process from "node:process";

export interface InvokerParams {
  pathParams?: Record<string, unknown>;
  inputParams?: Record<string, unknown>;
  headerParams?: Record<string, unknown>;
}

interface InvokerResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  debugInfo: DebugInfo | null;
  raw: Response;
}

interface DebugInfo {
  tool: {
    name: string;
    method: string;
    path: string;
    operationId?: string;
  };
  request: {
    url: string;
    finalHeaders: Record<string, string>;
    body?: string;
    timeout: number;
    retries: number;
  };
  response: {
    status: number;
    statusText: string;
    contentType: string;
    headers: Record<string, string>;
  };
  processing: {
    pathParams: Record<string, unknown>;
    inputParams: Record<string, unknown>;
    sensitiveParams: Record<string, unknown>;
    usedProxy: boolean;
    usedTencentCloudAuth: boolean;
    pathRemapped: boolean;
  };
}

/**
 * Invokes a tool by name with the provided parameters
 *
 * @TODO: CacheConfigSchema ParameterExtensionSchema ResponseExtensionSchema
 */
/**
 * Hook context passed to beforeInvoke hooks.
 * Mutating `sensitiveParams` or `env` in the hook affects the outgoing request.
 */
export interface InvokeHookContext {
  /** The MCP tool name being invoked */
  toolName: string;
  /** HTTP method (lowercase) */
  method: string;
  /** User-supplied input parameters (already processed for templates/scripts) */
  inputParams: Record<string, unknown>;
  /** User-supplied path parameters (already processed) */
  pathParams: Record<string, unknown>;
  /**
   * Sensitive parameters from `x-sensitive-params`.
   * Mutate this object to dynamically set credentials based on inputParams.
   */
  sensitiveParams: Record<string, unknown>;
  /**
   * Environment variables used for `{VAR}` template replacement.
   * Includes static env from config, `INPUT_*` vars derived from inputParams,
   * and process.env as fallback. Mutate to inject extra vars for template resolution.
   */
  env: Record<string, string>;
}

export type InvokeHook = (ctx: InvokeHookContext) => void | Promise<void>;

export async function invoke(
  spec: OAPISpecDocument,
  extendTool: ExtendedAIToolSchema,
  params: InvokerParams,
  /** Extra env vars for {VAR} template replacement, takes priority over process.env */
  env: Record<string, string> = {},
  /** Optional hook called before the request is made, after inputParams are processed */
  beforeInvoke?: InvokeHook,
  /** When `true`, suppresses the retry-failure console error. */
  silent?: boolean,
): Promise<InvokerResponse> {
  const requestConfigGlobal = spec["x-request-config"] || {};
  const isDebugMode =
    (env["OAPI_INVOKER_DEBUG"] ?? process.env["OAPI_INVOKER_DEBUG"]) === "1";

  const { pathParams = {}, inputParams = {}, headerParams = {} } = params;

  const baseUrl = requestConfigGlobal.baseUrl || spec.servers?.[0]?.url;
  const { headers = {}, timeout = 30000, retries = 0 } = requestConfigGlobal;

  const method = extendTool.method?.toLowerCase() || "get";

  // Process all request values in one place
  const processed = await processRequestValues(
    { ...headers },
    pathParams,
    inputParams,
    headerParams,
    env,
  );

  const processedPathParams = processed.pathParams;
  const processedInputParams = processed.inputParams;
  const processedHeaderParams = processed.headerParams;
  let requestHeaders = processed.headers;

  // Add processed header parameters to requestHeaders
  for (const [name, value] of Object.entries(processedHeaderParams)) {
    if (value !== undefined) {
      requestHeaders[name] = String(value);
    }
  }

  const path = p(extendTool.path!)(processedPathParams);
  const _op = (extendTool._rawOperation || {}) as Record<string, unknown>;
  const specificUrl = _op["x-custom-base-url"] as string | undefined;
  const customPathTemplate = _op["x-custom-path"] as string | undefined;
  const sensitiveParams = cloneDeep(
    (_op["x-sensitive-params"] as Record<string, unknown>) ?? {},
  );

  // Build enriched env: static env + INPUT_* vars from user's processed inputParams
  // This allows x-sensitive-params scripts/templates to reference user inputs,
  // e.g. {INPUT_APPID} resolves to the user-supplied appid value.
  const enrichedEnv: Record<string, string> = { ...env };
  for (const [k, v] of Object.entries(processedInputParams)) {
    if (
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ) {
      enrichedEnv[`INPUT_${k.toUpperCase()}`] = String(v);
    }
  }

  // Allow callers to dynamically modify sensitiveParams/env before template resolution
  if (beforeInvoke) {
    await beforeInvoke({
      toolName: extendTool.name,
      method,
      inputParams: processedInputParams,
      pathParams: processedPathParams,
      sensitiveParams,
      env: enrichedEnv,
    });
  }

  // Process sensitiveParams templates/scripts with the enriched env
  const resolvedSensitiveParams = await processValue(
    sensitiveParams,
    enrichedEnv,
  ) as Record<string, unknown>;

  const mergedInputParams = extend(
    processedInputParams,
    resolvedSensitiveParams,
  );

  // Initialize debug info if debug mode is enabled
  let debugInfo: DebugInfo | null = null;
  if (isDebugMode) {
    debugInfo = {
      tool: {
        name: extendTool.name,
        method: method,
        path: path,
        operationId: _op.operationId as string | undefined,
      },
      request: {
        url: "",
        finalHeaders: {},
        timeout,
        retries,
      },
      response: {
        status: 0,
        statusText: "",
        contentType: "",
        headers: {},
      },
      processing: {
        pathParams: cloneDeep(processedPathParams),
        inputParams: cloneDeep(mergedInputParams),
        sensitiveParams: cloneDeep(resolvedSensitiveParams),
        usedProxy: false,
        usedTencentCloudAuth: false,
        pathRemapped: false,
      },
    };
  }

  if ((!specificUrl && !baseUrl) || !method || !path) {
    throw new Error("Invalid tool configuration, no URL/method/path");
  }

  let requestBody: string | null = null;

  // Determine final path: use x-custom-path (processed) if provided, otherwise use operation path
  const finalPath = customPathTemplate
    ? p(customPathTemplate)(processedPathParams)
    : path;

  // Update debug info tool.path to reflect final path when debug is enabled
  if (debugInfo) {
    debugInfo.tool.path = finalPath;
  }

  if ((!specificUrl && !baseUrl) || !method || !finalPath) {
    throw new Error("Invalid tool configuration");
  }

  let url = new URL(specificUrl ?? baseUrl);

  const pathItems = finalPath.split("/").slice(1);
  const pathRemaps = _op["x-remap-path-to-header"] as string[] | undefined;
  if (pathRemaps) {
    if (debugInfo) {
      debugInfo.processing.pathRemapped = true;
    }
    for (const headerKey of pathRemaps) {
      const currVal = pathItems.shift();
      if (currVal) {
        requestHeaders[headerKey] = currVal;
      }
    }
  } else {
    // Preserve base URL's path and append the tool path to support multi-level base URLs
    // Remove trailing slash from base path if present, then concatenate
    url.pathname = url.pathname.replace(/\/$/, "") + finalPath;
  }

  // Separate query parameters from body parameters for all requests
  const queryParams: Record<string, unknown> = {};
  const bodyParams: Record<string, unknown> = {};

  // Extract query parameter names from raw operation
  const queryParamNames = new Set<string>();
  if (_op.parameters) {
    for (const param of _op.parameters as Array<{ in: string; name: string }>) {
      if (param.in === "query") {
        queryParamNames.add(param.name);
      }
    }
  }

  // Separate inputParams into query and body parameters
  for (const [key, value] of Object.entries(mergedInputParams)) {
    if (queryParamNames.has(key)) {
      queryParams[key] = value;
    } else {
      bodyParams[key] = value;
    }
  }

  // Add query parameters to URL for all requests
  if (Object.keys(queryParams).length > 0) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (typeof value === "object") {
        url.searchParams.append(key, JSON.stringify(value));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }

  // Add body for non-GET requests (only if there are body parameters)
  if (method !== "get" && Object.keys(bodyParams).length > 0) {
    requestBody = JSON.stringify(bodyParams);
    requestHeaders["content-type"] = "application/json";
  }

  // Handle Tencent Cloud API authentication if configured
  if (
    spec.components?.securitySchemes?.TencentCloudAuth &&
    requestConfigGlobal.auth?.TencentCloudAuth
  ) {
    if (debugInfo) {
      debugInfo.processing.usedTencentCloudAuth = true;
    }

    const authConfig: TencentCloudAuthConfig = {
      ...requestConfigGlobal.auth.TencentCloudAuth,
    };

    // Get action from operation if available
    if (_op.operationId && !authConfig.action) {
      authConfig.action = _op.operationId as string;
    }
    if (requestHeaders["x-tc-service"]) {
      authConfig.service = requestHeaders["x-tc-service"];
    }

    // Prepare headers with TC3-HMAC-SHA256 signature
    // @ts-ignore: generateTencentCloudSignature function signature may not match perfectly with Type`Script`
    requestHeaders = generateTencentCloudSignature(
      method,
      finalPath,
      url.searchParams,
      requestHeaders,
      requestBody,
      authConfig,
    );
  }

  if (requestConfigGlobal.proxy) {
    if (debugInfo) {
      debugInfo.processing.usedProxy = true;
    }
    const proxyConfig = requestConfigGlobal.proxy;
    const newUrl = new URL(proxyConfig.url);
    newUrl.searchParams.set(proxyConfig.param, url.toString());
    url = newUrl;
  }

  // Update debug info with final request details
  if (debugInfo) {
    debugInfo.request.url = url.toString();
    debugInfo.request.finalHeaders = { ...requestHeaders };
    debugInfo.request.body = requestBody ?? undefined;
  }

  const requestOptions: RequestInit = {
    method: method.toUpperCase(),
    headers: requestHeaders,
    signal: AbortSignal.timeout(timeout),
  };

  if (requestBody) {
    requestOptions.body = requestBody;
  }

  // Make the request with retries
  let response: Response | null = null;
  let error: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      response = await fetch(url.toString(), requestOptions);
      break;
    } catch (err) {
      error = err as Error;
      if (!silent) {
        console.error(
          `Attempt ${
            attempt + 1
          } failed for tool ${extendTool.name}: ${error.message}`,
          error,
        );
      }
      if (attempt === retries) {
        throw new Error(
          `Failed to invoke tool ${extendTool.name}: ${error.message}`,
        );
      }
      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }

  if (!response) {
    throw new Error(`Failed to invoke tool ${extendTool.name}: No response`);
  }

  let data: unknown;
  const contentType = response.headers.get("content-type") || "";

  // Read the response body once as text
  const responseText = await response.text();

  if (contentType.includes("application/json")) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  } else {
    data = responseText;
  }

  // Update debug info with response details
  if (debugInfo) {
    debugInfo.response.status = response.status;
    debugInfo.response.statusText = response.statusText;
    debugInfo.response.contentType = contentType;
    response.headers.forEach((value, key) => {
      debugInfo!.response.headers[key] = value;
    });
  }

  // Post process response
  data = postProcess(spec, extendTool, data);

  const headerObj: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerObj[key] = value;
  });

  const invokerResponse = {
    status: response.status,
    statusText: response.statusText,
    headers: headerObj,
    data,
    debugInfo,
    raw: response,
  };

  return invokerResponse;
}

/**
 * Expands wildcard paths in the given keys array.
 * Supports:
 * - "*" wildcard for matching all properties at the current level
 * - "**" wildcard for matching all properties at all nested levels
 *
 * @param item The object to process
 * @param keys Array of path strings that may contain wildcards
 * @returns Array of expanded path strings with wildcards resolved to actual paths
 */
function expandWildcardPaths(item: unknown, keys: string[]): string[] {
  if (!isObject(item) || isNull(item) || keys.length === 0) {
    return keys;
  }

  const expandedPaths: string[] = [];

  for (const key of keys) {
    if (!key.includes("*")) {
      // No wildcards, add as is
      expandedPaths.push(key);
      continue;
    }

    const segments = key.split(".");
    expandPathRecursive(item, segments, 0, "", expandedPaths);
  }

  return expandedPaths;
}

/**
 * Recursively expands a path with wildcards
 */
function expandPathRecursive(
  obj: unknown,
  segments: string[],
  index: number,
  currentPath: string,
  result: string[],
): void {
  if (index >= segments.length) {
    if (currentPath.length > 0) {
      result.push(currentPath.substring(1)); // Remove leading dot
    }
    return;
  }

  const segment = segments[index];

  // Handle "**" (all nested levels)
  if (segment === "**") {
    // Include current path (if we're not at the start)
    if (index > 0 && index < segments.length - 1) {
      expandPathRecursive(obj, segments, index + 1, currentPath, result);
    }

    // Recursively process all properties at this level and deeper
    if (isObject(obj) && !isNull(obj)) {
      for (const key in obj) {
        // Use get to safely access properties
        const value = get(obj, key);
        const newPath = `${currentPath}.${key}`;

        // Continue with ** at the same position for nested objects
        if (isObject(value) && !isNull(value)) {
          expandPathRecursive(value, segments, index, newPath, result);
        }

        // Also try to continue with the next segment
        expandPathRecursive(value, segments, index + 1, newPath, result);
      }
    }
    return;
  }

  // Handle "*" (current level only)
  if (segment === "*") {
    if (isObject(obj) && !isNull(obj)) {
      for (const key in obj) {
        const newPath = `${currentPath}.${key}`;
        // Use get to safely access properties
        expandPathRecursive(
          get(obj, key),
          segments,
          index + 1,
          newPath,
          result,
        );
      }
    }
    return;
  }

  // Regular property
  if (isObject(obj) && !isNull(obj) && has(obj, segment)) {
    const newPath = `${currentPath}.${segment}`;
    expandPathRecursive(
      get(obj, segment),
      segments,
      index + 1,
      newPath,
      result,
    );
  }
}

/**
 * Recursively finds all paths in an object where the property name matches the given key
 * @param obj The object to search
 * @param key The property name to match
 * @param currentPath Current path being built (used in recursion)
 * @param result Array to collect matching paths
 */
function findMatchingPropertyPaths(
  obj: unknown,
  key: string,
  currentPath: string = "",
  result: string[] = [],
): string[] {
  if (!isObject(obj) || isNull(obj)) {
    return result;
  }

  // Check all properties at current level
  for (const prop in obj) {
    const newPath = currentPath ? `${currentPath}.${prop}` : prop;

    // If property name matches the key, add it to results
    if (prop === key) {
      result.push(newPath);
    }

    // Recursively check nested objects
    // Use get to safely access properties and avoid TypeScript index signature errors
    const value = get(obj, prop);
    if (isObject(value) && !isNull(value)) {
      findMatchingPropertyPaths(value, key, newPath, result);
    }
  }

  return result;
}

/**
 * Transforms a single data item (object) by applying inclusion, exclusion, and sensitive field masking rules.
 */
function transformItem(
  item: unknown,
  includeKeys: string[],
  excludeKeys: string[],
  sensitiveKeys: string[],
): unknown {
  // If item is not an object or is null, transformations do not apply.
  if (!isObject(item) || isNull(item)) {
    return item;
  }

  // Process keys that don't contain dots for recursive property name matching
  const processedExcludeKeys = excludeKeys.flatMap((key) => {
    // If key doesn't contain dots, find all paths with matching property name
    if (!key.includes(".") && !key.includes("*")) {
      return findMatchingPropertyPaths(item, key);
    }
    return key;
  });

  const processedIncludeKeys = includeKeys.flatMap((key) => {
    if (!key.includes(".") && !key.includes("*")) {
      return findMatchingPropertyPaths(item, key);
    }
    return key;
  });

  const processedSensitiveKeys = sensitiveKeys.flatMap((key) => {
    if (!key.includes(".") && !key.includes("*")) {
      return findMatchingPropertyPaths(item, key);
    }
    return key;
  });

  // Expand wildcard paths in all key arrays
  const expandedIncludeKeys = expandWildcardPaths(item, processedIncludeKeys);
  const expandedExcludeKeys = expandWildcardPaths(item, processedExcludeKeys);
  const expandedSensitiveKeys = expandWildcardPaths(
    item,
    processedSensitiveKeys,
  );

  /**
   * Step 1: Creates the initial processed item.
   * If `includeKeys` are provided, a new object is constructed containing only those keys.
   * Otherwise, a deep clone of the original item is made.
   * @param {any} originalItem - The item to process.
   * @returns {any} The initial state of the processed item.
   */
  const createInitialItem = (originalItem: unknown): unknown => {
    if (expandedIncludeKeys.length > 0) {
      return reduce(
        expandedIncludeKeys,
        (acc: Record<string, unknown>, pathString: string) => {
          const value = get(originalItem, pathString);
          if (value !== undefined) {
            set(acc, pathString, value);
          }
          return acc;
        },
        {},
      );
    }
    return cloneDeep(originalItem);
  };

  /**
   * Step 2: Applies exclusion logic to the item.
   * Keys specified in `excludeKeys` are deeply removed from the item.
   * This function mutates `currentProcessedItem`.
   * @param {any} currentProcessedItem - The item after inclusion/cloning.
   * @returns {any} The item with specified keys excluded.
   */
  const applyExclusions = (currentProcessedItem: unknown): unknown => {
    if (
      expandedExcludeKeys.length === 0 ||
      !isObject(currentProcessedItem) ||
      isNull(currentProcessedItem)
    ) {
      return currentProcessedItem;
    }

    // Use lodash's unset for cleaner path handling
    for (const pathString of expandedExcludeKeys) {
      unset(currentProcessedItem, pathString);
    }

    return currentProcessedItem;
  };

  /**
   * Step 3: Applies sensitive field masking to the item.
   * Values of keys specified in `sensitiveKeys` are replaced with "***SENSITIVE***".
   * @param {any} currentProcessedItem - The item after exclusions.
   * @returns {any} The item with sensitive fields masked.
   */
  const applySensitization = (currentProcessedItem: unknown): unknown => {
    if (
      expandedSensitiveKeys.length === 0 ||
      !isObject(currentProcessedItem) ||
      isNull(currentProcessedItem)
    ) {
      return currentProcessedItem;
    }
    return reduce(
      expandedSensitiveKeys,
      (acc: Record<string, unknown>, pathString: string) => {
        if (has(acc, pathString)) {
          set(acc, pathString, SENSITIVE_MARK);
        }
        return acc;
      },
      currentProcessedItem as Record<string, unknown>,
    );
  };

  // Chain the transformation steps using _.flow (lodash equivalent of R.pipe)
  return flow(createInitialItem, applyExclusions, applySensitization)(item);
}

/**
 * Post-processes response data based on OpenAPI extension properties (x-include-response-keys,
 * x-exclude-response-keys, x-sensitive-response-fields) defined in an operation.
 * Supports dot-notation for nested keys (e.g., "a.b.c").
 */
export function postProcess(
  _spec: OAPISpecDocument,
  extendTool: ExtendedAIToolSchema,
  data: unknown,
): unknown {
  const responseConfigGlobal = _spec["x-response-config"] || {};
  const op = extendTool._rawOperation;
  const processData = () => {
    if (!op) {
      return data;
    }

    const includeResponseKeys: string[] = op["x-include-response-keys"] ||
      responseConfigGlobal["includeResponseKeys"] ||
      [];
    const excludeResponseKeys: string[] = op["x-exclude-response-keys"] ||
      responseConfigGlobal["excludeResponseKeys"] ||
      [];
    const sensitiveResponseFields: string[] =
      op["x-sensitive-response-fields"] ||
      responseConfigGlobal["sensitiveResponseFields"] ||
      [];

    // If no transformation rules are defined, return the data unmodified.
    if (
      includeResponseKeys.length === 0 &&
      excludeResponseKeys.length === 0 &&
      sensitiveResponseFields.length === 0
    ) {
      return data;
    }

    const wasArray = isArray(data);
    const itemsToProcess = wasArray ? data : [data];

    // Use _.map for transformation
    const processedItems = map(itemsToProcess, (currentItem: unknown) => {
      return transformItem(
        currentItem,
        includeResponseKeys,
        excludeResponseKeys,
        sensitiveResponseFields,
      );
    });

    return wasArray ? processedItems : processedItems[0];
  };

  const processedData = processData();
  return truncateData(processedData, responseConfigGlobal.maxLength);
}

function truncateData(data: unknown, maxLength?: number): unknown {
  if (!maxLength) {
    return data;
  }

  const stringified = JSON.stringify(data, null, 2);
  if (stringified.length <= maxLength) {
    return data;
  }

  return {
    message:
      `Response was truncated (length: ${stringified.length}, max: ${maxLength})`,
    truncatedData: stringified.slice(0, maxLength) + "...",
  };
}
