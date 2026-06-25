#!/usr/bin/env node
import { constants } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NOFOLLOW = constants.O_NOFOLLOW || 0;

const args = parseArgs(process.argv.slice(2));

if (args.help) usage(0);
if (args.version) {
  console.log(await packageVersion());
  process.exit(0);
}

if (args.command === "init") {
  await init(args);
} else if (args.command === "infer") {
  await infer(args);
} else {
  await generate(args);
}

async function generate(args) {
  if (!args.schema || !args.out) usage(1);

  const schemaPath = resolve(args.schema);
  const mod = await import(pathToFileURL(schemaPath).href);
  const schema = mod.default || mod.schema;

  if (!schema) {
    throw new Error(`No default export or named "schema" export found in ${schemaPath}`);
  }

  const outPath = resolve(args.out);
  const { generateExample, generateTypes, generateValidator } = await import("./compiler.js");
  await mkdir(dirname(outPath), { recursive: true });
  const options = { functionName: args.functionName, processDefault: args.processDefault, minify: args.minify, failFast: args.failFast, optimize: args.optimize };
  await writeOutput(outPath, generateValidator(schema, options), args.force);

  if (args.types) {
    const typesPath = resolve(args.types);
    await mkdir(dirname(typesPath), { recursive: true });
    await writeOutput(typesPath, generateTypes(schema, options), args.force);
  }

  if (args.example) {
    const examplePath = resolve(args.example);
    await mkdir(dirname(examplePath), { recursive: true });
    await writeOutput(examplePath, generateExample(schema), args.force);
  }
}

async function init(args) {
  if (!args.schema) usage(1);
  const target = args.target || "node";
  const source = template(target);
  const schemaPath = resolve(args.schema);
  await mkdir(dirname(schemaPath), { recursive: true });
  await writeFile(schemaPath, source, { encoding: "utf8", flag: "wx" });
}

async function infer(args) {
  if (!args.schema) usage(1);
  const schemaPath = resolve(args.schema);
  const { inferSchemaSource } = await import("./infer.js");
  await mkdir(dirname(schemaPath), { recursive: true });
  await writeOutput(schemaPath, await inferSchemaSource({ envFiles: args.envFiles, scanPaths: args.scanPaths }), args.force);
}

function parseArgs(argv) {
  const out = { command: "generate", functionName: "loadEnv" };
  if (argv[0] === "generate" || argv[0] === "init" || argv[0] === "infer") out.command = argv.shift();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--version" || arg === "-v") out.version = true;
    else if (arg === "--schema") out.schema = argv[++i];
    else if (arg === "--env") (out.envFiles ||= []).push(argv[++i]);
    else if (arg === "--scan") (out.scanPaths ||= []).push(argv[++i]);
    else if (arg === "--target") out.target = argv[++i];
    else if (arg === "--out") out.out = argv[++i];
    else if (arg === "--types") out.types = argv[++i];
    else if (arg === "--example") out.example = argv[++i];
    else if (arg === "--function-name") out.functionName = argv[++i];
    else if (arg === "--no-process-default") out.processDefault = false;
    else if (arg === "--minify") out.minify = true;
    else if (arg === "--fail-fast") out.failFast = true;
    else if (arg === "--force") out.force = true;
    else if (arg === "--optimize") out.optimize = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

async function writeOutput(path, source, force) {
  const flags = constants.O_WRONLY | constants.O_CREAT | NOFOLLOW | (force ? constants.O_TRUNC : constants.O_EXCL);
  let file;
  try {
    file = await open(path, flags, 0o666);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`${path} already exists; pass --force to overwrite`);
    if (error.code === "ELOOP") throw new Error(`${path} is a symlink; refusing to write`);
    throw error;
  }
  try {
    await file.writeFile(source, "utf8");
  } finally {
    await file.close();
  }
}

function template(target) {
  if (target === "node") return `import { bool, defineEnv, int, str } from "celery-env";

export default defineEnv({
  NODE_ENV: str({ default: "development", desc: "Current runtime environment." }),
  DATABASE_URL: str({ min: 1, desc: "Primary database connection string.", example: "postgres://user:pass@localhost:5432/app" }),
  PORT: int({ default: 3000, min: 1, max: 65535 }),
  DEBUG: bool({ default: false })
});
`;
  if (target === "next") return `import { bool, defineEnv, str } from "celery-env";

export default defineEnv({
  NODE_ENV: str({ default: "development" }),
  DATABASE_URL: str({ min: 1, desc: "Server-only database connection string." }),
  NEXT_PUBLIC_API_URL: str({ min: 1, startsWith: "https://", desc: "Browser-visible API origin.", example: "https://api.example.com" }),
  NEXT_PUBLIC_ENABLE_ANALYTICS: bool({ default: false })
});
`;
  if (target === "vite") return `import { bool, defineEnv, str } from "celery-env";

export default defineEnv({
  MODE: str({ default: "development" }),
  VITE_API_URL: str({ min: 1, startsWith: "https://", desc: "Browser-visible API origin.", example: "https://api.example.com" }),
  VITE_ENABLE_SEARCH: bool({ default: false })
});
`;
  throw new Error(`Unknown init target: ${target}`);
}

async function packageVersion() {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  return pkg.version;
}

function usage(code) {
  console.log(`Usage:
  celery-env --schema env.schema.mjs --out src/env.mjs [--types src/env.d.ts]
  celery-env generate --schema env.schema.mjs --out src/env.mjs [--types src/env.d.ts] [--example .env.example] [--force] [--optimize speed]
  celery-env infer --schema env.schema.mjs [--env .env.example] [--scan src] [--force]
  celery-env init --target node|next|vite --schema env.schema.mjs
  celery-env --version`);
  process.exit(code);
}
