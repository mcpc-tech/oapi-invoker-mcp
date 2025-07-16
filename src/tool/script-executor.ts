import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Script execution utilities for OAPI Invoker
 * Handles dynamic script execution for generating values at runtime
 */

/**
 * Executes a script and returns the output
 */
export async function executeScript(
  script: string,
  env: Record<string, string> = {}
): Promise<string> {
  try {
    // Create a temporary file for the script using tmpdir
    const tempDir = tmpdir();
    const tempFile = join(tempDir, `script_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2)}`);

    // Write script to temporary file with executable permissions
    await fs.writeFile(tempFile, script, { mode: 0o755 });

    // Execute the script file directly using shebang
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(tempFile, [], {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code: code || 0, stdout, stderr });
      });
    });

    // Clean up temp file
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }

    if (result.code !== 0) {
      throw new Error(`Script execution failed: ${result.stderr}`);
    }

    return result.stdout;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute script: ${errorMessage}`);
  }
}

/**
 * Checks if a value is a script (starts with shebang)
 */
export function isScript(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().startsWith("#!")
  );
}

/**
 * Processes template variables in a string value
 * Replaces {VAR_NAME} patterns with environment variable values
 */
export function processTemplateVariables(
  value: string,
  env: Record<string, string> = {}
): string {
  const templateRegex = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

  return value.replace(templateRegex, (_match, envVar) => {
    return process.env[envVar] || env[envVar] || "";
  });
}

/**
 * Processes a single string value, executing scripts or processing templates
 */
export async function processStringValue(
  value: string,
  env: Record<string, string> = {}
): Promise<string> {
  console.log("Processing string value:", value, env);
  // Check if the value is a script (starts with shebang #!)
  if (isScript(value)) {
    return await executeScript(value, env);
  }

  // Process template variables
  return processTemplateVariables(value, env);
}

/**
 * Converts a header key to environment variable format
 * e.g., "x-rio-timestamp" -> "x_rio_timestamp"
 */
export function headerKeyToEnvVar(headerKey: string): string {
  return headerKey.toLowerCase().replace(/-/g, "_");
}
