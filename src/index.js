const STR = 0, INT = 1, NUM = 2, BOOL = 3, ENUM = 4, URL_T = 5, JSON_T = 6, LIST = 7;
const K = Symbol();
const C = new WeakMap();
const H = Object.hasOwn;

export class EnvError extends Error {
  constructor(e) {
    super(`Invalid environment:\n- ${e.join("\n- ")}`);
    this.name = "EnvError";
    this.errors = e;
  }
}

function spec(t, options) {
  const rule = Object.create(null);
  rule.t = t;
  if (options) for (const key of Object.keys(options)) rule[key] = options[key];
  return rule;
}

export function defineEnv(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new TypeError("defineEnv() expects an object schema");
  const entries = schemaEntries(schema);
  Object.isExtensible(schema)?Object.defineProperty(schema,K,{value:entries}):C.set(schema,entries)
  return Object.freeze(schema);
}

export function str(options) {
  assertBaseOptions("str", options);
  assertStringOptions("str", options);
  return spec(STR, options);
}

export function int(options) {
  assertBaseOptions("int", options);
  assertNumberOptions("int", options);
  return spec(INT, options);
}

export function num(options) {
  assertBaseOptions("num", options);
  assertNumberOptions("num", options);
  return spec(NUM, options);
}

export function bool(options) {
  assertBaseOptions("bool", options);
  return spec(BOOL, options);
}

export function oneOf(values, options) {
  if (!Array.isArray(values) || !values.length) throw new TypeError("oneOf() expects a non-empty array");
  if (values.some(v => typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean" || typeof v === "number" && !Number.isFinite(v))) {
    throw new TypeError("oneOf() values must be strings, finite numbers, or booleans");
  }
  assertBaseOptions("oneOf", options);
  const mixed = values.some(v=>typeof v!="string");
  const strings = mixed ? values.map(String) : values.slice();
  const rule = {...options,values,strings};
  if (!mixed && values.length>4) rule.m = new Set(values);
  return spec(ENUM, rule);
}

export function url(options) {
  assertBaseOptions("url", options);
  assertStringOptions("url", options);
  if (options && H(options, "protocols") && (!Array.isArray(options.protocols) || options.protocols.some(p => typeof p !== "string" || p === "" || p.includes(":")))) {
    throw new TypeError("url() protocols must be protocol names without \":\"");
  }
  return spec(URL_T, options && H(options, "protocols") ? {...options,ps:options.protocols.map(p=>p+":")} : options);
}

export function json(options) {
  assertBaseOptions("json", options);
  return spec(JSON_T, options);
}

export function list(item, options) {
  if (!isCelerySpec(item)) throw new TypeError("list() expects a celery-env spec item");
  assertBaseOptions("list", options);
  if (options && H(options, "separator") && typeof options.separator !== "string") throw new TypeError("list() separator must be a string");
  if (options && H(options, "trim") && typeof options.trim !== "boolean") throw new TypeError("list() trim must be a boolean");
  return spec(LIST, {separator:",",...options,item});
}

export function parseEnv(schema, env = process.env) {
  const out = {}, e = [];
  const entries = schema[K] || C.get(schema) || schemaEntries(schema);

  for (let i = 0; i < entries.length; i += 2) {
    const key = entries[i];
    const rule = entries[i + 1];
    set(out, key, readValue(key, rule, H(env, key) ? env[key] : undefined, e, -1, env));
  }

  if (e.length) throw new EnvError(e);
  return out;
}

export function isCelerySpec(value) {
  return !!value && typeof value === "object" && H(value, "t") && typeof value.t === "number";
}

function schemaEntries(schema) {
  const entries = [];
  for (const key of Object.keys(schema)) {
    const rule = schema[key];
    if (!isCelerySpec(rule)) throw new TypeError(`${key}: schema entry is not a celery-env spec`);
    if (rule.requiredWhen != null && typeof rule.requiredWhen !== "function") throw new TypeError(`${key}: requiredWhen must be a function`);
    entries.push(key, rule);
  }
  return entries;
}

function assertBaseOptions(name, options) {
  if (options === undefined) return;
  if (options === null || typeof options !== "object" || Array.isArray(options)) throw new TypeError(`${name}() options must be an object`);
  if (H(options, "optional") && typeof options.optional !== "boolean") throw new TypeError(`${name}() optional must be a boolean`);
  if (H(options, "requiredWhen") && options.requiredWhen != null && typeof options.requiredWhen !== "function") throw new TypeError(`${name}() requiredWhen must be a function`);
  if (H(options, "desc") && typeof options.desc !== "string") throw new TypeError(`${name}() desc must be a string`);
  if (H(options, "docs") && typeof options.docs !== "string") throw new TypeError(`${name}() docs must be a string`);
}

function assertStringOptions(name, options) {
  if (!options) return;
  assertLimit(name, options, "min");
  assertLimit(name, options, "max");
  if (H(options, "startsWith") && typeof options.startsWith !== "string") throw new TypeError(`${name}() startsWith must be a string`);
  if (H(options, "includes") && typeof options.includes !== "string") throw new TypeError(`${name}() includes must be a string`);
}

function assertNumberOptions(name, options) {
  if (!options) return;
  assertLimit(name, options, "min");
  assertLimit(name, options, "max");
  if (H(options, "strict") && typeof options.strict !== "boolean") throw new TypeError(`${name}() strict must be a boolean`);
}

function assertLimit(name, options, key) {
  if (H(options, key) && !Number.isFinite(options[key])) throw new TypeError(`${name}() ${key} must be a finite number`);
}

function readValue(key, rule, value, e, i, env) {
  if (value == null || value === "") {
    if (H(rule, "testDefault") || H(rule, "devDefault")) {
      const n = H(env, "NODE_ENV") ? env.NODE_ENV : undefined;
      if (n === "test" && H(rule, "testDefault")) return rule.testDefault;
      if (n !== "production" && H(rule, "devDefault")) return rule.devDefault;
    }
    if (H(rule, "default")) return rule.default;
    if (H(rule, "optional") && rule.optional && (!H(rule, "requiredWhen") || rule.requiredWhen(ownEnv(env)) !== true)) return;
    e.push(`${k(key, i)} is required`);
    return;
  }

  switch (rule.t) {
    case STR:
      return readString(key, rule, value, e, i);
    case INT:
      return readNumber(key, rule, value, true, e, i);
    case NUM:
      return readNumber(key, rule, value, false, e, i);
    case BOOL: {
      const p = boolValue(value);
      if (p !== undefined) return p;
      e.push(`${k(key, i)} must be a boolean`);
      return;
    }
    case ENUM:
      return readOneOf(key, rule, value, e, i);
    case URL_T:
      return readUrl(key, rule, value, e, i);
    case JSON_T:
      if(!j(value))try{return JSON.parse(value)}catch{}
      e.push(`${k(key, i)} must be valid JSON`);
      return;
    case LIST:
      return readList(k(key, i), rule, value, e, env);
    default:
      throw new Error(`${key}: unknown validator kind ${rule.t}`);
  }
}

function readString(key, rule, value, e, i) {
  const p = rule.startsWith;
  if (rule.min != null && (p == null || p.length < rule.min) && value.length < rule.min) e.push(`${k(key, i)} must have length >= ${rule.min}`);
  else if (rule.max != null && value.length > rule.max) e.push(`${k(key, i)} must have length <= ${rule.max}`);
  else if (p != null && !value.startsWith(p)) e.push(`${k(key, i)} must start with ${p}`);
  else if (rule.includes != null && !value.includes(rule.includes)) e.push(`${k(key, i)} must include ${rule.includes}`);
  else return value;
}

function readNumber(key, rule, value, integer, e, i) {
  if (rule.strict && !sn(value, integer)) {
    e.push(`${k(key, i)} must be ${integer?"a strict integer":"a strict number"}`);
    return;
  }
  const n = +value;
  if (!isFinite(n) || integer && !Number.isInteger(n)) e.push(`${k(key, i)} must be ${integer?"an integer":"a number"}`);
  else if (rule.min != null && n < rule.min) e.push(`${k(key, i)} must be >= ${rule.min}`);
  else if (rule.max != null && n > rule.max) e.push(`${k(key, i)} must be <= ${rule.max}`);
  else return n;
}

function sn(v, i) {
  let q = 0, d, h, c = v.charCodeAt(q);
  if (c === 43 || c === 45) q++;
  for (; q < v.length; q++) {
    c = v.charCodeAt(q);
    if (c === 46 && !i && !h) h = 1;
    else if (c < 48 || c > 57) return;
    else d = 1;
  }
  return d;
}

function j(v){return v[0]=="{"&&v[v.length-1]!="}"||v[0]=="["&&v[v.length-1]!="]"}

function set(o, k, v) {
  if (k === "__proto__") Object.defineProperty(o, k, { value: v, enumerable: true, configurable: true, writable: true });
  else o[k] = v;
}

function ownEnv(env) {
  const o = Object.create(null);
  for (const key of Object.keys(env)) o[key] = env[key];
  return o;
}

function boolValue(value) {
  switch (value.length) {
    case 1:
      if (value === "1") return true
      if (value === "0") return false
    case 2:
      if (value === "on") return true
      if (value === "no") return false
    case 3:
      if (value === "yes") return true
      if (value === "off") return false
    case 4:
      if (value === "true") return true
    case 5:
      if (value === "false") return false
  }
}

function readOneOf(key, rule, value, e, i) {
  if (rule.m?.has(value)) return value;
  for (let j = 0; j < rule.values.length; j++) {
    if (value === rule.strings[j]) return rule.values[j];
  }
  e.push(`${k(key, i)} must be one of ${rule.values.join(", ")}`);
}

function readUrl(key, rule, value, e, i) {
  try {
    if (rule.ps ? rule.ps.includes(new URL(value).protocol) : new URL(value)) return value;
  } catch {
    e.push(`${k(key, i)} must be a URL`);
    return;
  }
  e.push(`${k(key, i)} must use protocol ${rule.protocols.join(", ")}`);
}

function readList(key, rule, value, e, env) {
  const sep=rule.separator, item=rule.item, trim=rule.trim !== false;
  const fast=!item.requiredWhen && !("devDefault" in item) && !("testDefault" in item);
  if (sep !== "" && item.t === INT && item.strict && fast && int32Bounded(item)) return readStrictIntList(key, item, sep, trim, value, e);
  if (sep !== "" && item.t === NUM && item.strict && fast) return readStrictNumList(key, item, sep, trim, value, e);
  if (item.t === BOOL && fast) return readBoolList(key, item, sep, trim, value, e);
  if (sep !== "" && item.t === ENUM && fast) return readEnums(key, item, sep, trim, value, e);
  if (item.t === STR && fast) return readStringList(key, item, sep, trim, value, e);
  const z = sep === "";
  const out = z ? new Array(value.length) : [];
  for (let i = 0, s = 0, end;; i++, s = end + sep.length) {
    end = z ? i : value.indexOf(sep, s);
    if (z && i === value.length) break;
    let x = z ? value[i] : end < 0 ? value.slice(s) : value.slice(s, end);
    if (trim) x = x.trim();
    out[i] = readValue(key, item, x, e, i, env);
    if (end < 0) break;
  }
  return out;
}

function readBoolList(key, item, sep, trim, value, e) {
  const z = sep === "";
  const out = z ? new Array(value.length) : [];
  for (let i = 0, s = 0, end;; i++, s = end + sep.length) {
    end = z ? i : value.indexOf(sep, s);
    if (z && i === value.length) break;
    let x = z ? value[i] : end < 0 ? value.slice(s) : value.slice(s, end);
    if (trim) x = x.trim();
    if (x === "") {
      if (!("default" in item) && !item.optional) e.push(`${k(key, i)} is required`);
      else out[i] = item.default;
    } else {
      const p = boolValue(x);
      if (p === undefined) e.push(`${k(key, i)} must be a boolean`);
      else out[i] = p;
    }
    if (end < 0) break;
  }
  return out;
}

function readEnums(key, item, sep, trim, value, e) {
  const out = [];
  for (let i = 0, s = 0, end;; i++, s = end + sep.length) {
    end = value.indexOf(sep, s);
    let x = end < 0 ? value.slice(s) : value.slice(s, end);
    if (trim) x = x.trim();
    if (x === "") {
      if (!("default" in item) && !item.optional) e.push(`${k(key, i)} is required`);
      else out[i] = item.default;
    } else out[i] = readOneOf(key, item, x, e, i);
    if (end < 0) break;
  }
  return out;
}

function readStringList(key, item, sep, trim, value, e) {
  const p = item.startsWith;
  if (sep === "" && !trim && item.min == null && item.max == null && p == null && item.includes == null) return value.split("");
  const z = sep === "";
  const out = z ? new Array(value.length) : [];
  for (let i = 0, s = 0, end;; i++, s = end + sep.length) {
    end = z ? i : value.indexOf(sep, s);
    if (z && i === value.length) break;
    let x = z ? value[i] : end < 0 ? value.slice(s) : value.slice(s, end);
    if (trim) x = x.trim();
    if (x === "") {
      if (!("default" in item) && !item.optional) e.push(`${k(key, i)} is required`);
      else out[i] = item.default;
    } else if (item.min != null && (p == null || p.length < item.min) && x.length < item.min) e.push(`${k(key, i)} must have length >= ${item.min}`);
    else if (item.max != null && x.length > item.max) e.push(`${k(key, i)} must have length <= ${item.max}`);
    else if (p != null && !x.startsWith(p)) e.push(`${k(key, i)} must start with ${p}`);
    else if (item.includes != null && !x.includes(item.includes)) e.push(`${k(key, i)} must include ${item.includes}`);
    else out[i] = x;
    if (end < 0) break;
  }
  return out;
}

function readStrictIntList(key, item, sep, trim, value, e) {
  const out = [];
  for (let i = 0, s = 0, end;; i++, s = end + sep.length) {
    end = value.indexOf(sep, s);
    let a = s;
    let z = end < 0 ? value.length : end;
    if (trim) {
      while (a < z && ws(value.charCodeAt(a))) a++;
      while (z > a && ws(value.charCodeAt(z - 1))) z--;
    }
    if (a === z) {
      if (!("default" in item) && !item.optional) e.push(`${k(key, i)} must be a strict integer`);
      else out[i] = item.default;
    } else {
      let q = a;
      let c = value.charCodeAt(q);
      let g = 1;
      if (c === 43 || c === 45) {
        g = c === 45 ? -1 : 1;
        q++;
      }
      if (q === z) {
        e.push(`${k(key, i)} must be a strict integer`);
      } else {
        let n = 0;
        for (; q < z; q++) {
          c = value.charCodeAt(q);
          if (c < 48 || c > 57) break;
          n = n * 10 + c - 48;
        }
        if (q !== z) e.push(`${k(key, i)} must be a strict integer`);
        else {
          n *= g;
          if ((n | 0) !== n) e.push(`${k(key, i)} must be an integer`);
          else if (item.min != null && n < item.min) e.push(`${k(key, i)} must be >= ${item.min}`);
          else if (item.max != null && n > item.max) e.push(`${k(key, i)} must be <= ${item.max}`);
          else out[i] = n;
        }
      }
    }
    if (end < 0) break;
  }
  return out;
}

function readStrictNumList(key, item, sep, trim, value, e) {
  const out = [];
  for (let i = 0, s = 0, end;; i++, s = end + sep.length) {
    end = value.indexOf(sep, s);
    let x = end < 0 ? value.slice(s) : value.slice(s, end);
    if (trim) x = x.trim();
    if (x === "") {
      if (!("default" in item) && !item.optional) e.push(`${k(key, i)} is required`);
      else out[i] = item.default;
    } else if (!sn(x)) e.push(`${k(key, i)} must be a strict number`);
    else {
      const n = +x;
      if (!isFinite(n)) e.push(`${k(key, i)} must be a number`);
      else if (item.min != null && n < item.min) e.push(`${k(key, i)} must be >= ${item.min}`);
      else if (item.max != null && n > item.max) e.push(`${k(key, i)} must be <= ${item.max}`);
      else out[i] = n;
    }
    if (end < 0) break;
  }
  return out;
}

function int32Bounded(rule) {
  return Number.isInteger(rule.min) && Number.isInteger(rule.max) && rule.min >= -2147483648 && rule.max <= 2147483647;
}

function ws(c) {
  return c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
}

function k(key, i) {
  return i<0?key:`${key}[${i}]`;
}
