import { terser } from "rollup-plugin-terser";
import postCss from "rollup-plugin-postcss";
import rollupScss from "rollup-plugin-scss";

export default [
  {
    input: "./src/wysiwyg.js",
    plugins: [rollupScss()],
    output: {
      file: "./dist/wysiwyg.js",
      format: "iife",
      name: "wysiwyg",
    },
  },
  {
    input: "./src/wysiwyg.js",
    plugins: [rollupScss(), terser()],
    output: {
      file: "./dist/wysiwyg.min.js",
      format: "iife",
      name: "wysiwyg",
    },
  },
];
