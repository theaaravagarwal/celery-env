
  import * as v from "valibot";
  const toBool = (x) => x === "true" || x === "1" || x === "yes" || x === "on";
  const schema = v.object({
    NODE_ENV: v.picklist(["development", "test", "production"]),
    PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(65535)),
    DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.startsWith("postgres://")),
    DEBUG: v.pipe(v.string(), v.picklist(["true", "false", "1", "0", "yes", "no", "on", "off"]), v.transform(toBool)),
    API_KEY: v.pipe(v.string(), v.minLength(16))
  });
  export function loadEnv(env) { return v.parse(schema, env); }
  export default loadEnv;
