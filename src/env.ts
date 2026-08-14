import { existsSync } from "fs";

/**
 * Environment variable that may hold the Miro token, so that it does not
 * have to be passed on the command line or in code.
 */
export const MIRO_TOKEN_ENV_VAR = "MIRO_TOKEN";

const DEFAULT_ENV_FILE = ".env";

const loadedEnvFiles = new Set<string>();

/**
 * Loads variables from a `.env` file into `process.env` if that file exists.
 * Variables that are already set in the real environment take precedence over
 * the ones defined in the file.
 *
 * Calling this more than once for the same path is a no-op.
 *
 * @returns whether the file existed and was loaded
 */
export function loadEnvFile(path: string = DEFAULT_ENV_FILE): boolean {
  if (loadedEnvFiles.has(path)) {
    return false;
  }
  loadedEnvFiles.add(path);

  if (!existsSync(path)) {
    return false;
  }

  process.loadEnvFile(path);
  return true;
}

/**
 * Resolves the Miro token to use. An explicitly given token always wins;
 * otherwise the `MIRO_TOKEN` environment variable is used, which may also be
 * defined in a `.env` file in the working directory.
 *
 * @returns the token, or undefined when none is available
 */
export function resolveToken(token?: string): string | undefined {
  const explicit = token?.trim();
  if (explicit) {
    return explicit;
  }

  loadEnvFile();

  const fromEnvironment = process.env[MIRO_TOKEN_ENV_VAR]?.trim();
  return fromEnvironment ? fromEnvironment : undefined;
}
