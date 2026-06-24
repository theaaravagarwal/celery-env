
  import { from } from "env-var";
  const validNodeEnv = ["development", "test", "production"];
  export function loadEnv(source) {
    const env = from(source);
    const DATABASE_URL = env.get("DATABASE_URL").required().asString();
    const API_KEY = env.get("API_KEY").required().asString();
    if (!DATABASE_URL.startsWith("postgres://")) throw Error();
    if (API_KEY.length < 16) throw Error();
    return {
      NODE_ENV: env.get("NODE_ENV").required().asEnum(validNodeEnv),
      PORT: env.get("PORT").required().asPortNumber(),
      DATABASE_URL,
      DEBUG: env.get("DEBUG").required().asBool(),
      API_KEY
    };
  }
  export default loadEnv;
