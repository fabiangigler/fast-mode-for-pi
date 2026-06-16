# fast-mode-for-pi

A small Pi extension that adds a `/fast` command for OpenAI/Codex priority service tier requests.

When enabled, supported OpenAI Responses API requests get:

```json
{
  "service_tier": "priority"
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

## Supported models

By default, fast mode is applied only when the current model is one of:

```text
gpt-5.4
gpt-5.5
```

and the provider API is one of:

```text
openai-codex-responses
openai-responses
```

Override the model allowlist with:

```bash
export PI_FAST_MODE_MODELS="gpt-5.4,gpt-5.5,another-model"
```

Enable fast mode by default with:

```bash
export PI_FAST_MODE=true
```

## State

The enabled/disabled state is persisted in the Pi session, so it survives `/reload` and resumed sessions.

## Notes

- The extension only modifies requests for the supported OpenAI Responses APIs.
- When fast mode is off, it leaves provider payloads untouched.
- Unsupported models keep using Pi's normal provider behavior.
