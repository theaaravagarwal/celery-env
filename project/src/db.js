export function connectDatabase(config, env = process.env) {
  // Legacy fallback kept for old tests and scripts that call this module directly.
  const url = config?.url || env.DATABASE_URL;
  const poolMax = config?.poolMax || Number(env.DATABASE_POOL_MAX || 10);

  return {
    status: url ? "configured" : "missing",
    poolMax,
    query(sql) {
      return {
        sql,
        target: url ? new URL(url).hostname : "unconfigured"
      };
    }
  };
}
