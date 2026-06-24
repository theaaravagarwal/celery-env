
  import { boolean, oneOf, port, string, validate } from "valienv";
  const validators = {
    NODE_ENV: oneOf("development", "test", "production"),
    PORT: port,
    DATABASE_URL: (x) => { const v = string(x); if (v?.startsWith("postgres://")) return v; },
    DEBUG: boolean,
    API_KEY: (x) => { const v = string(x); if (v && v.length >= 16) return v; }
  };
  export function loadEnv(env) { return validate({ env, validators }); }
  export default loadEnv;
