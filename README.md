# fast-mode-for-pi

A small Pi extension that adds a `/fast` command for OpenAI/Codex Fast service tier requests.

When enabled, every OpenAI/Codex Responses or Chat Completions request gets:

```json
{
  "service_tier": "fast"
}
```

## Install

Install it with Pi's package manager:

```bash
pi install git:github.com/fabiangigler/fast-mode-for-pi
```

Then reload Pi:

```text
/reload
```

## Commands

```text
/fast
```

Toggles fast mode.

```text
/fast on
/fast off
/fast toggle
/fast status
```

Controls or displays the current state.

The extension also publishes a Pi status entry named `fast-mode` with one of:

```text
fast mode on
fast mode off
```

Other extensions can read the same text from:

```ts
globalThis.__piFastModeStatus
```

## Model coverage

Fast mode is requested for all model IDs under Pi's `openai` and `openai-codex` providers, using these APIs:

```text
openai-codex-responses
openai-responses
openai-completions
```

There is no model allowlist; `PI_FAST_MODE_MODELS` is no longer used. Other providers, including OpenAI-compatible third-party services, are left untouched.

This requests Fast mode; it does not guarantee the backend grants it. Models or accounts without Fast support may reject the request or process it at a different tier. Use `/fast off` if needed.

Enable fast mode by default with:

```bash
export PI_FAST_MODE=true
```

## State

The enabled/disabled state is persisted in the Pi session, so it survives `/reload` and resumed sessions.

## Notes

- The extension modifies OpenAI/Codex Responses and Chat Completions request bodies, not HTTP headers.
- When fast mode is off, it leaves provider payloads untouched.
- It does not silently fall back when the server rejects Fast mode.

## Tests

```bash
pnpm test
```

Tests run the extension hooks in isolation without making API requests.
