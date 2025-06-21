/**
 * Value processing utilities for OAPI Invoker
 * Handles recursive processing of values (strings, objects, arrays) with script execution support
 */

import { isArray, isObject, isNull } from "@es-toolkit/es-toolkit/compat";
import { processStringValue, headerKeyToEnvVar } from "./script-executor.ts";

/**
 * Processes any value (string, object, or array), executing scripts and replacing template variables
 */
export async function processValue(
  value: unknown,
  env: Record<string, string> = {}
): Promise<unknown> {
  if (typeof value === "string") {
    return await processStringValue(value, env);
  }

  if (isArray(value)) {
    const processedArray = [];
    for (const item of value) {
      processedArray.push(await processValue(item, env));
    }
    return processedArray;
  }

  if (isObject(value) && !isNull(value)) {
    const processedObject: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      processedObject[key] = await processValue(val, env);
    }
    return processedObject;
  }

  return value;
}

/**
 * Processes all headers, executing scripts and replacing template variables
 * Headers are processed in order to allow later scripts to use earlier results
 */
export async function processHeaders(
  headers: Record<string, string>
): Promise<Record<string, string>> {
  const processedHeaders: Record<string, string> = {};
  const env: Record<string, string> = {};

  // Process headers in order, allowing later scripts to use earlier results
  for (const [key, value] of Object.entries(headers)) {
    const result = await processStringValue(value, env);

    processedHeaders[key] = result;

    // Store the result in env for potential use by other scripts
    // Convert header key to env var format (lowercase to uppercase, dashes to underscores)
    const envKey = headerKeyToEnvVar(key);
    env[envKey] = result;
    env[key.replace(/-/g, "_")] = result; // Also store with original case pattern
  }

  return processedHeaders;
}

/**
 * Processes path parameters, executing scripts and replacing template variables
 */
export async function processPathParams(
  pathParams: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return (await processValue(pathParams)) as Record<string, unknown>;
}

/**
 * Processes input parameters, executing scripts and replacing template variables
 */
export async function processInputParams(
  inputParams: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return (await processValue(inputParams)) as Record<string, unknown>;
}

/**
 * Processes all request values (headers, pathParams, inputParams) in a unified way
 */
export async function processRequestValues(
  headers: Record<string, string>,
  pathParams: Record<string, unknown>,
  inputParams: Record<string, unknown>
): Promise<{
  headers: Record<string, string>;
  pathParams: Record<string, unknown>;
  inputParams: Record<string, unknown>;
}> {
  // Process headers first since they may create environment variables for other values
  const processedHeaders = await processHeaders(headers);

  // Process other values in parallel since they don't depend on each other
  const [processedPathParams, processedInputParams] = await Promise.all([
    processValue(pathParams) as Promise<Record<string, unknown>>,
    processValue(inputParams) as Promise<Record<string, unknown>>,
  ]);

  return {
    headers: processedHeaders,
    pathParams: processedPathParams,
    inputParams: processedInputParams,
  };
}
