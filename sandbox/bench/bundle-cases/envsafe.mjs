
  import { bool, envsafe, makeValidator, str } from "envsafe";
  const db = makeValidator((x) => { if (x.startsWith("postgres://")) return x; throw Error(); });
  const api = makeValidator((x) => { if (x.length >= 16) return x; throw Error(); });
  const port = makeValidator((x) => { const n = Number(x); if (Number.isInteger(n) && n >= 1 && n <= 65535) return n; throw Error(); });
  const schema = { NODE_ENV: str({ choices: ["development", "test", "production"] }), PORT: port(), DATABASE_URL: db(), DEBUG: bool(), API_KEY: api() };
  export function loadEnv(env) { return envsafe(schema, { env, reporter: ({ errors }) => { if (Object.keys(errors).length) throw Error(); } }); }
  export default loadEnv;
