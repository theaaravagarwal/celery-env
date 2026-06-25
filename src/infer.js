import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const JS_IDENT = /^[$A-Z_a-z][$\w]*$/;
const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"]);
const SKIP_DIRS = new Set([".git", ".next", ".nuxt", ".output", ".tmp", "build", "coverage", "dist", "node_modules"]);
const DEFAULT_ENV_FILES = [".env.example", ".env", ".env.local"];
const DEFAULT_SCAN_PATHS = ["src", "app", "pages", "lib", "server"];
const BOOL_VALUES = new Set(["true", "yes", "on", "false", "no", "off"]);
const SECRET_KEY = /(?:SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|AUTH|API_KEY|ACCESS_KEY)/i;
const SECRET_VALUE = /(?:^sk_|^pk_|^gh[pousr]_|^xox[baprs]-|^eyJ|-----BEGIN |:\/\/[^/\s:@]+:[^/\s:@]+@|[A-Za-z0-9+/=_-]{32,})/;
const ENUM_VALUE = /^[A-Za-z][A-Za-z0-9_.:-]{0,31}$/;
const MAX_ENV_FILE_BYTES = 256 * 1024;
const MAX_SOURCE_FILE_BYTES = 1024 * 1024;
const MAX_SOURCE_FILES = 2000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SCAN_DEPTH = 32;

export async function inferSchemaSource(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const explicitEnvFiles = options.envFiles?.length;
  const explicitScanPaths = options.scanPaths?.length;
  const envFiles = explicitEnvFiles ? resolveAll(cwd, options.envFiles) : await discoverExisting(cwd, DEFAULT_ENV_FILES);
  const scanPaths = explicitScanPaths ? resolveAll(cwd, options.scanPaths) : await discoverExisting(cwd, DEFAULT_SCAN_PATHS);
  const entries = new Map();

  for (const file of envFiles) {
    const source = await readEnvFile(file);
    const safeExamples = isExampleEnvFile(file);
    for (const item of parseEnvSource(source)) {
      record(entries, item.key, { value: item.value, safeExamples });
    }
  }

  for (const file of await sourceFiles(scanPaths, { rejectRootSymlinks: Boolean(explicitScanPaths) })) {
    const source = await readFile(file, "utf8");
    for (const key of scanEnvKeys(source)) {
      record(entries, key, { codeOnly: true });
    }
  }

  if (!entries.size) {
    throw new Error("No environment variables found; pass --env or --scan");
  }

  return generateSchemaModule(entries);
}

export function parseEnvSource(source) {
  const out = [];
  for (const raw of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const parsed = parseEnvLine(raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function scanEnvKeys(source) {
  const keys = new Set();
  collectMatches(keys, source, /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)\b/g, 1);
  collectMatches(keys, source, /\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)\b/g, 1);
  collectMatches(keys, source, /\bprocess\.env\[\s*(["'`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g, 2);
  collectMatches(keys, source, /\bimport\.meta\.env\[\s*(["'`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g, 2);

  for (const match of source.matchAll(/\{([^}]+)\}\s*=\s*process\.env\b/g)) {
    for (const key of destructuredKeys(match[1])) keys.add(key);
  }
  for (const match of source.matchAll(/\{([^}]+)\}\s*=\s*import\.meta\.env\b/g)) {
    for (const key of destructuredKeys(match[1])) keys.add(key);
  }

  return [...keys].sort();
}

function parseEnvLine(line) {
  let text = line.trim();
  if (!text || text.startsWith("#")) return;
  if (text.startsWith("export ")) text = text.slice(7).trimStart();

  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(text);
  if (!match) return;

  const key = match[1];
  let value = match[2] ?? "";
  if (!ENV_NAME.test(key)) return;
  value = parseEnvValue(value);
  return { key, value };
}

function parseEnvValue(raw) {
  const value = raw.trim();
  if (!value) return "";
  const quote = value[0];
  if (quote === "'" || quote === "\"" || quote === "`") {
    let end = 1;
    let escaped = false;
    for (; end < value.length; end++) {
      const char = value[end];
      if (escaped) {
        escaped = false;
      } else if (quote !== "'" && char === "\\") {
        escaped = true;
      } else if (char === quote) {
        break;
      }
    }
    const inner = value.slice(1, end);
    return quote === "'" ? inner : unescapeQuoted(inner);
  }
  return stripInlineComment(value).trim();
}

function unescapeQuoted(value) {
  return value.replace(/\\([nrt"\\`])/g, (_, char) => {
    if (char === "n") return "\n";
    if (char === "r") return "\r";
    if (char === "t") return "\t";
    return char;
  });
}

function stripInlineComment(value) {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "#" && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i);
  }
  return value;
}

function collectMatches(keys, source, pattern, group) {
  for (const match of source.matchAll(pattern)) keys.add(match[group]);
}

function destructuredKeys(source) {
  const keys = [];
  for (const raw of source.split(",")) {
    const item = raw.trim();
    if (!item || item.startsWith("...")) continue;
    const key = item.split(/[:=]/, 1)[0].trim();
    if (ENV_NAME.test(key)) keys.push(key);
  }
  return keys;
}

async function discoverExisting(cwd, names) {
  const out = [];
  for (const name of names) {
    const path = resolve(cwd, name);
    if (await exists(path)) out.push(path);
  }
  return out;
}

function resolveAll(cwd, paths) {
  return paths.map((path) => resolve(cwd, path));
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readEnvFile(path) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${path} does not exist`);
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error(`${path} is a symlink; refusing to read`);
  if (!info.isFile()) throw new Error(`${path} is not a file`);
  if (info.size > MAX_ENV_FILE_BYTES) throw new Error(`${path} is too large for env inference: ${info.size} > ${MAX_ENV_FILE_BYTES} bytes`);
  return readFile(path, "utf8");
}

async function sourceFiles(paths, options = {}) {
  const out = [];
  const state = { files: 0, bytes: 0 };
  for (const path of paths) {
    await collectSourceFiles(out, path, state, 0, options.rejectRootSymlinks);
  }
  return out.sort();
}

async function collectSourceFiles(out, path, state, depth, rejectSymlink) {
  if (depth > MAX_SCAN_DEPTH) throw new Error(`${path} exceeds scan depth limit: ${depth} > ${MAX_SCAN_DEPTH}`);

  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  if (info.isSymbolicLink()) {
    if (rejectSymlink) throw new Error(`${path} is a symlink; refusing to scan`);
    return;
  }

  if (info.isDirectory()) {
    if (SKIP_DIRS.has(basename(path))) return;
    for (const entry of await readdir(path)) {
      await collectSourceFiles(out, join(path, entry), state, depth + 1, false);
    }
    return;
  }

  if (!info.isFile() || !SOURCE_EXTENSIONS.has(extname(path))) return;
  if (info.size > MAX_SOURCE_FILE_BYTES) throw new Error(`${path} is too large for source inference: ${info.size} > ${MAX_SOURCE_FILE_BYTES} bytes`);
  state.files += 1;
  state.bytes += info.size;
  if (state.files > MAX_SOURCE_FILES) throw new Error(`source scan found too many files: ${state.files} > ${MAX_SOURCE_FILES}`);
  if (state.bytes > MAX_SOURCE_BYTES) throw new Error(`source scan is too large: ${state.bytes} > ${MAX_SOURCE_BYTES} bytes`);
  out.push(path);
}

function record(entries, key, source) {
  let entry = entries.get(key);
  if (!entry) {
    entry = { key, values: [], code: false };
    entries.set(key, entry);
  }
  if (source.codeOnly) entry.code = true;
  else entry.values.push({ value: source.value, safeExamples: source.safeExamples });
}

function generateSchemaModule(entries) {
  const keys = [...entries.keys()].sort();
  const rules = keys.map((key) => [key, inferRule(entries.get(key))]);
  const imports = new Set(["defineEnv"]);
  for (const [, rule] of rules) collectRuleImports(imports, rule);

  const lines = [
    `import { ${[...imports].sort(importSort).join(", ")} } from "celery-env";`,
    "",
    "export default defineEnv({"
  ];

  for (let i = 0; i < rules.length; i++) {
    const [key, rule] = rules[i];
    lines.push(`  ${schemaKey(key)}: ${ruleSource(rule)}${i === rules.length - 1 ? "" : ","}`);
  }

  lines.push("});", "");
  return lines.join("\n");
}

function inferRule(entry) {
  if (entry.key === "NODE_ENV") {
    return { kind: "oneOf", values: ["development", "test", "production"], options: { default: "development" } };
  }

  const samples = entry.values.filter((item) => item.value !== "");
  if (!samples.length) return { kind: "str", options: { min: 1 } };

  const enumRule = sampleEnumRule(entry, samples);
  if (enumRule) return withExample(entry, enumRule);

  const kinds = samples.map((item) => inferValue(item.value, enumSafe(entry, item)));
  if (kinds.some((kind) => kind.kind === "str")) return stringRule(entry);

  const first = kinds[0].kind;
  if (!kinds.every((kind) => kind.kind === first)) return stringRule(entry);

  const rule = mergeRules(first, kinds);
  return withExample(entry, rule);
}

function inferValue(value, allowEnum) {
  if (BOOL_VALUES.has(value)) return { kind: "bool" };
  if (strictInt(value)) return { kind: "int", options: { strict: true } };
  if (strictNumber(value)) return { kind: "num", options: { strict: true } };
  const jsonRule = inferJson(value);
  if (jsonRule) return jsonRule;
  const listRule = inferList(value, allowEnum);
  if (listRule) return listRule;
  const urlRule = inferUrl(value);
  if (urlRule) return urlRule;
  return { kind: "str", options: { min: 1 } };
}

function inferJson(value) {
  if (!/^\s*[\[{]/.test(value)) return;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return { kind: "json" };
  } catch {}
}

function inferList(value, allowEnum) {
  if (!value.includes(",") || /^\s*[\[{]/.test(value)) return;
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length < 2 || parts.some((part) => part === "")) return;
  const items = parts.map((part) => {
    if (BOOL_VALUES.has(part)) return { kind: "bool" };
    if (strictInt(part)) return { kind: "int", options: { strict: true } };
    if (strictNumber(part)) return { kind: "num", options: { strict: true } };
    const urlRule = inferUrl(part);
    return urlRule || { kind: "str" };
  });
  const first = items[0].kind;
  if (first === "str") {
    const values = allowEnum && enumValues(parts);
    return { kind: "list", item: values ? { kind: "oneOf", values } : { kind: "str", options: { min: 1 } } };
  }
  if (!items.every((item) => item.kind === first)) return;
  return { kind: "list", item: mergeRules(first, items) };
}

function inferUrl(value) {
  try {
    const url = new URL(value);
    if (!url.protocol) return;
    return { kind: "url", options: { protocols: [url.protocol.slice(0, -1)] } };
  } catch {}
}

function strictInt(value) {
  return /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

function strictNumber(value) {
  if (!/^[+-]?(?:\d+\.\d*|\.\d+|\d+)$/.test(value)) return false;
  return Number.isFinite(Number(value));
}

function mergeRules(kind, rules) {
  if (kind === "url") {
    return {
      kind: "url",
      options: { protocols: [...new Set(rules.flatMap((rule) => rule.options?.protocols || []))].sort() }
    };
  }
  if (kind === "list") {
    const itemKind = rules[0].item.kind;
    if (!rules.every((rule) => rule.item.kind === itemKind)) return { kind: "list", item: { kind: "str", options: { min: 1 } } };
    return { kind: "list", item: mergeRules(itemKind, rules.map((rule) => rule.item)) };
  }
  if (kind === "oneOf") return { kind, values: enumValues(rules.flatMap((rule) => rule.values)) };
  if (kind === "int" || kind === "num") return { kind, options: { strict: true } };
  if (kind === "str" && rules.some((rule) => rule.options)) return { kind, options: { min: 1 } };
  return { kind };
}

function stringRule(entry) {
  const rule = { kind: "str", options: { min: 1 } };
  const example = safeExample(entry, rule);
  if (example !== undefined) rule.options.example = example;
  return rule;
}

function safeExample(entry, rule) {
  const sample = entry.values.find((item) => item.safeExamples && item.value !== "");
  if (!sample || unsafe(entry.key, sample.value)) return;
  return exampleValue(sample.value, rule);
}

function withExample(entry, rule) {
  const example = safeExample(entry, rule);
  if (example !== undefined) rule.options = { ...rule.options, example };
  return rule;
}

function enumSafe(entry, item) {
  return item.safeExamples && !unsafe(entry.key, item.value);
}

function sampleEnumRule(entry, samples) {
  const values = samples.every((item) => enumSafe(entry, item)) && enumValues(samples.map((item) => item.value));
  if (values && values.length > 1 && values.length <= 8) return { kind: "oneOf", values };
}

function unsafe(key, value) {
  return SECRET_KEY.test(key) || SECRET_VALUE.test(value);
}

function exampleValue(value, rule) {
  if (rule.kind === "bool") return value === "true" || value === "1" || value === "yes" || value === "on";
  if (rule.kind === "int" || rule.kind === "num") return Number(value);
  if (rule.kind === "json") {
    try {
      return JSON.parse(value);
    } catch {
      return;
    }
  }
  if (rule.kind === "list") return value.split(",").map((part) => exampleValue(part.trim(), rule.item));
  return value;
}

function collectRuleImports(imports, rule) {
  imports.add(rule.kind);
  if (rule.kind === "list") collectRuleImports(imports, rule.item);
}

function ruleSource(rule) {
  if (rule.kind === "oneOf") return rule.options && Object.keys(rule.options).length ? `oneOf(${literal(rule.values)}, ${literal(rule.options)})` : `oneOf(${literal(rule.values)})`;
  if (rule.kind === "list") {
    const item = ruleSource(rule.item);
    return rule.options && Object.keys(rule.options).length ? `list(${item}, ${literal(rule.options)})` : `list(${item})`;
  }
  if (rule.options && Object.keys(rule.options).length) return `${rule.kind}(${literal(rule.options)})`;
  return `${rule.kind}()`;
}

function schemaKey(key) {
  return JS_IDENT.test(key) && key !== "__proto__" ? key : JSON.stringify(key);
}

function literal(value) {
  return JSON.stringify(value);
}

function enumValues(values) {
  if (!values.every((value) => ENUM_VALUE.test(value))) return;
  return [...new Set(values)].sort();
}

function importSort(a, b) {
  return a.localeCompare(b);
}

function isExampleEnvFile(path) {
  const name = basename(path).toLowerCase();
  return name.includes("example") || name.includes("sample") || name.includes("template");
}
