import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

export function createWorker(env = process.env) {
  const config = loadConfig(env);
  const logger = createLogger(config.logging);
  const queues = (env.JOB_QUEUES || config.worker.queues.join(",")).split(",").map((queue) => queue.trim()).filter(Boolean);
  const concurrency = Number(env.WORKER_CONCURRENCY || config.worker.concurrency);

  return {
    queues,
    concurrency,
    runOnce() {
      logger.info("worker tick", { queues, concurrency });
      return queues.map((queue) => ({ queue, handled: Math.min(concurrency, 1) }));
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createWorker().runOnce();
}
