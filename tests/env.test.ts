import { describe, it } from "node:test";
import assert from "node:assert";
import { loadEnvFile, resolveToken, MIRO_TOKEN_ENV_VAR } from "../src/env.js";

/**
 * Runs `action` with `MIRO_TOKEN` guaranteed to be unset. Any `.env` file is
 * loaded first, so that `resolveToken` (which loads it at most once) cannot
 * re-populate the variable from disk while the action runs.
 */
function withoutEnvToken<T>(action: () => T): T {
  loadEnvFile();

  const previous = process.env[MIRO_TOKEN_ENV_VAR];
  delete process.env[MIRO_TOKEN_ENV_VAR];

  try {
    return action();
  } finally {
    if (previous !== undefined) {
      process.env[MIRO_TOKEN_ENV_VAR] = previous;
    }
  }
}

describe("resolveToken", () => {
  it("prefers an explicitly given token", () => {
    process.env[MIRO_TOKEN_ENV_VAR] = "from-environment";

    assert.equal(resolveToken("explicit"), "explicit");
  });

  it("falls back to the environment variable", () => {
    process.env[MIRO_TOKEN_ENV_VAR] = "from-environment";

    assert.equal(resolveToken(), "from-environment");
    assert.equal(resolveToken(undefined), "from-environment");
  });

  it("ignores blank values", () => {
    process.env[MIRO_TOKEN_ENV_VAR] = "from-environment";

    assert.equal(resolveToken("   "), "from-environment");

    process.env[MIRO_TOKEN_ENV_VAR] = "  padded  ";
    assert.equal(resolveToken(), "padded");
  });

  it("returns undefined when no token is available", () => {
    withoutEnvToken(() => {
      assert.equal(resolveToken(), undefined);
      assert.equal(resolveToken(""), undefined);
    });
  });
});

describe("loadEnvFile", () => {
  it("reports false for a file that does not exist", () => {
    assert.equal(loadEnvFile("this-file-does-not-exist.env"), false);
  });

  it("only loads a given file once", () => {
    const path = "tests/fixtures/sample.env";

    assert.equal(loadEnvFile(path), true);
    assert.equal(process.env.MIRO_EXPORT_ENV_FILE_TEST, "loaded");

    // second call is a no-op
    assert.equal(loadEnvFile(path), false);
  });

  it("does not override variables already set in the environment", () => {
    process.env.MIRO_EXPORT_ENV_PRECEDENCE_TEST = "from-environment";

    assert.equal(loadEnvFile("tests/fixtures/precedence.env"), true);
    assert.equal(
      process.env.MIRO_EXPORT_ENV_PRECEDENCE_TEST,
      "from-environment"
    );
  });
});
