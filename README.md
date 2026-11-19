# fast-mode-for-pi

A small Pi extension that adds a `/fast` command for OpenAI/Codex Fast and Ultrafast service tier requests.

| Command | Public OpenAI `service_tier` | ChatGPT/Codex `service_tier` |
| --- | --- | --- |
| `/fast on` | `"fast"` | `"priority"` |
| `/fast ultrafast` | `"ultrafast"` | `"ultrafast"` |
| `/fast off` | Payload unchanged | Payload unchanged |

Ultrafast is opt-in. Existing Fast settings and sessions are not automatically upgraded.

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

Toggles ordinary Fast on/off. If Ultrafast is active, toggling turns it off; the next toggle enables ordinary Fast, not Ultrafast.

```text
/fast on
/fast ultrafast
/fast off
/fast toggle
/fast status
```

Controls or displays the current state.

The extension also publishes a Pi status entry named `fast-mode` with one of:

```text
fast mode on
ultrafast mode on
fast mode off
```

Other extensions can read the same text from:

```ts
globalThis.__piFastModeStatus
```

## Model coverage

The selected tier is requested for all model IDs under Pi's `openai` and `openai-codex` providers, using these APIs:

```text
openai-codex-responses
openai-responses
openai-completions
```

There is no model allowlist; `PI_FAST_MODE_MODELS` is no longer used. Other providers, including OpenAI-compatible third-party services, are left untouched.

The backend determines model/API/account eligibility. [Pro $200 Ultrafast access currently includes GPT-6.2 Sol](https://learn.chatgpt.com/docs/whats-new/gpt-62-astra-sol); other plans have different eligibility. The [Ultrafast API guide](https://developers.openai.com/api/docs/guides/ultrafast-mode) documents supported Responses models.

Fast and Ultrafast use more plan allowance or API spend. Unsupported requests may be rejected or processed at another tier by the backend. The extension never retries them at a lower tier. Its status shows the **requested** mode, not confirmation of the served or billed tier. Use `/fast on` or `/fast off` to change it.

Enable ordinary Fast (not Ultrafast) by default with:

```bash
export PI_FAST_MODE=true
```

## State

The selected mode is persisted in the Pi session, so it survives `/reload` and resumed sessions. Older boolean state records restore ordinary Fast or off.

## Notes

- The extension modifies OpenAI/Codex Responses and Chat Completions request bodies, not HTTP headers.
- When fast mode is off, it leaves provider payloads untouched.
- It does not silently fall back when the server rejects Fast or Ultrafast mode.
- Pi's displayed cost estimates may not include Ultrafast pricing. OpenAI's usage/billing records are authoritative.

## Tests

```bash
pnpm test
```

Tests run the extension hooks in isolation without making API requests.
