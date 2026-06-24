import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

export function createWorker(env) {
  const config = loadConfig(env);
  const logger = createLogger(config.logging);

  return {
    queues: config.worker.queues,
    concurrency: config.worker.concurrency,
    runOnce() {
      logger.info("worker tick", { queues: config.worker.queues, concurrency: config.worker.concurrency });
      return config.worker.queues.map((queue) => ({ queue, handled: Math.min(config.worker.concurrency, 1) }));
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createWorker().runOnce();
}
