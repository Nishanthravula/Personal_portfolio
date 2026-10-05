import { build } from "esbuild";

await build({
  entryPoints: ["main.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  outfile: "../../assets/world.js",
  legalComments: "none",
  logLevel: "info",
});
