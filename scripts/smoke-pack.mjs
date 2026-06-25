import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const tmp = await mkdtemp(join(tmpdir(), "celery-pack-smoke-"));
const cache = join(tmp, "npm-cache");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cache },
    stdio: options.stdio || "pipe"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result.stdout;
}

try {
  const npmExec = process.env.npm_execpath;
  const npm = npmExec ? process.execPath : "npm";
  const npmPrefix = npmExec ? [npmExec] : [];

  const packOutput = run(npm, [
    ...npmPrefix,
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    tmp
  ]);
  const [pack] = JSON.parse(packOutput.trim());
  const tarball = join(tmp, pack.filename);

  await writeFile(join(tmp, "package.json"), JSON.stringify({ type: "module" }));
  run(npm, [...npmPrefix, "install", "--ignore-scripts", tarball], { cwd: tmp });

  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const checkSource = `
    import assert from "node:assert/strict";
    import { bool, defineEnv, int, parseEnv, str } from "celery-env";
    import { generateValidator } from "celery-env/compiler";

    const schema = defineEnv({
      PORT: int({ default: 3000 }),
      DEBUG: bool({ default: false }),
      NAME: str({ default: "app" })
    });
    assert.deepEqual(parseEnv(schema, { PORT: "4000", DEBUG: "true" }), {
      PORT: 4000,
      DEBUG: true,
      NAME: "app"
    });
    assert.match(generateValidator(schema), /function loadEnv/);
  `;
  run(process.execPath, ["--input-type=module", "-e", checkSource], { cwd: tmp });
  run(process.execPath, [join(tmp, "node_modules", pkg.name, "src", "cli.js"), "--help"], { cwd: tmp });

  const inferDir = join(tmp, "infer-app");
  await mkdir(join(inferDir, "src"), { recursive: true });
  await writeFile(join(inferDir, ".env.example"), "PORT=3000\nPUBLIC_URL=https://example.com\n", "utf8");
  await writeFile(join(inferDir, "src", "config.js"), "export const secret = process.env.SESSION_SECRET;\n", "utf8");
  run(process.execPath, [
    join(tmp, "node_modules", pkg.name, "src", "cli.js"),
    "infer",
    "--schema", join(inferDir, "env.schema.mjs")
  ], { cwd: inferDir });
  const inferred = await readFile(join(inferDir, "env.schema.mjs"), "utf8");
  assert.match(inferred, /from "celery-env"/);
  assert.match(inferred, /SESSION_SECRET/);

  const privateImport = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    "import('celery-env/infer')"
  ], { cwd: tmp, encoding: "utf8", env: { ...process.env, npm_config_cache: cache } });
  assert.notEqual(privateImport.status, 0);
  assert.match(privateImport.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED|Package subpath/);

  console.log(`pack smoke ok: ${pack.filename}`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
