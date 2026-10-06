import assert from "node:assert/strict";
import extension from "./index.ts";

const handlers = new Map();
const commands = new Map();
const persisted = [];
const statuses = [];
const originalFast = process.env.PI_FAST_MODE;
const originalModels = process.env.PI_FAST_MODE_MODELS;

try {
	process.env.PI_FAST_MODE = "false";
	// The old allowlist must no longer restrict newer or unknown model IDs.
	process.env.PI_FAST_MODE_MODELS = "gpt-5.4";
	extension({
		on: (name, handler) => handlers.set(name, handler),
		registerCommand: (name, command) => commands.set(name, command),
		appendEntry: (customType, data) => persisted.push({ customType, data }),
	} as any);
	const ctx = {
		model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6.1-sol" },
		sessionManager: { getEntries: () => [{ type: "custom", customType: "fast-mode-state", data: { enabled: true } }] },
		ui: { setStatus: (_key, text) => statuses.push(text), notify: () => {} },
	};
	await handlers.get("session_start")({}, ctx);
	assert.equal(statuses.at(-1), "fast mode on", "persisted state overrides the environment default");

	const request = (payload: unknown) => handlers.get("before_provider_request")({ payload }, ctx);
	for (const [provider, api, tier] of [
		["openai", "openai-responses", "fast"],
		["openai", "openai-completions", "fast"],
		["openai-codex", "openai-codex-responses", "priority"],
	]) {
		for (const id of ["gpt-5.4", "gpt-5.5", "gpt-5.6-sol", "gpt-6-sol", "gpt-6.1-sol", "gpt-4o", "o3", "future-model"]) {
			ctx.model = { provider, api, id };
			const payload = { model: id, service_tier: "auto", input: "unchanged" };
			assert.equal(request(payload), payload);
			assert.deepEqual(payload, { model: id, service_tier: tier, input: "unchanged" }, `${provider}/${id}`);
		}
	}
	console.log("✓ All model IDs request fast on the public OpenAI API and priority on Codex");

	for (const [provider, api] of [
		["openrouter", "openai-completions"],
		["custom-gateway", "openai-responses"],
		["anthropic", "anthropic-messages"],
		["openai", "unrelated-api"],
	]) {
		ctx.model = { provider, api, id: "gpt-6.1-sol" };
		const payload = { service_tier: "auto" };
		assert.equal(request(payload), undefined);
		assert.deepEqual(payload, { service_tier: "auto" });
	}
	ctx.model = { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6.1-sol" };
	for (const payload of [null, undefined, [], "text"]) assert.equal(request(payload), undefined);
	console.log("✓ Third-party providers, unrelated APIs and invalid payloads remain untouched");

	await commands.get("fast").handler("off", ctx);
	assert.equal(statuses.at(-1), "fast mode off");
	const normalPayload = { service_tier: "default" };
	assert.equal(request(normalPayload), undefined);
	assert.deepEqual(normalPayload, { service_tier: "default" });
	await commands.get("fast").handler("on", ctx);
	const fastPayload = {};
	request(fastPayload);
	assert.deepEqual(fastPayload, { service_tier: "priority" }, "Codex rejects the public API's fast alias, including on gpt-6.1-sol");
	assert.deepEqual(persisted, [
		{ customType: "fast-mode-state", data: { enabled: false } },
		{ customType: "fast-mode-state", data: { enabled: true } },
	]);
	await commands.get("fast").handler("status", ctx);
	assert.equal(persisted.length, 2, "status must not persist a state change");
	console.log("✓ Session persistence and /fast on, off and status behavior are preserved");
} finally {
	if (originalFast === undefined) delete process.env.PI_FAST_MODE;
	else process.env.PI_FAST_MODE = originalFast;
	if (originalModels === undefined) delete process.env.PI_FAST_MODE_MODELS;
	else process.env.PI_FAST_MODE_MODELS = originalModels;
}
