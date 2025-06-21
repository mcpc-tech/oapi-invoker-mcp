/**
 * Script execution utilities for OAPI Invoker
 * Handles dynamic script execution for generating values at runtime
 */

/**
 * Executes a Deno script and returns the output
 */
export async function executeScript(
  script: string,
  env: Record<string, string> = {}
): Promise<string> {
  try {
    // Create a temporary file for the script using tmpdir
    const tempDir = Deno.env.get("TMPDIR") || Deno.env.get("TMP") || "/tmp";
    const tempFile = `${tempDir}/script_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2)}.ts`;

    // Make sure script is executable
    await Deno.writeTextFile(tempFile, script, { mode: 0o755 });

    // Execute the script using deno run with permissions
    const command = new Deno.Command("deno", {
      args: ["run", "--allow-all", tempFile],
      env: { ...Deno.env.toObject(), ...env },
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    // Clean up temp file
    try {
      await Deno.remove(tempFile);
    } catch {
      // Ignore cleanup errors
    }

    if (code !== 0) {
      const errorMessage = new TextDecoder().decode(stderr);
      throw new Error(`Script execution failed: ${errorMessage}`);
    }

    return new TextDecoder().decode(stdout);
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
    typeof value === "string" && value.trim().startsWith("#!/usr/bin/env deno")
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
  let processedValue = value;
  const templateRegex = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

  return processedValue.replace(templateRegex, (match, envVar) => {
    return Deno.env.get(envVar) || env[envVar] || "";
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
  // Check if the value is a script (starts with #!/usr/bin/env deno)
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
