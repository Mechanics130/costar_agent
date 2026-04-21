// SPDX-License-Identifier: Apache-2.0

import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "assets/**",
      "docs/**",
      "examples/**/*.json",
      "examples/**/*.md",
      "relationship-*/samples/**",
      "relationship-*/scenarios/**",
      "validation-runs/**",
    ],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
