# Native Strategy

Generated JavaScript remains the default. Native or WASM should be treated as an optional experiment, not a replacement, unless it wins end-to-end against generated JS.

The current fast path emits standalone JavaScript that reads `env.KEY`, performs inline string/number checks, and returns a plain object. For this workload, crossing a JS/native or JS/WASM boundary can cost more than the validation itself, especially for small serverless schemas.

## Language Ranking

For a Node-only native addon:

1. Rust via Node-API, likely through `napi-rs`.
2. C++ via `node-addon-api`.
3. Zig through Node-API/C ABI.
4. Go through cgo.

Rust is the best first experiment because it balances byte-level parsing speed, memory safety, and npm distribution. C++ can be fastest but has a higher maintenance and safety cost. Zig is interesting for raw byte handling and small binaries, but the Node addon ecosystem is thinner. Go is the weakest fit because cgo and cross-compilation friction are not attractive for a small npm addon.

For WASM:

1. Zig-to-WASM.
2. Rust-to-WASM.
3. AssemblyScript.
4. C/C++ through Emscripten.

Zig is the best WASM experiment if the goal is the leanest byte-oriented core. Rust is the better production ecosystem choice. AssemblyScript is ergonomic but adds runtime/binding shape. C/C++ through Emscripten is likely too much glue for this workload.

## Why JS Still Wins By Default

- Env validation mostly reads JavaScript strings and performs short comparisons.
- Generated JS has no FFI boundary, no WASM memory copy, no binary load, and no instantiate step.
- Node-API improves ABI stability, but prebuilt binary distribution is still a real package and CI surface.
- Vercel Edge restricts dynamic code execution, including `WebAssembly.instantiate`, so a WASM default would be a portability risk.
- Cloudflare Workers support WASM, but edge WASM still needs a very thin ABI and should avoid WASI/threading assumptions.

## Plausible Native Shape

If pursued later, use an optional package such as `celery-env-native`:

- JS compiler remains the source of truth for schema semantics and type output.
- Native code receives a compact precompiled plan, not arbitrary schema objects.
- Expose both JS-string and byte-buffer input benchmarks so boundary cost is visible.
- The JS package falls back cleanly when native binaries are unavailable.

## Acceptance Bar

A native or WASM path should beat generated JS on all of these before becoming recommended:

- cold process start + module import/instantiate + first validation
- hot valid small, medium, and large schemas
- invalid aggregate-error path
- install time and package artifact size
- Linux x64 and arm64 serverless compatibility
- no regression for edge-compatible generated JS

Native code is most likely to help heavy operations such as allocation-free list scanning, large JSON-ish parsing, or batch validation. It is least likely to help the common small env-schema path where V8 already optimizes straight-line generated JavaScript well.

## Sources

- Node-API documentation: https://nodejs.org/api/n-api.html
- Vercel Edge runtime restrictions: https://vercel.com/docs/functions/runtimes/edge/edge-functions.rsc
- Cloudflare Workers WASM documentation: https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- Rust string model: https://doc.rust-lang.org/book/ch08-02-strings.html
- Zig string/byte model: https://ziglang.org/documentation/master/
