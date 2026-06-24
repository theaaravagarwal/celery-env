
  import { bool, defineEnv, int, oneOf, parseEnv, str } from "../../../src/index.js";
  const schema = defineEnv({
    NODE_ENV: oneOf(["development", "test", "production"]),
    PORT: int({ min: 1, max: 65535 }),
    DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
    DEBUG: bool(),
    API_KEY: str({ min: 16 })
  });
  export function loadEnv(env) { return parseEnv(schema, env); }
  export default loadEnv;
