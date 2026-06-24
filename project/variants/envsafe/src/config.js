import { loadEnv } from "./env.js";

export function loadConfig(env) {
  const values = loadEnv(env);

  return {
    app: {
      name: values.APP_NAME,
      nodeEnv: values.NODE_ENV,
      host: values.HOST,
      port: values.PORT,
      publicUrl: values.PUBLIC_URL,
      trustProxy: values.TRUST_PROXY,
      supportEmail: values.SUPPORT_EMAIL
    },
    database: {
      url: values.DATABASE_URL,
      poolMin: values.DATABASE_POOL_MIN,
      poolMax: values.DATABASE_POOL_MAX,
      redisUrl: values.REDIS_URL
    },
    logging: {
      level: values.LOG_LEVEL,
      format: values.LOG_FORMAT,
      otelEnabled: values.OTEL_ENABLED,
      sentryDsn: values.SENTRY_DSN
    },
    http: {
      corsOrigins: values.CORS_ORIGINS,
      rateLimit: values.RATE_LIMIT_JSON,
      sessionSecret: values.SESSION_SECRET,
      enableSignups: values.ENABLE_SIGNUPS,
      allowedTenants: values.ALLOWED_TENANTS
    },
    payments: {
      provider: values.PAYMENTS_PROVIDER,
      stripeSecretKey: values.STRIPE_SECRET_KEY,
      webhookEndpoint: values.WEBHOOK_ENDPOINT
    },
    worker: {
      concurrency: values.WORKER_CONCURRENCY,
      queues: values.JOB_QUEUES,
      featureFlags: values.FEATURE_FLAGS
    }
  };
}
