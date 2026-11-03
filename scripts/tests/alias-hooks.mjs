// Test-only ESM resolver: maps "@/..." to src/... and resolves extensionless
// relative imports inside src/, so route handlers can run under `node --test`.
import { existsSync, statSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const tryResolve = (base) => [base + ".ts", base + ".tsx", path.join(base, "index.ts"), base].find(isFile);
export async function resolve(specifier, context, next) {
  if (specifier === "next/server") return next("next/server.js", context);  // no exports map in next/
  if (specifier.startsWith("@/")) {
    const hit = tryResolve(path.join(root, "src", specifier.slice(2)));
    if (hit) return next(pathToFileURL(hit).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.includes("/src/")) {
    const hit = tryResolve(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (hit) return next(pathToFileURL(hit).href, context);
  }
  return next(specifier, context);
}
