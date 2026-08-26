import {
	createSlotRegistry,
	type CliRenderer,
	type Plugin,
	type PluginContext,
	type PluginErrorEvent,
	type ResolvedSlotRenderer,
	type SlotMode,
	type SlotRegistry,
	type SlotRegistryOptions,
} from '@opentui/core';
import {
	defineUniversalComponent,
	universalComponent,
	universalKey,
	universalTry,
	useEffect,
	useRef,
	useState,
	type UniversalComponent,
	type UniversalRenderable,
} from 'octane/universal';
import { OPENTUI_RENDERER_ID } from './config.js';

export type { SlotMode };

type SlotMap = Record<string, object>;

export type OctanePlugin<
	TSlots extends SlotMap,
	TContext extends PluginContext = PluginContext,
> = Plugin<UniversalRenderable, TSlots, TContext>;

export type OctaneSlotProps<
	TSlots extends SlotMap,
	K extends keyof TSlots,
	TContext extends PluginContext = PluginContext,
> = {
	registry: SlotRegistry<UniversalRenderable, TSlots, TContext>;
	name: K;
	mode?: SlotMode;
	children?: UniversalRenderable;
	pluginFailurePlaceholder?: (failure: PluginErrorEvent) => UniversalRenderable;
} & TSlots[K];

export type OctaneBoundSlotProps<TSlots extends SlotMap, K extends keyof TSlots> = {
	name: K;
	mode?: SlotMode;
	children?: UniversalRenderable;
} & TSlots[K];

export type OctaneRegistrySlotComponent<
	TSlots extends SlotMap,
	TContext extends PluginContext = PluginContext,
> = UniversalComponent<OctaneSlotProps<TSlots, keyof TSlots, TContext>> & {
	<K extends keyof TSlots>(props: OctaneSlotProps<TSlots, K, TContext>): UniversalRenderable;
};

export type OctaneSlotComponent<TSlots extends SlotMap> = UniversalComponent<
	OctaneBoundSlotProps<TSlots, keyof TSlots>
> & {
	<K extends keyof TSlots>(props: OctaneBoundSlotProps<TSlots, K>): UniversalRenderable;
};

export interface OctaneSlotOptions {
	pluginFailurePlaceholder?: (failure: PluginErrorEvent) => UniversalRenderable;
}

/** Source-compatible type aliases for code migrating from @opentui/react. */
export type ReactPlugin<
	TSlots extends SlotMap,
	TContext extends PluginContext = PluginContext,
> = OctanePlugin<TSlots, TContext>;
export type ReactSlotProps<
	TSlots extends SlotMap,
	K extends keyof TSlots,
	TContext extends PluginContext = PluginContext,
> = OctaneSlotProps<TSlots, K, TContext>;
export type ReactBoundSlotProps<
	TSlots extends SlotMap,
	K extends keyof TSlots,
> = OctaneBoundSlotProps<TSlots, K>;
export type ReactRegistrySlotComponent<
	TSlots extends SlotMap,
	TContext extends PluginContext = PluginContext,
> = OctaneRegistrySlotComponent<TSlots, TContext>;
export type ReactSlotComponent<TSlots extends SlotMap> = OctaneSlotComponent<TSlots>;
export type ReactSlotOptions = OctaneSlotOptions;

export function createOctaneSlotRegistry<
	TSlots extends SlotMap,
	TContext extends PluginContext = PluginContext,
>(
	renderer: CliRenderer,
	context: TContext,
	options: SlotRegistryOptions = {},
): SlotRegistry<UniversalRenderable, TSlots, TContext> {
	return createSlotRegistry<UniversalRenderable, TSlots, TContext>(
		renderer,
		'octane:slot-registry',
		context,
		options,
	);
}

/** Migration alias retained from the upstream package. */
export const createReactSlotRegistry = createOctaneSlotRegistry;

interface PendingRenderReport {
	pluginId: string;
	slot: string;
	error: Error;
}

const SLOT_VERSION = Symbol('opentui.slot.version');
const SLOT_FAILURES = Symbol('opentui.slot.failures');
const SLOT_PENDING_REPORTS = Symbol('opentui.slot.pending-reports');
const SLOT_RESETS = Symbol('opentui.slot.resets');
const SLOT_RESET_VERSION = Symbol('opentui.slot.reset-version');
const SLOT_SUBSCRIPTION = Symbol('opentui.slot.subscription');
const SLOT_REPORT_EFFECT = Symbol('opentui.slot.report-effect');
const SLOT_RESET_EFFECT = Symbol('opentui.slot.reset-effect');

function normalizeError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === 'string' ? error : String(error));
}

function isEmptyRenderable(value: UniversalRenderable): boolean {
	return value === null || value === undefined || value === false;
}

function getSlotProps<
	TSlots extends SlotMap,
	K extends keyof TSlots,
	TContext extends PluginContext,
>(props: OctaneSlotProps<TSlots, K, TContext>): TSlots[K] {
	const {
		children: _children,
		mode: _mode,
		name: _name,
		registry: _registry,
		pluginFailurePlaceholder: _pluginFailurePlaceholder,
		...slotProps
	} = props;
	return slotProps as TSlots[K];
}

function renderPluginFailurePlaceholder(
	registry: SlotRegistry<UniversalRenderable, any, any>,
	placeholder: ((failure: PluginErrorEvent) => UniversalRenderable) | undefined,
	failure: PluginErrorEvent,
): UniversalRenderable {
	if (placeholder === undefined) return null;
	try {
		return placeholder(failure);
	} catch (error) {
		registry.reportPluginError({
			pluginId: failure.pluginId,
			slot: failure.slot,
			phase: 'error_placeholder',
			source: 'octane',
			error,
		});
		return null;
	}
}

const SlotImplementation = defineUniversalComponent<OctaneSlotProps<any, any, any>>(
	OPENTUI_RENDERER_ID,
	(props) => {
		const [version, setVersion] = useState(0, SLOT_VERSION);
		const failures = useRef<Map<string, PluginErrorEvent>>(new Map(), SLOT_FAILURES);
		const pendingReports = useRef<Map<string, PendingRenderReport>>(
			new Map(),
			SLOT_PENDING_REPORTS,
		);
		const resets = useRef<Map<string, () => void>>(new Map(), SLOT_RESETS);
		const resetVersion = useRef(version, SLOT_RESET_VERSION);
		const registry = props.registry;
		const slotName = String(props.name);

		useEffect(
			() => registry.subscribe(() => setVersion((current) => current + 1)),
			[registry],
			SLOT_SUBSCRIPTION,
		);
		useEffect(
			() => {
				if (pendingReports.current.size === 0) return;
				const reports = [...pendingReports.current.values()];
				pendingReports.current.clear();
				for (const report of reports) {
					const failure = registry.reportPluginError({
						pluginId: report.pluginId,
						slot: report.slot,
						phase: 'render',
						source: 'octane',
						error: report.error,
					});
					failures.current.set(`${report.slot}:${report.pluginId}:render`, failure);
				}
			},
			null,
			SLOT_REPORT_EFFECT,
		);
		useEffect(
			() => {
				if (resetVersion.current === version) return;
				resetVersion.current = version;
				const pendingResets = [...resets.current.values()];
				resets.current.clear();
				for (const reset of pendingResets) reset();
			},
			[version],
			SLOT_RESET_EFFECT,
		);

		const entries = registry.resolveEntries(props.name) as Array<
			ResolvedSlotRenderer<UniversalRenderable, object, PluginContext>
		>;
		const slotProps = getSlotProps(props);

		const renderFailure = (
			entry: ResolvedSlotRenderer<UniversalRenderable, object, PluginContext>,
			error: unknown,
			fallback: UniversalRenderable = null,
		): UniversalRenderable => {
			const normalized = normalizeError(error);
			const failureKey = `${slotName}:${entry.id}:render`;
			const previous = failures.current.get(failureKey);
			const sameFailure = previous?.error.message === normalized.message;
			if (!sameFailure) {
				const pending = pendingReports.current.get(failureKey);
				if (pending?.error.message !== normalized.message) {
					pendingReports.current.set(failureKey, {
						pluginId: entry.id,
						slot: slotName,
						error: normalized,
					});
				}
			}
			const failure =
				sameFailure && previous !== undefined
					? previous
					: {
							pluginId: entry.id,
							slot: slotName,
							phase: 'render' as const,
							source: 'octane',
							error: normalized,
							timestamp: Date.now(),
						};
			failures.current.set(failureKey, failure);
			const placeholder = renderPluginFailurePlaceholder(
				registry,
				props.pluginFailurePlaceholder,
				failure,
			);
			return isEmptyRenderable(placeholder) ? fallback : placeholder;
		};

		const renderEntry = (
			entry: ResolvedSlotRenderer<UniversalRenderable, object, PluginContext>,
			fallback: UniversalRenderable = null,
		): UniversalRenderable => {
			const failureKey = `${slotName}:${entry.id}:render`;
			let rendered: UniversalRenderable;
			try {
				rendered = entry.renderer(registry.context, slotProps);
			} catch (error) {
				const failed = renderFailure(entry, error, fallback);
				return isEmptyRenderable(failed) ? failed : universalKey(`${slotName}:${entry.id}`, failed);
			}
			if (isEmptyRenderable(rendered)) return fallback;
			return universalKey(
				`${slotName}:${entry.id}`,
				universalTry(
					() => {
						resets.current.delete(failureKey);
						failures.current.delete(failureKey);
						pendingReports.current.delete(failureKey);
						return rendered;
					},
					null,
					(error, reset) => {
						resets.current.set(failureKey, reset);
						return renderFailure(entry, error, fallback);
					},
				),
			);
		};

		if (entries.length === 0) return props.children;
		if (props.mode === 'single_winner') return renderEntry(entries[0], props.children);
		if (props.mode === 'replace') {
			if (entries.length === 1) return renderEntry(entries[0], props.children);
			const rendered = entries.map((entry) => renderEntry(entry));
			return rendered.some((value) => !isEmptyRenderable(value)) ? rendered : props.children;
		}
		return [props.children, ...entries.map((entry) => renderEntry(entry))];
	},
	{ module: '@octanejs/opentui' },
);

export const Slot = SlotImplementation as OctaneRegistrySlotComponent<any, any>;

export function createSlot<TSlots extends SlotMap, TContext extends PluginContext = PluginContext>(
	registry: SlotRegistry<UniversalRenderable, TSlots, TContext>,
	options: OctaneSlotOptions = {},
): OctaneSlotComponent<TSlots> {
	return defineUniversalComponent<OctaneBoundSlotProps<TSlots, keyof TSlots>>(
		OPENTUI_RENDERER_ID,
		(props) =>
			universalComponent(OPENTUI_RENDERER_ID, SlotImplementation, {
				...props,
				registry,
				pluginFailurePlaceholder: options.pluginFailurePlaceholder,
			}),
		{ module: '@octanejs/opentui' },
	) as OctaneSlotComponent<TSlots>;
}
