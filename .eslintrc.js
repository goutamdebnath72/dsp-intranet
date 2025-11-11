// TypeScript 5.9 + Next 14 + Sequelize compatible
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    warnOnUnsupportedTypeScriptVersion: false, // hides the 5.9 warning
  },
  plugins: ["@typescript-eslint", "react", "react-hooks", "jsx-a11y"],
  extends: [
    "next",
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
  ],
  rules: {
    // ✅ relaxed JSX and TypeScript rules for your current codebase
    "react/no-unescaped-entities": "off",
    "@next/next/no-img-element": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",

    // ✅ accessibility rules that are noisy for internal apps
    "jsx-a11y/no-static-element-interactions": "off",
    "jsx-a11y/click-events-have-key-events": "off",
    "jsx-a11y/no-autofocus": "off",
    "jsx-a11y/anchor-is-valid": "off",

    // ✅ hooks
    "react-hooks/exhaustive-deps": "off",
  },
};

