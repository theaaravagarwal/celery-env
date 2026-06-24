# Runtime Mode

Runtime mode validates with `parseEnv(schema, env)` directly. Use it when:

- You do not want generated files.
- Your app is small and startup cost is not critical.
- You are prototyping before switching to generated mode.

## Example

```js
import { defineEnv, int, parseEnv, str } from "celery-env";

const schema = defineEnv({
  DATABASE_URL: str({ min: 1 }),
  PORT: int({ default: 3000 })
});

export const env = parseEnv(schema, process.env);
```

## Tradeoff

Runtime mode is simpler, but generated mode is usually faster and can avoid a
runtime dependency in production.

| Mode | Build Step | Runtime Dependency | Best For |
| --- | --- | --- | --- |
| Generated | yes | no | production apps |
| Runtime | no | yes | small apps, scripts, prototypes |

## Errors

Celery aggregates errors by default:

```text
Invalid environment:
- DATABASE_URL is required
- PORT must be an integer
```

Rejected values are not included in error messages, which helps avoid leaking
secrets.
