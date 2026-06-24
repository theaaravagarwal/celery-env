export function telemetryStatus(logging) {
  return {
    sentry: logging.sentryDsn ? "sentry" : "none",
    traces: logging.otelEnabled
  };
}
