export function connectDatabase(config) {
  return {
    status: config.url ? "configured" : "missing",
    poolMax: config.poolMax,
    query(sql) {
      return {
        sql,
        target: config.url ? new URL(config.url).hostname : "unconfigured"
      };
    }
  };
}
