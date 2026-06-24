export function telemetryStatus(env = process.env) {
  const sentry = env.SENTRY_DSN ? "sentry" : "none";
  const traces = ["true", "1", "yes", "on"].includes(String(env.OTEL_ENABLED || "").toLowerCase());

  return {
    sentry,
    traces
  };
}
