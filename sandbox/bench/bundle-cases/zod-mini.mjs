
  import * as z from "zod/mini";
  const toBool = (v) => v === "true" || v === "1" || v === "yes" || v === "on";
  const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().check(z.int(), z.minimum(1), z.maximum(65535)),
    DATABASE_URL: z.string().check(z.minLength(1), z.startsWith("postgres://")),
    DEBUG: z.pipe(z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]), z.transform(toBool)),
    API_KEY: z.string().check(z.minLength(16))
  });
  export function loadEnv(env) { return z.parse(schema, env); }
  export default loadEnv;
