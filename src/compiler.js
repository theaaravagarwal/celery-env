const STR = 0, INT = 1, NUM = 2, BOOL = 3, ENUM = 4, URL_T = 5, JSON_T = 6, LIST = 7;
const W = "(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)";
const H = Object.hasOwn;

export function generateValidator(schema, options = {}) {
  const ctx = emitterContext(options);
  const entries = assertSchema(schema);
  const fn = functionName(options);
  const param = options.processDefault === false ? "env" : "env = process.env";
  const hasProto = hasProtoKey(entries);

  if (!hasProto && ctx.t === 512 && entries.length >= 128 && entries.length <= 512) return generateObjectValidator(entries, fn, param, ctx, options);
  if (entries.length >= ctx.t) return generateSplitValidator(entries, fn, param, ctx, options);
  if (!hasProto && entries.length >= 128 && entries.length <= 384) return generateObjectValidator(entries, fn, param, ctx, options);

  const body = [];
  let needsListTemp = false;
  for (let i = 0; i < entries.length; i++) {
    const [key, rule] = entries[i];
    if (rule.t === LIST && needsListTempVar(rule)) needsListTemp = true;
    body.push(...emitRule(key, rule, `_${i}`, ctx));
  }
  const lines = ctx.g;
  lines.push(`export function ${fn}(${param}) {`);
  if (!ctx.f) lines.push("  let r;");
  lines.push("  let v;");
  if (entries.length) lines.push(`  let ${entries.map((_, i) => `_${i}`).join(", ")};`);
  if (needsListTemp) lines.push("  let x;");
  lines.push(...body);

  if (!ctx.f) lines.push("  if (r) throw Error(\"Invalid environment:\\n- \" + r.join(\"\\n- \"));");
  lines.push(
    `  return ${returnObject(entries)};`,
    "}",
    `export default ${fn};`,
    ""
  );

  if (options.minify) return lines.map((line) => line.trim()).join("");
  return lines.join("\n");
}

function generateObjectValidator(entries, fn, param, ctx, options) {
  const body = [];
  let needsListTemp = false;
  for (let i = 0; i < entries.length; i++) {
    const [key, rule] = entries[i];
    if (rule.t === LIST && needsListTempVar(rule)) needsListTemp = true;
    body.push(...emitRule(key, rule, `o${prop(key)}`, ctx));
  }
  const lines = ctx.g;
  lines.push(`export function ${fn}(${param}) {`);
  if (!ctx.f) lines.push("  let r;");
  lines.push("  let v;", "  const o = {};");
  if (needsListTemp) lines.push("  let x;");
  lines.push(...body);
  if (!ctx.f) lines.push("  if (r) throw Error(\"Invalid environment:\\n- \" + r.join(\"\\n- \"));");
  lines.push("  return o;", "}", `export default ${fn};`, "");
  if (options.minify) return lines.map((line) => line.trim()).join("");
  return lines.join("\n");
}

function generateSplitValidator(entries, fn, param, ctx, options) {
  const lines = ctx.g;
  let n = 0;
  for (let start = 0; start < entries.length; start += 32) {
    lines.push(...emitSplitChunk(entries, start, Math.min(start + 32, entries.length), n++, ctx));
  }

  lines.push(`export function ${fn}(${param}) {`);
  if (!ctx.f) lines.push("  let r;");
  lines.push(`  const a = new Array(${entries.length});`);
  for (let i = 0; i < n; i++) {
    lines.push(ctx.f ? `  _c${i}(env, a);` : `  r = _c${i}(env, a, r);`);
  }
  if (!ctx.f) lines.push("  if (r) throw Error(\"Invalid environment:\\n- \" + r.join(\"\\n- \"));");
  lines.push(
    `  return ${returnObject(entries, "a")};`,
    "}",
    `export default ${fn};`,
    ""
  );

  if (options.minify) return lines.map((line) => line.trim()).join("");
  return lines.join("\n");
}

function emitSplitChunk(entries, start, end, index, ctx) {
  const lines = [ctx.f ? `function _c${index}(env, a) {` : `function _c${index}(env, a, r) {`, "  let v;"];
  for (let i = start; i < end; i++) {
    const rule = entries[i][1];
    if (rule.t === LIST && needsListTempVar(rule)) {
      lines.push("  let x;");
      break;
    }
  }
  for (let i = start; i < end; i++) {
    const [key, rule] = entries[i];
    lines.push(...emitRule(key, rule, `a[${i}]`, ctx));
  }
  if (!ctx.f) lines.push("  return r;");
  lines.push("}");
  return lines;
}

export function generateTypes(schema, options = {}) {
  const entries = assertSchema(schema);
  const fn = functionName(options);
  const envParam = options.processDefault === false ? "env: Record<string, string | undefined>" : "env?: Record<string, string | undefined>";
  const lines = ["export type Env = {"];

  for (const [key, rule] of entries) {
    const type = innerTypeFor(rule);
    lines.push(`  readonly ${prop(key, 1)}: ${rule.optional && !hasDefault(rule) ? `${type} | undefined` : type};`);
  }

  lines.push("};", `export declare function ${fn}(${envParam}): Env;`, `export default ${fn};`, "");
  return lines.join("\n");
}

export function generateExample(schema) {
  const lines = [];
  for (const [key, rule] of assertSchema(schema)) {
    if (rule.desc) pushComment(lines, rule.desc);
    if (rule.docs) pushComment(lines, `Docs: ${rule.docs}`);
    if (rule.optional) lines.push("# Optional");
    if (rule.requiredWhen) lines.push("# Conditionally required");
    if (H(rule, "devDefault")) pushComment(lines, `Development default: ${envValue(rule.devDefault, rule)}`);
    if (H(rule, "testDefault")) pushComment(lines, `Test default: ${envValue(rule.testDefault, rule)}`);
    lines.push(`${envKey(key)}=${exampleValue(rule)}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function generateJsonSchema(schema, options = {}) {
  const entries = assertSchema(schema);
  const out = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: options.additionalProperties ?? false,
    properties: {}
  };
  if (options.title) out.title = options.title;

  const required = [];
  for (const [key, rule] of entries) {
    out.properties[key] = jsonSchemaFor(rule);
    if (!rule.optional && !hasDefault(rule)) required.push(key);
  }
  if (required.length) out.required = required;
  return out;
}

function jsonSchemaFor(rule) {
  const out = jsonShapeFor(rule);
  annotateJsonSchema(out, rule);
  return out;
}

function jsonShapeFor(rule) {
  switch (rule.t) {
    case STR:
      return {
        type: "string",
        ...(rule.min != null ? { minLength: rule.min } : {}),
        ...(rule.max != null ? { maxLength: rule.max } : {}),
        ...(rule.startsWith != null ? { "x-celery-startsWith": rule.startsWith } : {}),
        ...(rule.includes != null ? { "x-celery-includes": rule.includes } : {})
      };
    case INT:
      return numberJsonSchema(rule, "integer");
    case NUM:
      return numberJsonSchema(rule, "number");
    case BOOL:
      return { type: "boolean" };
    case ENUM:
      return { enum: rule.values.slice() };
    case URL_T:
      return {
        type: "string",
        format: "uri",
        ...(rule.protocols ? { "x-celery-protocols": rule.protocols.slice() } : {})
      };
    case JSON_T:
      return {};
    case LIST:
      return {
        type: "array",
        items: jsonSchemaFor(rule.item),
        ...(rule.separator !== "," ? { "x-celery-separator": rule.separator } : {}),
        ...(rule.trim === false ? { "x-celery-trim": false } : {})
      };
    default:
      throw new Error(`unknown validator kind ${rule.t}`);
  }
}

function numberJsonSchema(rule, type) {
  return {
    type,
    ...(rule.min != null ? { minimum: rule.min } : {}),
    ...(rule.max != null ? { maximum: rule.max } : {}),
    ...(rule.strict ? { "x-celery-strict": true } : {})
  };
}

function annotateJsonSchema(out, rule) {
  if (rule.desc) out.description = rule.desc;
  if (rule.docs) out["x-celery-docs"] = rule.docs;
  if (H(rule, "example")) out.examples = [rule.example];
  if (H(rule, "default")) out.default = rule.default;
  if (H(rule, "devDefault")) out["x-celery-devDefault"] = rule.devDefault;
  if (H(rule, "testDefault")) out["x-celery-testDefault"] = rule.testDefault;
  if (rule.optional) out["x-celery-optional"] = true;
  if (rule.requiredWhen) out["x-celery-requiredWhen"] = true;
}

function assertSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new TypeError("Expected schema object");
  const entries = Object.entries(schema);
  for (const [key, rule] of entries) {
    if (!(rule && typeof rule === "object" && H(rule, "t") && typeof rule.t === "number")) throw new TypeError(`${key}: invalid celery-env spec`);
    if (rule.t === LIST && rule.item.t === LIST) throw new TypeError(`${key}: nested list generation is not supported`);
    if (rule.requiredWhen != null && typeof rule.requiredWhen !== "function") throw new TypeError(`${key}: requiredWhen must be a function`);
    for (const field of ["default", "devDefault", "testDefault"]) {
      if (H(rule, field) && !validDefault(rule, rule[field])) {
        throw new TypeError(`${key}: ${field} does not satisfy validator`);
      }
    }
  }
  return entries;
}

function validDefault(rule, value) {
  if (value === undefined) return rule.optional === true;
  switch (rule.t) {
    case STR:
      return typeof value === "string" &&
        (rule.min == null || value.length >= rule.min) &&
        (rule.max == null || value.length <= rule.max) &&
        (rule.startsWith == null || value.startsWith(rule.startsWith)) &&
        (rule.includes == null || value.includes(rule.includes));
    case INT:
      return Number.isInteger(value) && (rule.min == null || value >= rule.min) && (rule.max == null || value <= rule.max);
    case NUM:
      return Number.isFinite(value) && (rule.min == null || value >= rule.min) && (rule.max == null || value <= rule.max);
    case BOOL:
      return typeof value === "boolean";
    case ENUM:
      return rule.values.includes(value);
    case URL_T:
      try {
        return typeof value === "string" && (!rule.protocols || rule.ps.includes(new URL(value).protocol));
      } catch {
        return false;
      }
    case JSON_T:
      return jsonDefaultSafe(value);
    case LIST:
      return Array.isArray(value) && value.every(v=>validDefault(rule.item, v));
    default:
      return false;
  }
}

function exampleValue(rule) {
  for (const field of ["example", "default", "devDefault", "testDefault"]) {
    if (H(rule, field)) return envValue(rule[field], rule);
  }
  return "";
}

function envValue(value, rule) {
  if (value == null) return "";
  if (rule.t === LIST && Array.isArray(value)) return value.map(envScalar).join(rule.separator || ",");
  if (rule.t === JSON_T) return safeLine(typeof value === "string" ? value : JSON.stringify(value));
  return envScalar(value);
}

function envScalar(value) {
  return safeLine(typeof value === "string" ? value : String(value));
}

function envKey(key) {
  return String(key).replace(/[=\r\n]/g, "_");
}

function pushComment(lines, text) {
  for (const line of String(text).split(/\r?\n/)) lines.push(`# ${safeLine(line)}`);
}

function safeLine(value) {
  return String(value).replace(/\r?\n/g, "\\n");
}

function emitterContext(options) {
  const optimize = options.optimize;
  if (optimize && optimize !== "default" && optimize !== "speed") throw new TypeError(`Unknown optimize mode: ${optimize}`);
  const t = options.splitLarge === false ? 1/0 : options.splitLargeThreshold ?? 512;
  if (!Number.isInteger(t) && t !== 1/0) throw new TypeError("splitLargeThreshold must be an integer");
  return { e: 0, f: options.failFast === true, g: [], h: 0, j: 0, s: optimize > "default", t };
}

function functionName(options) {
  const fn = options.functionName || "loadEnv";
  if (!/^[A-Za-z_$][\w$]*$/.test(fn) || reserved(fn)) throw new TypeError("functionName must be a JavaScript identifier");
  return fn;
}

function reserved(value) {
  return /^(?:arguments|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|eval|export|extends|false|finally|for|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)$/.test(value);
}

function hasProtoKey(entries) {
  return entries.some(([key]) => key === "__proto__");
}

function needsListTempVar(rule) {
  const k = emitFastListKind(rule);
  return !k || k === 3 && rule.item.includes != null || k === 4;
}

function emitRule(key, rule, target, ctx) {
  const out = [`  v = ${envRead(key, ctx)};`];

  const simple = simpleMissing(rule);
  if (simple && rule.optional && target<"o") {
    out.push("  if (v != null && v !== \"\") {");
  } else if (simple) {
    out.push(`  if (v == null || v === "") ${rule.optional ? `${target} = undefined` : err(`${key} is required`, ctx)};`);
    out.push("  else {");
  } else {
    out.push("  if (v == null || v === \"\") {");
    emitMissing(key, rule, "    ", target, out, ctx);
    out.push("  }");
    out.push("  else {");
  }
  out.push(...emitPresent(key, rule, "    ", target, ctx));
  out.push("  }");

  return out;
}

function envRead(key, ctx) {
  if(!ctx.h++)ctx.g.push("const H=Object.hasOwn;");
  return `(H(env,${literal(key)})?env${prop(key)}:undefined)`;
}

function envFacade(ctx) {
  if(!ctx.e++)ctx.g.push("function E(e){const o=Object.create(null);for(const k of Object.keys(e))o[k]=e[k];return o}");
  return "E(env)";
}

function simpleMissing(rule) {
  return !hasDefault(rule) && !rule.requiredWhen;
}

function emitMissing(key, rule, pad, target, out, ctx) {
  let used = false;
  if (H(rule, "testDefault")) {
    out.push(`${pad}if (${envRead("NODE_ENV", ctx)} === "test") ${target} = ${literal(rule.testDefault)};`);
    used = true;
  }
  if (H(rule, "devDefault")) {
    out.push(`${pad}${used ? "else " : ""}if (${envRead("NODE_ENV", ctx)} !== "production") ${target} = ${literal(rule.devDefault)};`);
    used = true;
  }
  if (H(rule, "default")) {
    out.push(`${pad}${used ? "else " : ""}${target} = ${literal(rule.default)};`);
  } else if (rule.optional && rule.requiredWhen) {
    out.push(`${pad}${used ? "else " : ""}if (${requiredWhenExpr(rule)}(${envFacade(ctx)}) === true) ${err(`${key} is required`, ctx)};`);
    if (target > "b") out.push(`${pad}else ${target} = undefined;`);
  } else if (rule.optional) {
    out.push(`${pad}${used ? "else " : ""}${target} = undefined;`);
  } else {
    out.push(`${pad}${used ? "else " : ""}${err(`${key} is required`, ctx)};`);
  }
}

function emitPresent(key, rule, pad, target, ctx, value = "v") {
  switch (rule.t) {
    case STR:
      return emitString(key, rule, pad, target, value, ctx);
    case INT:
      return emitNumber(key, rule, pad, target, true, value, ctx);
    case NUM:
      return emitNumber(key, rule, pad, target, false, value, ctx);
    case BOOL:
      return emitBool(key, pad, target, value, ctx);
    case ENUM:
      return emitEnum(key, rule, pad, target, value, ctx);
    case URL_T:
      return emitUrl(key, rule, pad, target, value, ctx);
    case JSON_T:
      return emitJson(key, pad, target, value, ctx);
    case LIST:
      return emitList(key, rule, pad, target, ctx);
    default:
      throw new Error(`${key}: unknown validator kind ${rule.t}`);
  }
}

function emitJson(key, pad, target, value, ctx) {
  if(!ctx.j++)ctx.g.push(`function J(v){return v[0]=="{"&&v[v.length-1]!="}"||v[0]=="["&&v[v.length-1]!="]"}`);
  const er=err(`${key} must be valid JSON`,ctx);
  return [`${pad}try { if (J(${value})) throw 0; ${target} = JSON.parse(${value}); } catch { ${er}; }`];
}

function emitString(key, rule, pad, target, value, ctx) {
  const out = [];
  if (rule.min != null && !skipMin(rule)) out.push(`${pad}if (${value}.length < ${num(rule.min)}) ${err(`${key} must have length >= ${rule.min}`, ctx)};`);
  if (rule.max != null) out.push(`${out.length ? pad + "else " : pad}if (${value}.length > ${num(rule.max)}) ${err(`${key} must have length <= ${rule.max}`, ctx)};`);
  if (rule.startsWith != null) out.push(`${out.length ? pad + "else " : pad}if (!${value}.startsWith(${literal(rule.startsWith)})) ${err(`${key} must start with ${rule.startsWith}`, ctx)};`);
  if (rule.includes != null) out.push(`${out.length ? pad + "else " : pad}if (!${value}.includes(${literal(rule.includes)})) ${err(`${key} must include ${rule.includes}`, ctx)};`);
  out.push(`${out.length ? pad + "else " : pad}${target} = ${value};`);
  return out;
}

function emitNumber(key, rule, pad, target, integer, value, ctx) {
  if (integer && rule.strict && int32Bounded(rule)) {
    return emitStrictIntScalar(key, rule, pad, target, value, ctx);
  }
  if (!integer && rule.strict && ctx.s) {
    return emitStrictNumScalar(key, rule, pad, target, value, ctx);
  }
  const out = [];
  if (rule.strict) {
    const re = integer ? "/^[+-]?\\d+$/" : "/^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)$/";
    out.push(`${pad}if (!${re}.test(${value})) ${err(`${key} must be ${integer ? "a strict integer" : "a strict number"}`, ctx)};`);
    out.push(`${pad}else {`);
    pad += "  ";
  }
  out.push(`${pad}${value} = +${value};`);
  out.push(`${pad}if (${integer ? int32Bounded(rule) ? `(${value} | 0) !== ${value}` : `!Number.isInteger(${value})` : `!isFinite(${value})`}) ${err(`${key} must be ${integer ? "an integer" : "a number"}`, ctx)};`);
  if (rule.min != null) out.push(`${pad}else if (${value} < ${num(rule.min)}) ${err(`${key} must be >= ${rule.min}`, ctx)};`);
  if (rule.max != null) out.push(`${pad}else if (${value} > ${num(rule.max)}) ${err(`${key} must be <= ${rule.max}`, ctx)};`);
  out.push(`${pad}else ${target} = ${value};`);
  if (rule.strict) out.push(`${pad.slice(0, -2)}}`);
  return out;
}

function emitStrictNumScalar(key, rule, pad, target, value, ctx) {
  const out = [
    `${pad}{`,
    `${pad}  let q = 0;`,
    `${pad}  let d;`,
    `${pad}  let h;`,
    `${pad}  let c = ${value}.charCodeAt(q);`,
    `${pad}  if (c === 43 || c === 45) q++;`,
    `${pad}  for (; q < ${value}.length; q++) {`,
    `${pad}    c = ${value}.charCodeAt(q);`,
    `${pad}    if (c === 46 && !h) h = 1;`,
    `${pad}    else if (c < 48 || c > 57) break;`,
    `${pad}    else d = 1;`,
    `${pad}  }`,
    `${pad}  if (!d || q !== ${value}.length) ${err(`${key} must be a strict number`, ctx)};`,
    `${pad}  else {`,
    `${pad}    ${value} = +${value};`,
    `${pad}    if (!isFinite(${value})) ${err(`${key} must be a number`, ctx)};`
  ];
  if (rule.min != null) out.push(`${pad}    else if (${value} < ${num(rule.min)}) ${err(`${key} must be >= ${rule.min}`, ctx)};`);
  if (rule.max != null) out.push(`${pad}    else if (${value} > ${num(rule.max)}) ${err(`${key} must be <= ${rule.max}`, ctx)};`);
  out.push(
    `${pad}    else ${target} = ${value};`,
    `${pad}  }`,
    `${pad}}`
  );
  return out;
}

function emitStrictIntScalar(key, rule, pad, target, value, ctx) {
  const out = [
    `${pad}{`,
    `${pad}  let q = 0;`,
    `${pad}  let z = ${value}.length;`,
    `${pad}  let c = ${value}.charCodeAt(q);`,
    `${pad}  let g = 1;`,
    `${pad}  if (c === 43 || c === 45) { g = c === 45 ? -1 : 1; q++; }`,
    `${pad}  if (q === z) ${err(`${key} must be a strict integer`, ctx)};`,
    `${pad}  else {`,
    `${pad}    let n = 0;`,
    `${pad}    for (; q < z; q++) {`,
    `${pad}      c = ${value}.charCodeAt(q);`,
    `${pad}      if (c < 48 || c > 57) break;`,
    `${pad}      n = n * 10 + c - 48;`,
    `${pad}    }`,
    `${pad}    if (q !== z) ${err(`${key} must be a strict integer`, ctx)};`,
    `${pad}    else {`,
    `${pad}      n *= g;`,
    `${pad}      if ((n | 0) !== n) ${err(`${key} must be an integer`, ctx)};`
  ];
  if (rule.min != null) out.push(`${pad}      else if (n < ${num(rule.min)}) ${err(`${key} must be >= ${rule.min}`, ctx)};`);
  if (rule.max != null) out.push(`${pad}      else if (n > ${num(rule.max)}) ${err(`${key} must be <= ${rule.max}`, ctx)};`);
  out.push(
    `${pad}      else ${target} = n;`,
    `${pad}    }`,
    `${pad}  }`,
    `${pad}}`
  );
  return out;
}

function emitEnum(key, rule, pad, target, value, ctx) {
  if (rule.values.every(v=>typeof v==="string")) {
    const checks = rule.values.map(v=>`${value} === ${literal(v)}`).join(" || ");
    return [
      `${pad}if (${checks}) ${target} = ${value};`,
      `${pad}else ${err(`${key} must be one of ${rule.values.join(", ")}`, ctx)};`
    ];
  }
  const out = [`${pad}switch (${value}) {`];
  for (const v of rule.values) {
    out.push(`${pad}  case ${literal(String(v))}: ${target} = ${literal(v)}; break;`);
  }
  out.push(`${pad}  default: ${err(`${key} must be one of ${rule.values.join(", ")}`, ctx)};`);
  out.push(`${pad}}`);
  return out;
}

function emitUrl(key, rule, pad, target, value, ctx) {
  if (rule.protocols) {
    const cases = rule.ps.map((protocol) => `case ${literal(protocol)}:`).join(" ");
    return [`${pad}try { switch (new URL(${value}).protocol) { ${cases} ${target} = ${value}; break; default: ${err(`${key} must use protocol ${rule.protocols.join(", ")}`, ctx)}; } } catch { ${err(`${key} must be a URL`, ctx)}; }`];
  }
  return [`${pad}try { new URL(${value}); ${target} = ${value}; } catch { ${err(`${key} must be a URL`, ctx)}; }`];
}

function emitList(key, rule, pad, target, ctx) {
  const fast = emitFastList(key, rule, pad, target, ctx);
  if (fast) return fast;

  if (rule.separator === "") {
    const out = [
      `${pad}{`,
      `${pad}  const l = new Array(v.length);`
    ];
    out.push(
      `${pad}  for (let i = 0; i < v.length; i++) {`,
      `${pad}    x = ${rule.trim === false ? "v[i]" : "v[i].trim()"};`
    );
    return finishList(out, key, rule, pad, target, ctx);
  }
  const out = [
    `${pad}{`,
    `${pad}  const l = [];`
  ];
  out.push(
    `${pad}  for (let i = 0, s = 0, e;; i++, s = e + ${rule.separator.length}) {`,
    `${pad}    e = v.indexOf(${literal(rule.separator)}, s);`,
    `${pad}    x = e < 0 ? v.slice(s) : v.slice(s, e);`
  );
  if (rule.trim !== false) out.push(`${pad}    x = x.trim();`);
  out.push(...emitListItem(key, rule.item, `${pad}    `, ctx));
  out.push(
    `${pad}    if (e < 0) break;`,
    `${pad}  }`
  );
  out.push(listAssign(pad, target), `${pad}}`);
  return out;
}

function emitFastListKind(rule) {
  const item = rule.item;
  if (rule.separator === "" && item.t === STR && rule.trim === false && item.min == null && item.max == null && item.startsWith == null && item.includes == null) return 1;
  if (item.requiredWhen || "devDefault" in item || "testDefault" in item) return;
  if (rule.separator !== "" && item.t === INT && item.strict && int32Bounded(item)) return 2;
  if ("default" in item || item.optional) return;
  if (rule.separator === "") return;
  if (item.t === STR) return 3;
  if (item.t === ENUM && item.values.length > 15 && !item.values.some(v=>typeof v!=="string")) return 4;
}

function emitFastList(key, rule, pad, target, ctx) {
  switch (emitFastListKind(rule)) {
    case 1:
      return [`${pad}${target} = v.split("");`];
    case 2:
      return emitFastStrictIntList(key, rule, pad, target, ctx);
    case 3:
      return emitSegmentStringList(key, rule, pad, target, ctx);
    case 4:
      return emitSetList(key, rule, pad, target, ctx);
  }
}

function emitSetList(key, rule, pad, target, ctx) {
  const item = rule.item;
  const n = `S${ctx.g.length}`;
  ctx.g.push(`const ${n}=new Set(${literal(item.values)});`);
  const out = segmentListHeader(rule, pad, ctx);
  out.push(
    `${pad}    if (a === z) ${err(`${key} item is required`, ctx)};`,
    `${pad}    else if (${n}.has(x = v.slice(a, z))) l[i] = x;`,
    `${pad}    else ${err(`${key} item must be one of ${item.values.join(", ")}`, ctx)};`
  );
  return finishSegmentList(out, pad, target, ctx);
}

function emitFastStrictIntList(key, rule, pad, target, ctx) {
  const item = rule.item;
  const out = segmentListHeader(rule, pad, ctx);
  out.push(
    `${pad}    if (a === z) ${"default" in item || item.optional ? `l[i] = ${literal(item.default)}` : err(`${key} item must be a strict integer`, ctx)};`,
    `${pad}    else {`,
    `${pad}      let q = a;`,
    `${pad}      let c = v.charCodeAt(q);`,
    `${pad}      let g = 1;`,
    `${pad}      if (c === 43 || c === 45) { g = c === 45 ? -1 : 1; q++; }`,
    `${pad}      if (q === z) ${err(`${key} item must be a strict integer`, ctx)};`,
    `${pad}      else {`,
    `${pad}        let n = 0;`,
    `${pad}        for (; q < z; q++) {`,
    `${pad}          c = v.charCodeAt(q);`,
    `${pad}          if (c < 48 || c > 57) break;`,
    `${pad}          n = n * 10 + c - 48;`,
    `${pad}        }`,
    `${pad}        if (q !== z) ${err(`${key} item must be a strict integer`, ctx)};`,
    `${pad}        else {`,
    `${pad}          n *= g;`,
    `${pad}          if ((n | 0) !== n) ${err(`${key} item must be an integer`, ctx)};`
  );
  if (item.min != null) out.push(`${pad}          else if (n < ${num(item.min)}) ${err(`${key} item must be >= ${item.min}`, ctx)};`);
  if (item.max != null) out.push(`${pad}          else if (n > ${num(item.max)}) ${err(`${key} item must be <= ${item.max}`, ctx)};`);
  out.push(
    `${pad}          else l[i] = n;`,
    `${pad}        }`,
    `${pad}      }`,
    `${pad}    }`,
    `${pad}    if (e < 0) break;`,
    `${pad}  }`
  );
  out.push(listAssign(pad, target), `${pad}}`);
  return out;
}

function emitSegmentStringList(key, rule, pad, target, ctx) {
  const item = rule.item;
  const out = segmentListHeader(rule, pad, ctx);
  const label = `${key} item`;
  const len = "z - a";
  let checked = false;
  if (item.min != null && !skipMin(item)) {
    out.push(`${pad}    if (${len} < ${num(item.min)}) ${err(`${label} must have length >= ${item.min}`, ctx)};`);
    checked = true;
  }
  if (item.max != null) {
    out.push(`${checked ? pad + "    else " : pad + "    "}if (${len} > ${num(item.max)}) ${err(`${label} must have length <= ${item.max}`, ctx)};`);
    checked = true;
  }
  if (item.startsWith != null) {
    const prefix = literal(item.startsWith);
    out.push(`${checked ? pad + "    else " : pad + "    "}if (${len} < ${item.startsWith.length} || !v.startsWith(${prefix}, a)) ${err(`${label} must start with ${item.startsWith}`, ctx)};`);
    checked = true;
  }
  if (item.includes != null) {
    const needle = literal(item.includes);
    const needleLen = item.includes.length;
    out.push(`${checked ? pad + "    else " : pad + "    "}if (((x = v.indexOf(${needle}, a)) < 0) || x + ${needleLen} > z) ${err(`${label} must include ${item.includes}`, ctx)};`);
    checked = true;
  }
  out.push(`${checked ? pad + "    else " : pad + "    "}l[i] = v.slice(a, z);`);
  return finishSegmentList(out, pad, target, ctx);
}

function segmentListHeader(rule, pad, ctx) {
  const out = [
    `${pad}{`,
    `${pad}  const l = [];`
  ];
  out.push(
    `${pad}  for (let i = 0, s = 0, e;; i++, s = e + ${rule.separator.length}) {`,
    `${pad}    e = v.indexOf(${literal(rule.separator)}, s);`,
    `${pad}    let a = s;`,
    `${pad}    let z = e < 0 ? v.length : e;`
  );
  if (rule.trim !== false) {
    out.push(
      `${pad}    while (a < z) { const c = v.charCodeAt(a); if (!${W}) break; a++; }`,
      `${pad}    while (z > a) { const c = v.charCodeAt(z - 1); if (!${W}) break; z--; }`
    );
  }
  return out;
}

function finishSegmentList(out, pad, target, ctx) {
  out.push(
    `${pad}    if (e < 0) break;`,
    `${pad}  }`
  );
  out.push(listAssign(pad, target), `${pad}}`);
  return out;
}

function finishList(out, key, rule, pad, target, ctx) {
  out.push(...emitListItem(key, rule.item, `${pad}    `, ctx));
  out.push(
    `${pad}  }`,
    listAssign(pad, target),
    `${pad}}`
  );
  return out;
}

function listAssign(pad, target) {
  return `${pad}  ${target} = l;`;
}

function emitListItem(key, rule, pad, ctx) {
  key = `${key} item`;
  if (rule.optional || !simpleMissing(rule)) {
    const out = [`${pad}if (x === "") {`];
    emitMissing(key, rule, `${pad}  `, "l[i]", out, ctx);
    out.push(`${pad}} else {`, ...emitPresent(key, rule, `${pad}  `, "l[i]", ctx, "x"), `${pad}}`);
    return out;
  }
  return emitPresent(key, rule, pad, "l[i]", ctx, "x");
}

function emitBool(key, pad, target, value, ctx) {
  return [
    `${pad}if (${value}==="true"||${value}==="1"||${value}==="yes"||${value}==="on") ${target} = true;`,
    `${pad}else if (${value}==="false"||${value}==="0"||${value}==="no"||${value}==="off") ${target} = false;`,
    `${pad}else ${err(`${key} must be a boolean`, ctx)};`
  ];
}

function innerTypeFor(rule) {
  switch (rule.t) {
    case STR:
    case URL_T:
      return "string";
    case INT:
    case NUM:
      return "number";
    case BOOL:
      return "boolean";
    case ENUM:
      return rule.values.map(literal).join(" | ");
    case JSON_T:
      return "unknown";
    case LIST:
      return `readonly ${innerTypeFor(rule.item)}[]`;
    default:
      return "never";
  }
}

function err(message, ctx) {
  return ctx.f ? `throw Error(${literal(`Invalid environment:\n- ${message}`)})` : `(r ??= []).push(${literal(message)})`;
}

function literal(value) {
  return JSON.stringify(value);
}

function returnObject(entries, source) {
  return entries.length ? `{ ${entries.map(([key], i) => `${prop(key, 1)}: ${source ? `${source}[${i}]` : `_${i}`}`).join(", ")} }` : "{}";
}

function num(value) {
  if (!Number.isFinite(value)) throw new TypeError(`Invalid numeric option: ${value}`);
  return String(value);
}

function hasDefault(rule) {
  return H(rule, "default") || H(rule, "devDefault") || H(rule, "testDefault");
}

function skipMin(rule) {
  return rule.includes?.length >= rule.min || rule.startsWith?.length >= rule.min || rule.min < 2 && (rule.optional || H(rule, "default"));
}

function requiredWhenExpr(rule) {
  const source = Function.prototype.toString.call(rule.requiredWhen);
  if (source.includes("[native code]")) throw new TypeError("requiredWhen must be a source-serializable function");
  if (!/^(?:async\s+)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/.test(source.trim())) throw new TypeError("requiredWhen must serialize to a function expression");
  return `(${source})`;
}

function jsonDefaultSafe(value) {
  if (value == null) return value === null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object": {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) if (!H(value, i) || !jsonDefaultSafe(value[i])) return false;
        return true;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return false;
      if (Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== Object.keys(value).length) return false;
      return Object.keys(value).every((key) => jsonDefaultSafe(value[key]));
    }
    default:
      return false;
  }
}

function int32Bounded(rule) {
  return Number.isInteger(rule.min) && Number.isInteger(rule.max) && rule.min >= -2147483648 && rule.max <= 2147483647;
}

function prop(key, bare) {
  if (key === "__proto__") return `[${literal(key)}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key)?bare?key:`.${key}`:bare?literal(key):`[${literal(key)}]`;
}
