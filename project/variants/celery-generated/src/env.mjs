const H=Object.hasOwn;
function J(v){return v[0]=="{"&&v[v.length-1]!="}"||v[0]=="["&&v[v.length-1]!="]"}
function E(e){const o=Object.create(null);for(const k of Object.keys(e))o[k]=e[k];return o}
export function loadEnv(env = process.env) {
  let r;
  let v;
  let _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25;
  let x;
  v = (H(env,"NODE_ENV")?env.NODE_ENV:undefined);
  if (v == null || v === "") {
    _0 = "development";
  }
  else {
    if (v === "development" || v === "test" || v === "production") _0 = v;
    else (r ??= []).push("NODE_ENV must be one of development, test, production");
  }
  v = (H(env,"APP_NAME")?env.APP_NAME:undefined);
  if (v == null || v === "") {
    _1 = "orders-api";
  }
  else {
    _1 = v;
  }
  v = (H(env,"HOST")?env.HOST:undefined);
  if (v == null || v === "") {
    _2 = "127.0.0.1";
  }
  else {
    _2 = v;
  }
  v = (H(env,"PORT")?env.PORT:undefined);
  if (v == null || v === "") {
    _3 = 3000;
  }
  else {
    {
      let q = 0;
      let z = v.length;
      let c = v.charCodeAt(q);
      let g = 1;
      if (c === 43 || c === 45) { g = c === 45 ? -1 : 1; q++; }
      if (q === z) (r ??= []).push("PORT must be a strict integer");
      else {
        let n = 0;
        for (; q < z; q++) {
          c = v.charCodeAt(q);
          if (c < 48 || c > 57) break;
          n = n * 10 + c - 48;
        }
        if (q !== z) (r ??= []).push("PORT must be a strict integer");
        else {
          n *= g;
          if ((n | 0) !== n) (r ??= []).push("PORT must be an integer");
          else if (n < 1) (r ??= []).push("PORT must be >= 1");
          else if (n > 65535) (r ??= []).push("PORT must be <= 65535");
          else _3 = n;
        }
      }
    }
  }
  v = (H(env,"PUBLIC_URL")?env.PUBLIC_URL:undefined);
  if (v == null || v === "") {
    if ((H(env,"NODE_ENV")?env.NODE_ENV:undefined) !== "production") _4 = "http://localhost:3000";
    else (r ??= []).push("PUBLIC_URL is required");
  }
  else {
    try { new URL(v); _4 = v; } catch { (r ??= []).push("PUBLIC_URL must be a URL"); }
  }
  v = (H(env,"TRUST_PROXY")?env.TRUST_PROXY:undefined);
  if (v == null || v === "") {
    _5 = false;
  }
  else {
    if (v==="true"||v==="1"||v==="yes"||v==="on") _5 = true;
    else if (v==="false"||v==="0"||v==="no"||v==="off") _5 = false;
    else (r ??= []).push("TRUST_PROXY must be a boolean");
  }
  v = (H(env,"SUPPORT_EMAIL")?env.SUPPORT_EMAIL:undefined);
  if (v == null || v === "") {
    _6 = "support@example.com";
  }
  else {
    if (!v.includes("@")) (r ??= []).push("SUPPORT_EMAIL must include @");
    else _6 = v;
  }
  v = (H(env,"DATABASE_URL")?env.DATABASE_URL:undefined);
  if (v == null || v === "") (r ??= []).push("DATABASE_URL is required");
  else {
    try { new URL(v); _7 = v; } catch { (r ??= []).push("DATABASE_URL must be a URL"); }
  }
  v = (H(env,"DATABASE_POOL_MIN")?env.DATABASE_POOL_MIN:undefined);
  if (v == null || v === "") {
    _8 = 1;
  }
  else {
    {
      let q = 0;
      let z = v.length;
      let c = v.charCodeAt(q);
      let g = 1;
      if (c === 43 || c === 45) { g = c === 45 ? -1 : 1; q++; }
      if (q === z) (r ??= []).push("DATABASE_POOL_MIN must be a strict integer");
      else {
        let n = 0;
        for (; q < z; q++) {
          c = v.charCodeAt(q);
          if (c < 48 || c > 57) break;
          n = n * 10 + c - 48;
        }
        if (q !== z) (r ??= []).push("DATABASE_POOL_MIN must be a strict integer");
        else {
          n *= g;
          if ((n | 0) !== n) (r ??= []).push("DATABASE_POOL_MIN must be an integer");
          else if (n < 0) (r ??= []).push("DATABASE_POOL_MIN must be >= 0");
          else if (n > 50) (r ??= []).push("DATABASE_POOL_MIN must be <= 50");
          else _8 = n;
        }
      }
    }
  }
  v = (H(env,"DATABASE_POOL_MAX")?env.DATABASE_POOL_MAX:undefined);
  if (v == null || v === "") {
    _9 = 10;
  }
  else {
    {
      let q = 0;
      let z = v.length;
      let c = v.charCodeAt(q);
      let g = 1;
      if (c === 43 || c === 45) { g = c === 45 ? -1 : 1; q++; }
      if (q === z) (r ??= []).push("DATABASE_POOL_MAX must be a strict integer");
      else {
        let n = 0;
        for (; q < z; q++) {
          c = v.charCodeAt(q);
          if (c < 48 || c > 57) break;
          n = n * 10 + c - 48;
        }
        if (q !== z) (r ??= []).push("DATABASE_POOL_MAX must be a strict integer");
        else {
          n *= g;
          if ((n | 0) !== n) (r ??= []).push("DATABASE_POOL_MAX must be an integer");
          else if (n < 1) (r ??= []).push("DATABASE_POOL_MAX must be >= 1");
          else if (n > 100) (r ??= []).push("DATABASE_POOL_MAX must be <= 100");
          else _9 = n;
        }
      }
    }
  }
  v = (H(env,"REDIS_URL")?env.REDIS_URL:undefined);
  if (v != null && v !== "") {
    try { new URL(v); _10 = v; } catch { (r ??= []).push("REDIS_URL must be a URL"); }
  }
  v = (H(env,"LOG_LEVEL")?env.LOG_LEVEL:undefined);
  if (v == null || v === "") {
    _11 = "info";
  }
  else {
    if (v === "debug" || v === "info" || v === "warn" || v === "error") _11 = v;
    else (r ??= []).push("LOG_LEVEL must be one of debug, info, warn, error");
  }
  v = (H(env,"LOG_FORMAT")?env.LOG_FORMAT:undefined);
  if (v == null || v === "") {
    if ((H(env,"NODE_ENV")?env.NODE_ENV:undefined) !== "production") _12 = "pretty";
    else _12 = "json";
  }
  else {
    if (v === "pretty" || v === "json") _12 = v;
    else (r ??= []).push("LOG_FORMAT must be one of pretty, json");
  }
  v = (H(env,"OTEL_ENABLED")?env.OTEL_ENABLED:undefined);
  if (v == null || v === "") {
    _13 = false;
  }
  else {
    if (v==="true"||v==="1"||v==="yes"||v==="on") _13 = true;
    else if (v==="false"||v==="0"||v==="no"||v==="off") _13 = false;
    else (r ??= []).push("OTEL_ENABLED must be a boolean");
  }
  v = (H(env,"SENTRY_DSN")?env.SENTRY_DSN:undefined);
  if (v != null && v !== "") {
    try { new URL(v); _14 = v; } catch { (r ??= []).push("SENTRY_DSN must be a URL"); }
  }
  v = (H(env,"CORS_ORIGINS")?env.CORS_ORIGINS:undefined);
  if (v == null || v === "") {
    _15 = ["http://localhost:5173"];
  }
  else {
    {
      const l = [];
      for (let i = 0, s = 0, e;; i++, s = e + 1) {
        e = v.indexOf(",", s);
        x = e < 0 ? v.slice(s) : v.slice(s, e);
        x = x.trim();
        try { new URL(x); l[i] = x; } catch { (r ??= []).push("CORS_ORIGINS item must be a URL"); }
        if (e < 0) break;
      }
      _15 = l;
    }
  }
  v = (H(env,"RATE_LIMIT_JSON")?env.RATE_LIMIT_JSON:undefined);
  if (v == null || v === "") {
    _16 = {"windowMs":60000,"max":120};
  }
  else {
    try { if (J(v)) throw 0; _16 = JSON.parse(v); } catch { (r ??= []).push("RATE_LIMIT_JSON must be valid JSON"); }
  }
  v = (H(env,"FEATURE_FLAGS")?env.FEATURE_FLAGS:undefined);
  if (v == null || v === "") {
    _17 = [];
  }
  else {
    {
      const l = [];
      for (let i = 0, s = 0, e;; i++, s = e + 1) {
        e = v.indexOf(",", s);
        let a = s;
        let z = e < 0 ? v.length : e;
        while (a < z) { const c = v.charCodeAt(a); if (!(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)) break; a++; }
        while (z > a) { const c = v.charCodeAt(z - 1); if (!(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)) break; z--; }
        if (z - a < 1) (r ??= []).push("FEATURE_FLAGS item must have length >= 1");
        else l[i] = v.slice(a, z);
        if (e < 0) break;
      }
      _17 = l;
    }
  }
  v = (H(env,"ALLOWED_TENANTS")?env.ALLOWED_TENANTS:undefined);
  if (v == null || v === "") {
    _18 = ["demo"];
  }
  else {
    {
      const l = [];
      for (let i = 0, s = 0, e;; i++, s = e + 1) {
        e = v.indexOf(",", s);
        let a = s;
        let z = e < 0 ? v.length : e;
        while (a < z) { const c = v.charCodeAt(a); if (!(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)) break; a++; }
        while (z > a) { const c = v.charCodeAt(z - 1); if (!(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)) break; z--; }
        if (z - a < 1) (r ??= []).push("ALLOWED_TENANTS item must have length >= 1");
        else l[i] = v.slice(a, z);
        if (e < 0) break;
      }
      _18 = l;
    }
  }
  v = (H(env,"PAYMENTS_PROVIDER")?env.PAYMENTS_PROVIDER:undefined);
  if (v == null || v === "") {
    _19 = "mock";
  }
  else {
    if (v === "mock" || v === "stripe") _19 = v;
    else (r ??= []).push("PAYMENTS_PROVIDER must be one of mock, stripe");
  }
  v = (H(env,"STRIPE_SECRET_KEY")?env.STRIPE_SECRET_KEY:undefined);
  if (v == null || v === "") {
    if (((env) => env.PAYMENTS_PROVIDER === "stripe")(E(env)) === true) (r ??= []).push("STRIPE_SECRET_KEY is required");
  }
  else {
    _20 = v;
  }
  v = (H(env,"WEBHOOK_ENDPOINT")?env.WEBHOOK_ENDPOINT:undefined);
  if (v != null && v !== "") {
    try { new URL(v); _21 = v; } catch { (r ??= []).push("WEBHOOK_ENDPOINT must be a URL"); }
  }
  v = (H(env,"WORKER_CONCURRENCY")?env.WORKER_CONCURRENCY:undefined);
  if (v == null || v === "") {
    _22 = 4;
  }
  else {
    {
      let q = 0;
      let z = v.length;
      let c = v.charCodeAt(q);
      let g = 1;
      if (c === 43 || c === 45) { g = c === 45 ? -1 : 1; q++; }
      if (q === z) (r ??= []).push("WORKER_CONCURRENCY must be a strict integer");
      else {
        let n = 0;
        for (; q < z; q++) {
          c = v.charCodeAt(q);
          if (c < 48 || c > 57) break;
          n = n * 10 + c - 48;
        }
        if (q !== z) (r ??= []).push("WORKER_CONCURRENCY must be a strict integer");
        else {
          n *= g;
          if ((n | 0) !== n) (r ??= []).push("WORKER_CONCURRENCY must be an integer");
          else if (n < 1) (r ??= []).push("WORKER_CONCURRENCY must be >= 1");
          else if (n > 32) (r ??= []).push("WORKER_CONCURRENCY must be <= 32");
          else _22 = n;
        }
      }
    }
  }
  v = (H(env,"JOB_QUEUES")?env.JOB_QUEUES:undefined);
  if (v == null || v === "") {
    _23 = ["email","billing","reports"];
  }
  else {
    {
      const l = [];
      for (let i = 0, s = 0, e;; i++, s = e + 1) {
        e = v.indexOf(",", s);
        let a = s;
        let z = e < 0 ? v.length : e;
        while (a < z) { const c = v.charCodeAt(a); if (!(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)) break; a++; }
        while (z > a) { const c = v.charCodeAt(z - 1); if (!(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)) break; z--; }
        if (z - a < 1) (r ??= []).push("JOB_QUEUES item must have length >= 1");
        else l[i] = v.slice(a, z);
        if (e < 0) break;
      }
      _23 = l;
    }
  }
  v = (H(env,"ENABLE_SIGNUPS")?env.ENABLE_SIGNUPS:undefined);
  if (v == null || v === "") {
    _24 = true;
  }
  else {
    if (v==="true"||v==="1"||v==="yes"||v==="on") _24 = true;
    else if (v==="false"||v==="0"||v==="no"||v==="off") _24 = false;
    else (r ??= []).push("ENABLE_SIGNUPS must be a boolean");
  }
  v = (H(env,"SESSION_SECRET")?env.SESSION_SECRET:undefined);
  if (v == null || v === "") {
    if ((H(env,"NODE_ENV")?env.NODE_ENV:undefined) !== "production") _25 = "development-only-session-secret-value";
    else (r ??= []).push("SESSION_SECRET is required");
  }
  else {
    _25 = v;
  }
  if (r) throw Error("Invalid environment:\n- " + r.join("\n- "));
  return { NODE_ENV: _0, APP_NAME: _1, HOST: _2, PORT: _3, PUBLIC_URL: _4, TRUST_PROXY: _5, SUPPORT_EMAIL: _6, DATABASE_URL: _7, DATABASE_POOL_MIN: _8, DATABASE_POOL_MAX: _9, REDIS_URL: _10, LOG_LEVEL: _11, LOG_FORMAT: _12, OTEL_ENABLED: _13, SENTRY_DSN: _14, CORS_ORIGINS: _15, RATE_LIMIT_JSON: _16, FEATURE_FLAGS: _17, ALLOWED_TENANTS: _18, PAYMENTS_PROVIDER: _19, STRIPE_SECRET_KEY: _20, WEBHOOK_ENDPOINT: _21, WORKER_CONCURRENCY: _22, JOB_QUEUES: _23, ENABLE_SIGNUPS: _24, SESSION_SECRET: _25 };
}
export default loadEnv;
