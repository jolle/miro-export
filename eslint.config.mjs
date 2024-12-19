import tseslint from "typescript-eslint";
import promise from "eslint-plugin-promise";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import stylisticTs from "@stylistic/eslint-plugin-ts";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  promise.configs["flat/recommended"],
  prettierRecommended,
  {
    ignores: ["**/build"],

    plugins: {
      "@stylistic/ts": stylisticTs
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 6,
      sourceType: "module"
    },

    rules: {
      "@typescript-eslint/naming-convention": "warn",
      "@stylistic/ts/semi": "warn",
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "off"
    }
  }
];
