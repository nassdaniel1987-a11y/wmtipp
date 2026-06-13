import js from "@eslint/js";
import react from "eslint-plugin-react";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "android-app/**", "scripts/**"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // Kernschutz beim Aufteilen von App.jsx: vergessene Importe sofort melden.
      "no-undef": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
    },
  },
  {
    files: ["netlify/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        Netlify: "readonly",
        Response: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
];
