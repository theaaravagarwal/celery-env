import { bool, defineEnv, int, oneOf, str, url } from "celery-env";

export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
  DATABASE_URL: url({ protocols: ["postgres", "postgresql"] }),
  PORT: int({ default: 3000, min: 1, max: 65535 }),
  DEBUG: bool({ default: false }),
  API_KEY: str({ min: 8 })
});
