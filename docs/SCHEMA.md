# Schema API

Schemas are plain JavaScript modules. Each key describes one env var.

```js
import { defineEnv, int, str } from "celery-env";

export default defineEnv({
  DATABASE_URL: str({ min: 1 }),
  PORT: int({ default: 3000 })
});
```

Think of the schema as executable documentation for your configuration. The key
is the env var name, the validator describes the accepted string format, and
options describe defaults, examples, and environment-specific behavior.

## Validators

| Validator | Output | Use For |
| --- | --- | --- |
| `str(options)` | `string` | Text, secrets, tokens. |
| `int(options)` | `number` | Whole numbers like ports and limits. |
| `num(options)` | `number` | Decimal numbers. |
| `bool(options)` | `boolean` | Feature flags. |
| `oneOf(values, options)` | union | Enums like `NODE_ENV`. |
| `url(options)` | `string` | URLs with optional protocols. |
| `json(options)` | `unknown` | JSON strings parsed with `JSON.parse`. |
| `list(item, options)` | `readonly T[]` | Comma-separated lists. |

## Common Options

| Option | Meaning |
| --- | --- |
| `default` | Value used when the env var is missing. |
| `devDefault` | Value used when `NODE_ENV` is not `production`. |
| `testDefault` | Value used when `NODE_ENV` is `test`. |
| `optional` | Allows the value to be missing. |
| `requiredWhen` | Function that can make a value required. |
| `desc` | Description used in generated `.env.example`. |
| `example` | Example value used in generated `.env.example`. |
| `docs` | Longer documentation text for generated metadata. |

`testDefault` wins over `devDefault`, and `default` applies in every
environment.

## Missing Values

Empty strings are treated as missing. If a value is missing, Celery checks
options in this order:

1. `testDefault` when `NODE_ENV` is `test`.
2. `devDefault` when `NODE_ENV` is not `production`.
3. `default`.
4. `optional`.
5. Otherwise, the variable is required.

## Strings

```js
str({ min: 8, max: 128 })
str({ startsWith: "sk_" })
str({ includes: "@" })
```

## Numbers

```js
int({ min: 1, max: 65535 })
num({ min: 0, max: 1 })
```

By default, numeric parsing follows JavaScript `Number()`. Use `strict: true`
to reject values such as hex and exponent notation:

```js
int({ strict: true })
num({ strict: true })
```

## Booleans

Accepted true values:

```text
true, 1, yes, on
```

Accepted false values:

```text
false, 0, no, off
```

## Enums

```js
oneOf(["development", "test", "production"], {
  default: "development"
})
```

Values can be strings, numbers, or booleans.

## URLs

```js
url({ protocols: ["https"] })
url({ protocols: ["postgres", "postgresql"] })
```

Write protocols without the colon. Use `postgres`, not `postgres:`.

## JSON

```js
json()
```

Celery validates that the value is valid JSON. It does not validate the object
shape inside that JSON.

## Lists

```js
list(str())
list(int({ strict: true }))
list(url({ protocols: ["https"] }))
```

Options:

```js
list(str(), { separator: ",", trim: true })
```

`separator` defaults to `","`. `trim` defaults to `true`.

## Conditional Required Values

```js
SESSION_SECRET: str({
  optional: true,
  requiredWhen: (env) => env.NODE_ENV === "production"
})
```

Generated validators serialize `requiredWhen` with `Function#toString()`.
Keep the function self-contained and do not close over local variables.
