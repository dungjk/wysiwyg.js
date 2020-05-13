import { terser } from "rollup-plugin-terser";
import rollupScss from "rollup-plugin-scss";
import rollupTypescript from "@rollup/plugin-typescript";

export default [
  {
    input: "./src/index.ts",
    plugins: [rollupScss(), rollupTypescript()],
    output: {
      file: "./dist/wysiwyg.js",
      format: "iife",
      name: "wysiwyg",
    },
  },
  {
    input: "./src/index.ts",
    plugins: [rollupTypescript(), rollupScss(), terser()],
    output: {
      file: "./dist/wysiwyg.min.js",
      format: "iife",
      name: "wysiwyg",
    },
  },
];
