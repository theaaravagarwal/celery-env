import { spawnSync } from "node:child_process";

export function currentRuntimeMetadata() {
  const bunVersion = globalThis.Bun?.version;
  return {
    runtimeName: bunVersion ? "bun" : "node",
    runtimeVersion: bunVersion || process.version,
    nodeCompatVersion: process.version,
    v8Version: process.versions?.v8 || "unknown",
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath
  };
}

export function resolveRuntime(target) {
  if (target === "node") return process.env.NODE_BIN || "node";
  if (target === "bun") return process.env.BUN_BIN || "bun";
  throw new Error(`Unknown runtime target: ${target}`);
}

export function runtimeMetadata(target) {
  const exec = resolveRuntime(target);
  const result = spawnSync(exec, ["--version"], { encoding: "utf8" });
  return {
    target,
    exec,
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : undefined,
    error: result.status === 0 ? undefined : result.stderr.trim() || result.error?.message || `exit ${result.status}`
  };
}

export function spawnRuntime(target, args, options = {}) {
  const exec = resolveRuntime(target);
  return spawnSync(exec, args, {
    encoding: "utf8",
    ...options,
    env: { ...process.env, ...options.env }
  });
}

export function parseRuntimeList(value) {
  return String(value || "node")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
