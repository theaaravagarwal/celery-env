export function createLogger(config) {
  const level = config.level;
  const json = config.format === "json";

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields)
  };

  function write(entryLevel, message, fields = {}) {
    if (!enabled(level, entryLevel)) return;
    if (json) console.log(JSON.stringify({ level: entryLevel, message, ...fields }));
    else console.log(`[${entryLevel}] ${message}`);
  }
}

function enabled(current, next) {
  const order = ["debug", "info", "warn", "error"];
  return order.indexOf(next) >= order.indexOf(current);
}
