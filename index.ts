import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

declare const process: { env: Record<string, string | undefined> };

const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"]);
const SERVICE_TIER_APIS = new Set(["openai-codex-responses", "openai-responses", "openai-completions"]);
const COMMAND_OPTIONS = ["on", "off", "toggle", "status", "ultrafast"];
const STATUS_KEY = "fast-mode";
const STATE_CUSTOM_TYPE = "fast-mode-state";

type Mode = "off" | "fast" | "ultrafast";
type FastModeState = { enabled: boolean; tier?: "fast" | "ultrafast" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isFastModeState = (value: unknown): value is FastModeState =>
	isRecord(value) && typeof value.enabled === "boolean" &&
	(value.tier === undefined || value.tier === "fast" || value.tier === "ultrafast");

const fastModeExtension = (pi: ExtensionAPI) => {
	let mode: Mode = process.env.PI_FAST_MODE === "1" || process.env.PI_FAST_MODE === "true" ? "fast" : "off";
	let lastPersistedState: Mode | undefined;

	const getPersistedState = (ctx: ExtensionContext): Mode | undefined => {
		let persisted: Mode | undefined;

		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type !== "custom" || entry.customType !== STATE_CUSTOM_TYPE || !isFastModeState(entry.data)) continue;
			persisted = entry.data.enabled ? entry.data.tier ?? "fast" : "off";
		}

		return persisted;
	};

	const persistState = () => {
		if (lastPersistedState === mode) return;
		lastPersistedState = mode;
		pi.appendEntry<FastModeState>(STATE_CUSTOM_TYPE,
			mode === "ultrafast" ? { enabled: true, tier: "ultrafast" } : { enabled: mode === "fast" });
	};

	const getStatusText = () => mode === "ultrafast" ? "ultrafast mode on" : mode === "fast" ? "fast mode on" : "fast mode off";
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
		if (persisted !== undefined) mode = persisted;
		lastPersistedState = mode;
		updateStatus(ctx);
	});

	pi.registerCommand("fast", {
		description: "Select Fast or Ultrafast service tier requests for OpenAI/Codex models",
		getArgumentCompletions: (prefix) =>
			COMMAND_OPTIONS.filter((option) => option.startsWith(prefix)).map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();

			let next = mode;

			if (command === "on") {
				next = "fast";
			} else if (command === "ultrafast") {
				next = "ultrafast";
			} else if (command === "off") {
				next = "off";
			} else if (command === "" || command === "toggle") {
				next = mode === "off" ? "fast" : "off";
			} else if (command !== "status") {
				ctx.ui.notify("Usage: /fast [on|off|toggle|status|ultrafast]", "warning");
				return;
			}

			if (next !== mode) {
				mode = next;
				persistState();
			}
			updateStatus(ctx);
			ctx.ui.notify(getStatusText(), "info");
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		const payload = event.payload;
		if (!isRecord(payload) || !isOpenAIRequest(ctx)) return;

		if (mode === "off") return;

		// Fast has API-specific names; Ultrafast uses the same wire value on both.
		// Request the selected tier even on unknown models: the backend checks access.
		payload.service_tier = mode === "ultrafast" ? "ultrafast"
			: ctx.model?.api === "openai-codex-responses" ? "priority" : "fast";
		return payload;
	});
};

export default fastModeExtension;
