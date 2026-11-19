import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import extension from "./index.ts";

const originalFetch = globalThis.fetch;
const originalStatus = (globalThis as { __piFastModeStatus?: string }).__piFastModeStatus;
globalThis.fetch = async () => { throw new Error("Network disabled in extension tests"); };
after(() => {
	globalThis.fetch = originalFetch;
	if (originalStatus === undefined) delete (globalThis as { __piFastModeStatus?: string }).__piFastModeStatus;
	else (globalThis as { __piFastModeStatus?: string }).__piFastModeStatus = originalStatus;
});

const state = (data: unknown) => ({ type: "custom", customType: "fast-mode-state", data });
function harness(entries: unknown[] = [], env?: string) {
	const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	const persisted: Array<{ customType: string; data: unknown }> = [];
	const statuses: string[] = [];
	const notices: Array<{ text: string; type: string }> = [];
	const original = process.env.PI_FAST_MODE;
	if (env === undefined) delete process.env.PI_FAST_MODE;
	else process.env.PI_FAST_MODE = env;
	try {
		extension({
			on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => handlers.set(name, handler),
			registerCommand: (name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => commands.set(name, command),
			appendEntry: (customType: string, data: unknown) => { persisted.push({ customType, data }); entries.push(state(data)); },
		} as unknown as ExtensionAPI);
	} finally {
		if (original === undefined) delete process.env.PI_FAST_MODE;
		else process.env.PI_FAST_MODE = original;
	}
	const ctx = {
		model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6.2-sol" },
		sessionManager: { getEntries: () => entries },
		ui: {
			setStatus: (_key: string, text: string) => statuses.push(text),
			notify: (text: string, type: string) => notices.push({ text, type }),
		},
	};
	handlers.get("session_start")!({}, ctx);
	return {
		ctx, entries, persisted, statuses, notices,
		command: (args: string) => commands.get("fast")!.handler(args, ctx as unknown as ExtensionCommandContext),
		complete: (prefix: string) => commands.get("fast")!.getArgumentCompletions!(prefix),
		request: (payload: unknown, context: unknown = ctx) => handlers.get("before_provider_request")!({ payload }, context),
	};
}

const apis = [
	["openai", "openai-responses", "fast"],
	["openai", "openai-completions", "fast"],
	["openai-codex", "openai-codex-responses", "priority"],
];
const models = ["gpt-6.2-sol", "gpt-6.2-astra", "gpt-6.1-sol", "gpt-6-astra", "gpt-5.6-sol", "gpt-5.5", "gpt-5.4", "gpt-4o", "o3", "future-model"];

test("existing boolean session state still restores ordinary Fast, never Ultrafast", () => {
	const h = harness([state({ enabled: true })]);
	assert.equal(h.statuses.at(-1), "fast mode on");
	const payload = {};
	h.request(payload);
	assert.deepEqual(payload, { service_tier: "priority" });
	assert.deepEqual(h.persisted, []);
	assert.equal(harness([state({ enabled: false })], "true").statuses.at(-1), "fast mode off");
});

test("all model IDs get the selected tier on the three existing OpenAI API paths", async () => {
	const original = process.env.PI_FAST_MODE_MODELS;
	process.env.PI_FAST_MODE_MODELS = "gpt-5.4";
	try {
		const h = harness();
		for (const command of ["on", "ultrafast"]) {
			await h.command(command);
			for (const [provider, api, fastTier] of apis) {
				for (const id of models) {
					h.ctx.model = { provider, api, id };
					const payload = { model: id, service_tier: "auto", input: [{ role: "user", content: "Synthetic test" }] };
					const expected = { ...structuredClone(payload), service_tier: command === "ultrafast" ? "ultrafast" : fastTier };
					assert.equal(h.request(payload), payload);
					assert.deepEqual(payload, expected, `${command}: ${provider}/${api}/${id}`);
				}
			}
		}
	} finally {
		if (original === undefined) delete process.env.PI_FAST_MODE_MODELS;
		else process.env.PI_FAST_MODE_MODELS = original;
	}
});

test("off leaves the entire payload untouched, including after Ultrafast was selected", async () => {
	const h = harness();
	await h.command("ultrafast");
	await h.command("off");
	const payload = { service_tier: "default", input: ["Synthetic test"] };
	assert.equal(h.request(payload), undefined);
	assert.deepEqual(payload, { service_tier: "default", input: ["Synthetic test"] });
	assert.equal(h.statuses.at(-1), "fast mode off");
});

test("third-party providers, unrelated APIs and absent models remain untouched in both modes", async () => {
	const h = harness();
	for (const command of ["on", "ultrafast"]) {
		await h.command(command);
		for (const [provider, api] of [
			["openrouter", "openai-completions"], ["custom-gateway", "openai-responses"],
			["anthropic", "anthropic-messages"], ["openai", "unrelated-api"],
		]) {
			h.ctx.model = { provider, api, id: "gpt-6.2-sol" };
			const payload = { service_tier: "auto" };
			assert.equal(h.request(payload), undefined);
			assert.deepEqual(payload, { service_tier: "auto" });
		}
		assert.equal(h.request({}, {}), undefined);
	}
});

test("invalid payloads are not modified", async () => {
	const h = harness();
	await h.command("ultrafast");
	for (const payload of [null, undefined, [], "text", 1]) assert.equal(h.request(payload), undefined);
});

test("Ultrafast survives replay and a later legacy boolean record still overrides it", async () => {
	const h = harness();
	await h.command("ultrafast");
	assert.deepEqual(h.persisted, [{ customType: "fast-mode-state", data: { enabled: true, tier: "ultrafast" } }]);
	const reopened = harness([...h.entries]);
	assert.equal(reopened.statuses.at(-1), "ultrafast mode on");
	assert.equal((globalThis as { __piFastModeStatus?: string }).__piFastModeStatus, "ultrafast mode on");
	const payload = {};
	reopened.request(payload);
	assert.deepEqual(payload, { service_tier: "ultrafast" });
	assert.equal(harness([...h.entries, state({ enabled: true })]).statuses.at(-1), "fast mode on");
	assert.equal(harness([...h.entries, state({ enabled: false })]).statuses.at(-1), "fast mode off");
});

test("malformed persisted state does not replace the latest valid mode", () => {
	const h = harness([
		state({ enabled: true, tier: "ultrafast" }),
		state(null), state([]), state({ enabled: "true" }), state({ enabled: true, tier: "turbo" }),
		{ type: "custom", customType: "unrelated", data: { enabled: false } },
	]);
	assert.equal(h.statuses.at(-1), "ultrafast mode on");
});

test("/fast on selects ordinary Fast; toggling Ultrafast disables it and never opts back into it", async () => {
	const h = harness();
	await h.command("ultrafast");
	await h.command("on");
	assert.equal(h.statuses.at(-1), "fast mode on");
	await h.command("ultrafast");
	await h.command("");
	assert.equal(h.statuses.at(-1), "fast mode off");
	await h.command("toggle");
	assert.equal(h.statuses.at(-1), "fast mode on");
	assert.deepEqual(h.persisted.at(-1), { customType: "fast-mode-state", data: { enabled: true } });
});

test("status, repeated selections and invalid commands do not append duplicate state", async () => {
	const h = harness();
	await h.command(" ULTRAFAST ");
	await h.command("ultrafast");
	await h.command("status");
	await h.command("turbo");
	await h.command("ultrafast on");
	assert.equal(h.persisted.length, 1);
	assert.equal(h.statuses.at(-1), "ultrafast mode on");
	assert.equal(h.notices.at(-1)?.type, "warning");
	assert.match(h.notices.at(-1)!.text, /ultrafast/);
});

test("autocomplete includes the explicit Ultrafast command", async () => {
	const h = harness();
	assert.deepEqual(await h.complete("u"), [{ value: "ultrafast", label: "ultrafast" }]);
});

test("existing environment defaults remain ordinary Fast and do not enable Ultrafast", () => {
	for (const value of ["1", "true"]) assert.equal(harness([], value).statuses.at(-1), "fast mode on");
	for (const value of [undefined, "false", "0"]) assert.equal(harness([], value).statuses.at(-1), "fast mode off");
});
