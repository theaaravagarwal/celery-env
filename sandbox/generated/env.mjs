export function loadEnv(env = process.env) {
  const o = {};
  let r;
  let v;
  v = env.NODE_ENV;
  if (v == null || v === "") {
    o.NODE_ENV = "development";
  }
  else {
    if (v === "development" || v === "test" || v === "production") o.NODE_ENV = v;
    else (r ??= []).push("NODE_ENV must be one of development, test, production");
  }
  v = env.DATABASE_URL;
  if (v == null || v === "") (r ??= []).push("DATABASE_URL is required");
  else {
    try { const u = new URL(v); if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") (r ??= []).push("DATABASE_URL must use protocol postgres, postgresql"); else o.DATABASE_URL = v; } catch { (r ??= []).push("DATABASE_URL must be a URL"); }
  }
  v = env.PORT;
  if (v == null || v === "") {
    o.PORT = 3000;
  }
  else {
    v = +v;
    if ((v | 0) !== v) (r ??= []).push("PORT must be an integer");
    else if (v < 1) (r ??= []).push("PORT must be >= 1");
    else if (v > 65535) (r ??= []).push("PORT must be <= 65535");
    else o.PORT = v;
  }
  v = env.DEBUG;
  if (v == null || v === "") {
    o.DEBUG = false;
  }
  else {
    if (v==="true" || v==="1" || v==="yes" || v==="on") o.DEBUG = true;
    else if (v==="false" || v==="0" || v==="no" || v==="off") o.DEBUG = false;
    else (r ??= []).push("DEBUG must be a boolean");
  }
  v = env.API_KEY;
  if (v == null || v === "") (r ??= []).push("API_KEY is required");
  else {
    if (v.length < 8) (r ??= []).push("API_KEY must have length >= 8");
    else o.API_KEY = v;
  }
  if (r) throw Error("Invalid environment:\n- " + r.join("\n- "));
  return o;
}
export default loadEnv;
