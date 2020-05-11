import { terser } from "rollup-plugin-terser";
import postCss from "rollup-plugin-postcss";
import rollupScss from "rollup-plugin-scss";

export default [
  {
    input: "./wysiwyg.js",
    plugins: [rollupScss()],
    output: {
      file: "./dist/wysiwyg.js",
      format: "iife",
      name: "wysiwyg",
    },
  },
  {
    input: "./wysiwyg.js",
    plugins: [rollupScss(), terser()],
    output: {
      file: "./dist/wysiwyg.min.js",
      format: "iife",
      name: "wysiwyg",
    },
  },
];
