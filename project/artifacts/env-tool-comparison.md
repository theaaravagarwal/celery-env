# Env Tool Comparison

Generated: 2026-06-24T11:19:23.885Z

| Tool | Runtime deps | Install pkgs | App LOC | Env LOC | Env LOC vs gen | Generated LOC | Test LOC | Env reads | Tests | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| manual process.env | none | 0 | 134 | 179 | +16 | 0 | 123 | 13 | pass | pass |
| celery generated | none | 0 | 127 | 163 | 0 | 368 | 173 | 1 | pass | pass |
| celery runtime | celery-env | 1 | 127 | 164 | +1 | 0 | 173 | 1 | pass | pass |
| zod | zod | 1 | 127 | 241 | +78 | 0 | 173 | 1 | pass | pass |
| valibot | valibot | 1 | 127 | 241 | +78 | 0 | 173 | 1 | pass | pass |
| envalid | envalid | 2 | 127 | 199 | +36 | 0 | 173 | 1 | pass | pass |
| envsafe | envsafe | 1 | 127 | 270 | +107 | 0 | 173 | 1 | pass | pass |
| env-var | env-var | 1 | 127 | 232 | +69 | 0 | 173 | 1 | pass | pass |
| @t3-oss/env-core | @t3-oss/env-core, zod | 2 | 127 | 267 | +104 | 0 | 173 | 1 | pass | pass |

All variants preserve the same fixture behavior: defaults, strict integers, booleans, URLs, lists, JSON, conditional secrets, secret-safe errors, and own-property env reads.
