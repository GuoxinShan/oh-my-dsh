import { Service } from "@deepseek-ai/cordis";
/**
* Service Definition for the user-settings capability seam (`ctx.settings`). Providers store one raw document of
* per-namespace sections; plugins register a namespace schema and read the
* resolved value, which layers schema defaults, the registrant's composition
* `base`, and the user document section, in that order.
* @module @deepseek-ai/dsh-settings
*/
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
/**
* Brand a raw string as a {@link SettingsNamespace}.
* @param value - candidate namespace; lowercase kebab-case, as in plugin short names.
* @returns the branded namespace.
*/
function settingsNamespace(value) {
	if (!NAMESPACE_PATTERN.test(value)) throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
	return value;
}
Service.init;
//#endregion
//#region src/rules.ts
/**
* Pure planning logic for dsh-reasoning-efforts.
*
* The plugin's one job: give hand-declared `llm-pi-ai` models the
* `reasoningEfforts` declaration they lack, so the composer's model picker
* offers reasoning levels for them (upstream discussion #843 — the GUI has
* no editor for this field, and gateway model listings carry no reasoning
* metadata at all).
*
* A model becomes a fill candidate through three gates, split so this module
* stays synchronous and side-effect free:
*
* 1. the raw user layer does NOT already declare `reasoningEfforts` — an
*    explicit statement (including `false`) is never overridden;
* 2. an ordered rule matches the route and model id — first match wins, so a
*    narrowing rule (e.g. pin `*-non-reasoning` to `false`) can precede a
*    broad filling rule;
* 3. the live adapter does not already offer efforts for the route/model —
*    catalog-inherited capability (an `openai` route serving `gpt-5.1`)
*    must not be flattened into a rule's preset. This gate reads the `llm`
*    service, so the apply side runs it between {@link collectCandidates}
*    and {@link buildFillOps}.
*
* Writes are path-addressed `set` ops against the raw user layer (never the
* schema-resolved view — persisting materialized defaults would bake them
* into `settings.yaml`). The plugin only ever sets keys; removing a
* declaration stays a hand edit, deliberately.
*/
/** Every pi-ai thinking level, mirroring llm-pi-ai's THINKING_LEVELS. */
const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/** Plain-object check that excludes arrays (settings path ops treat arrays as opaque values). */
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Validate the plugin configuration, failing loud at the earliest point.
* Mirrors the checks llm-pi-ai's own profile resolution makes, so a fill can
* never write a section the settings namespace validator would reject.
* @param raw - the composition row's `config` value.
* @returns the validated rules (an absent `rules` key is the dormant posture).
* @throws Error naming the offending rule and field.
*/
function validateConfig(raw) {
	if (raw === void 0 || raw === null) return { rules: [] };
	if (!isPlainObject(raw)) throw new Error("dsh-reasoning-efforts: config must be an object with a \"rules\" array");
	const rawRules = raw.rules;
	if (rawRules === void 0) return { rules: [] };
	if (!Array.isArray(rawRules)) throw new Error("dsh-reasoning-efforts: config.rules must be an array");
	return { rules: rawRules.map((rawRule, position) => {
		const where = `dsh-reasoning-efforts: rules[${position}]`;
		if (!isPlainObject(rawRule)) throw new Error(`${where} must be an object`);
		const { routes, include, exclude, efforts } = rawRule;
		if (!Array.isArray(routes) || routes.length === 0 || routes.some((route) => typeof route !== "string" || route.length === 0)) throw new Error(`${where}.routes must be a non-empty array of non-empty route ids`);
		if (typeof include !== "string" || include.length === 0) throw new Error(`${where}.include must be a non-empty regex source`);
		const includeRe = compile(include, `${where}.include`);
		if (exclude !== void 0 && typeof exclude !== "string") throw new Error(`${where}.exclude must be a regex source string`);
		const excludeRe = exclude === void 0 ? void 0 : compile(exclude, `${where}.exclude`);
		return {
			routes: [...routes],
			include: includeRe,
			exclude: excludeRe,
			efforts: validateEfforts(efforts, `${where}.efforts`)
		};
	}) };
}
/** Compile one regex source, naming the field on failure. */
function compile(source, field) {
	try {
		return new RegExp(source);
	} catch (error) {
		throw new Error(`${field} is not a valid regex: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/**
* Validate one efforts declaration against llm-pi-ai's resolution rules:
* level names from {@link THINKING_LEVELS}; `off` may be valueless (send
* nothing) or carry a wire value; every other declared level needs a
* non-empty wire value; at least one level beyond `off` must be offered.
* @param raw - the configured declaration.
* @param field - the config path naming this declaration in diagnostics.
* @returns the validated declaration.
* @throws Error naming the offending entry.
*/
function validateEfforts(raw, field) {
	if (raw === false) return false;
	if (!isPlainObject(raw)) throw new Error(`${field} must be false or a dict of level -> wire value`);
	const entries = Object.entries(raw);
	if (entries.length === 0) throw new Error(`${field} is empty; declare the offered levels, or set false for a non-reasoning model`);
	for (const [level, wire] of entries) {
		if (!THINKING_LEVELS.includes(level)) throw new Error(`${field}.${level} is not a pi-ai thinking level (${THINKING_LEVELS.join(", ")})`);
		if (wire === null || wire === void 0) {
			if (level !== "off") throw new Error(`${field}.${level} needs the wire value dispatch should send; only "off" may leave it empty`);
		} else if (typeof wire !== "string" || wire.length === 0) throw new Error(`${field}.${level} must be a non-empty string or null`);
	}
	if (!entries.some(([level]) => level !== "off")) throw new Error(`${field} offers no level beyond "off"; declare a thinking level, or set false`);
	const declaration = {};
	for (const [level, wire] of entries) declaration[level] = wire === void 0 || wire === null ? null : wire;
	return declaration;
}
/** The first rule matching one route/model, or none. */
function matchRule(rules, route, modelId) {
	return rules.find((rule) => rule.routes.includes(route) && rule.include.test(modelId) && !(rule.exclude?.test(modelId) ?? false));
}
/**
* Collect fill candidates from the raw `llm-pi-ai` user layer: gates 1 and 2
* only. Entries the user already declared, non-object entries, and routes no
* rule names are invisible here.
* @param userProviders - the user layer's `providers` dict, verbatim.
* @param rules - validated rules, first match wins.
* @returns candidates in route/model order.
*/
function collectCandidates(userProviders, rules) {
	const candidates = [];
	if (rules.length === 0) return candidates;
	for (const [route, profile] of Object.entries(userProviders)) {
		if (!isPlainObject(profile)) continue;
		if (Array.isArray(profile.models)) profile.models.forEach((entry, index) => {
			if (!isPlainObject(entry)) return;
			if ("reasoningEfforts" in entry) return;
			if (typeof entry.id !== "string" || entry.id.length === 0) return;
			const rule = matchRule(rules, route, entry.id);
			if (rule === void 0) return;
			candidates.push({
				route,
				modelId: entry.id,
				efforts: rule.efforts,
				source: "models",
				index
			});
		});
		if (isPlainObject(profile.modelOverrides)) for (const [id, entry] of Object.entries(profile.modelOverrides)) {
			if (!isPlainObject(entry)) continue;
			if ("reasoningEfforts" in entry) continue;
			const rule = matchRule(rules, route, id);
			if (rule === void 0) continue;
			candidates.push({
				route,
				modelId: id,
				efforts: rule.efforts,
				source: "modelOverrides",
				index: -1
			});
		}
	}
	return candidates;
}
/** Own a declaration's data before it crosses into a settings write. */
function detachEfforts(efforts) {
	if (efforts === false) return false;
	return { ...efforts };
}
/**
* Turn surviving candidates into path-addressed user-layer writes.
*
* `models` is an array, and settings path ops treat arrays as opaque values,
* so one route's fill is a single `set` of the whole next array. The write
* rides the namespace's serialized queue with the caller's read revision, so
* a concurrent edit rejects instead of being silently clobbered.
* `modelOverrides` is a dict, so those fills stay surgical per model.
* @param candidates - candidates that survived gate 3.
* @param userProviders - the user layer's `providers` dict the candidates were read from.
* @returns the ordered set ops for one `settings.mutate` call.
*/
function buildFillOps(candidates, userProviders) {
	const modelsByRoute = /* @__PURE__ */ new Map();
	const overridesByRoute = /* @__PURE__ */ new Map();
	for (const candidate of candidates) if (candidate.source === "models") {
		let perRoute = modelsByRoute.get(candidate.route);
		if (perRoute === void 0) modelsByRoute.set(candidate.route, perRoute = /* @__PURE__ */ new Map());
		perRoute.set(candidate.index, candidate.efforts);
	} else {
		let perRoute = overridesByRoute.get(candidate.route);
		if (perRoute === void 0) overridesByRoute.set(candidate.route, perRoute = /* @__PURE__ */ new Map());
		perRoute.set(candidate.modelId, candidate.efforts);
	}
	const ops = [];
	for (const [route, declarations] of modelsByRoute) {
		const profile = userProviders[route];
		const nextModels = (isPlainObject(profile) && Array.isArray(profile.models) ? profile.models : []).map((entry, index) => {
			const efforts = declarations.get(index);
			return efforts !== void 0 && isPlainObject(entry) ? {
				...entry,
				reasoningEfforts: detachEfforts(efforts)
			} : entry;
		});
		ops.push({
			op: "set",
			path: [
				"providers",
				route,
				"models"
			],
			value: nextModels
		});
	}
	for (const [route, declarations] of overridesByRoute) for (const [modelId, efforts] of declarations) ops.push({
		op: "set",
		path: [
			"providers",
			route,
			"modelOverrides",
			modelId,
			"reasoningEfforts"
		],
		value: detachEfforts(efforts)
	});
	return ops;
}
//#endregion
//#region src/index.ts
const name = "dsh-reasoning-efforts";
const inject = [
	"settings",
	"llm",
	"timer"
];
/** The settings namespace llm-pi-ai's provider profiles live in. */
const NS = settingsNamespace("llm-pi-ai");
/** Startup retries while the namespace has not registered yet. */
const STARTUP_ATTEMPTS = 10;
const STARTUP_INTERVAL_MS = 1e3;
/** Whether one error is a settings revision conflict (a concurrent write won). */
function isConflictError(error) {
	return error instanceof Error && error.code === "SETTINGS_CONFLICT";
}
function apply(ctx, rawConfig) {
	const config = validateConfig(rawConfig);
	if (config.rules.length === 0) return;
	let warnedReadonly = false;
	let tail = Promise.resolve();
	/** Gate 3: does the live adapter already offer efforts for this route/model? */
	const offersEfforts = async (candidate) => {
		try {
			const info = await ctx.llm.resolveModelInfo(candidate.route, candidate.modelId);
			return info.reasoning !== void 0 && info.reasoning.efforts.length > 0;
		} catch {
			return false;
		}
	};
	/**
	* One fill pass. Reads the raw user layer (never the schema-resolved view:
	* persisting materialized defaults would bake them into settings.yaml),
	* drops candidates whose route already offers efforts, and writes the rest.
	* @returns whether the namespace was absent (the caller may retry).
	*/
	const fillOnce = async () => {
		const settings = ctx.settings;
		if (settings.writable !== true) {
			if (!warnedReadonly) {
				warnedReadonly = true;
				ctx.logger.warn("dsh-reasoning-efforts: settings provider is read-only; effort declarations skipped");
			}
			return false;
		}
		const descriptor = settings.describe().find((entry) => entry.ns === NS);
		if (descriptor === void 0) return true;
		const rawUser = descriptor.user;
		const providers = isPlainObject(rawUser) && isPlainObject(rawUser.providers) ? rawUser.providers : void 0;
		if (providers === void 0) return false;
		const candidates = collectCandidates(providers, config.rules);
		if (candidates.length === 0) return false;
		const kept = [];
		for (const candidate of candidates) {
			if (await offersEfforts(candidate)) continue;
			kept.push(candidate);
		}
		if (kept.length === 0) return false;
		const ops = buildFillOps(kept, providers);
		try {
			await settings.mutate(NS, ops, descriptor.revision);
		} catch (error) {
			if (isConflictError(error)) {
				ctx.logger.debug("dsh-reasoning-efforts: a concurrent settings write won the revision race; the next settings/updated re-runs the fill");
				return false;
			}
			throw error;
		}
		ctx.logger.info("dsh-reasoning-efforts: declared reasoning efforts for %d model(s): %s", kept.length, kept.map((candidate) => `${candidate.route}/${candidate.modelId}`).join(", "));
		return false;
	};
	/** Chain one fill onto this fiber's serialized tail. */
	const enqueueFill = () => {
		tail = tail.then(() => fillOnce()).catch((error) => {
			ctx.logger.error("dsh-reasoning-efforts: fill failed: %s", error instanceof Error ? error.stack ?? error.message : String(error));
		});
	};
	let attempts = 0;
	const attempt = () => {
		attempts += 1;
		tail = tail.then(() => fillOnce()).then((absent) => {
			if (absent && attempts < STARTUP_ATTEMPTS) ctx.timeout(attempt, STARTUP_INTERVAL_MS);
		}).catch((error) => {
			ctx.logger.error("dsh-reasoning-efforts: startup fill failed: %s", error instanceof Error ? error.message : String(error));
			if (attempts < STARTUP_ATTEMPTS) ctx.timeout(attempt, STARTUP_INTERVAL_MS);
		});
	};
	ctx.timeout(attempt, 0);
	ctx.on("settings/updated", (ns) => {
		if (ns === NS) enqueueFill();
	});
}
//#endregion
export { apply, inject, name };
