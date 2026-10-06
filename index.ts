import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

declare const process: { env: Record<string, string | undefined> };

const FAST_SERVICE_TIER = "fast";
const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"]);
const SERVICE_TIER_APIS = new Set(["openai-codex-responses", "openai-responses", "openai-completions"]);
const COMMAND_OPTIONS = ["on", "off", "toggle", "status"];
const STATUS_KEY = "fast-mode";
const STATE_CUSTOM_TYPE = "fast-mode-state";

type FastModeState = { enabled: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isFastModeState = (value: unknown): value is FastModeState =>
	isRecord(value) && typeof value.enabled === "boolean";

const fastModeExtension = (pi: ExtensionAPI) => {
	let enabled = process.env.PI_FAST_MODE === "1" || process.env.PI_FAST_MODE === "true";
	let lastPersistedState: boolean | undefined;

	const getPersistedState = (ctx: ExtensionContext): boolean | undefined => {
		let persisted: boolean | undefined;

		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type !== "custom" || entry.customType !== STATE_CUSTOM_TYPE || !isFastModeState(entry.data)) continue;
			persisted = entry.data.enabled;
		}

		return persisted;
	};

	const persistState = () => {
		if (lastPersistedState === enabled) return;
		lastPersistedState = enabled;
		pi.appendEntry<FastModeState>(STATE_CUSTOM_TYPE, { enabled });
	};

	const getStatusText = () => (enabled ? "fast mode on" : "fast mode off");
	const updateGlobalStatus = () => {
		(globalThis as typeof globalThis & { __piFastModeStatus?: string }).__piFastModeStatus = getStatusText();
	};
	const updateStatus = (ctx: ExtensionContext) => {
		updateGlobalStatus();
		ctx.ui.setStatus(STATUS_KEY, getStatusText());
	};

	updateGlobalStatus();

	const isOpenAIRequest = (ctx: { model?: { provider?: string; api?: string } }): boolean =>
		OPENAI_PROVIDERS.has(ctx.model?.provider ?? "") && SERVICE_TIER_APIS.has(ctx.model?.api ?? "");

	pi.on("session_start", (_event, ctx) => {
		const persisted = getPersistedState(ctx);
		if (persisted !== undefined) enabled = persisted;
		lastPersistedState = enabled;
		updateStatus(ctx);
	});

	pi.registerCommand("fast", {
		description: "Toggle the Fast service tier for all OpenAI/Codex models",
		getArgumentCompletions: (prefix) =>
			COMMAND_OPTIONS.filter((option) => option.startsWith(prefix)).map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();

			let changed = false;

			if (command === "on") {
				changed = enabled !== true;
				enabled = true;
			} else if (command === "off") {
				changed = enabled !== false;
				enabled = false;
			} else if (command === "" || command === "toggle") {
				enabled = !enabled;
				changed = true;
			} else if (command !== "status") {
				ctx.ui.notify("Usage: /fast [on|off|toggle|status]", "warning");
				return;
			}

			if (changed) persistState();
			updateStatus(ctx);
			ctx.ui.notify(getStatusText(), enabled ? "success" : "info");
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		const payload = event.payload;
		if (!isRecord(payload) || !isOpenAIRequest(ctx)) return;

		if (!enabled) return;

		payload.service_tier = FAST_SERVICE_TIER;
		return payload;
	});
};

export default fastModeExtension;
