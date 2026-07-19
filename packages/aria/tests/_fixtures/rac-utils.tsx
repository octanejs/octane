import { createContext, useState } from 'octane';
import {
	DEFAULT_SLOT,
	Provider,
	useContextProps,
	useRenderProps,
	useSlottedContext,
} from '../../src/components/utils';
import { Text, TextContext } from '../../src/components/Text';
import { Keyboard } from '../../src/components/Keyboard';

// ---------------------------------------------------------------------------
// Provider supplies multiple contexts at once.
// ---------------------------------------------------------------------------

const ACtx = createContext<any>(null);
const BCtx = createContext<any>(null);

function ABConsumer() {
	const a = useSlottedContext(ACtx);
	const b = useSlottedContext(BCtx);
	return <div data-testid="ab">{String(a?.msg) + ':' + String(b?.msg)}</div>;
}

export function MultiProvider() {
	return (
		<Provider
			values={
				[
					[ACtx, { msg: 'alpha' }],
					[BCtx, { msg: 'beta' }],
				] as any
			}
		>
			<ABConsumer />
		</Provider>
	);
}

// ---------------------------------------------------------------------------
// Slotted context routing: slot prop selects the slots entry; no slot falls
// back to DEFAULT_SLOT; slot={null} opts out of context entirely.
// ---------------------------------------------------------------------------

const SlottedCtx = createContext<any>(null);

function SlotConsumer(props: { testid: string; slot?: string | null }) {
	const value = useSlottedContext(SlottedCtx, props.slot);
	return (
		<span data-testid={props.testid} data-kind={value ? (value.kind as string) : 'none'}>
			{value ? (value.text as string) : 'none'}
		</span>
	);
}

const slottedValue = {
	slots: {
		[DEFAULT_SLOT]: { kind: 'default', text: 'default-text' },
		label: { kind: 'label', text: 'label-text' },
		description: { kind: 'description', text: 'description-text' },
	},
};

export function SlotRouting() {
	return (
		<Provider values={[[SlottedCtx, slottedValue]] as any}>
			<SlotConsumer testid="no-slot" />
			<SlotConsumer testid="label" slot="label" />
			<SlotConsumer testid="description" slot="description" />
			<SlotConsumer testid="opt-out" slot={null} />
		</Provider>
	);
}

const slotsWithoutDefault = {
	slots: {
		label: { kind: 'label', text: 'label-text' },
		description: { kind: 'description', text: 'description-text' },
	},
};

// Unknown slot name → throws with the valid slot names.
export function UnknownSlot() {
	return (
		<Provider values={[[SlottedCtx, slotsWithoutDefault]] as any}>
			<SlotConsumer testid="bad" slot="nope" />
		</Provider>
	);
}

// No slot prop and no DEFAULT_SLOT entry → a slot prop is required.
export function MissingRequiredSlot() {
	return (
		<Provider values={[[SlottedCtx, slotsWithoutDefault]] as any}>
			<SlotConsumer testid="bad" />
		</Provider>
	);
}

// ---------------------------------------------------------------------------
// useContextProps: context props merge with local props (handlers chain,
// className composes, style objects merge, local scalars win) and BOTH the
// context ref and the local ref receive the element.
// ---------------------------------------------------------------------------

const FieldContext = createContext<any>({});

function Field(props: any) {
	let ref = props.ref;
	[props, ref] = useContextProps(props, ref, FieldContext);
	return <output {...props} ref={ref} />;
}

export function ContextPropsMerge() {
	const [ctxTag, setCtxTag] = useState('');
	const [localTag, setLocalTag] = useState('');
	const ctxValue = {
		'data-from-ctx': 'yes',
		title: 'ctx-title',
		className: 'ctx-cls',
		style: { color: 'rgb(0, 0, 255)', fontStyle: 'italic' },
		ref: (el: HTMLElement | null) => {
			if (el) setCtxTag(el.tagName.toLowerCase());
		},
	};
	return (
		<div data-testid="wrap" data-ctx={ctxTag} data-local={localTag}>
			<Provider values={[[FieldContext, ctxValue]] as any}>
				<Field
					title="local-title"
					className="local-cls"
					style={{ fontWeight: 'bold', color: 'rgb(255, 0, 0)' }}
					ref={(el: HTMLElement | null) => {
						if (el) setLocalTag(el.tagName.toLowerCase());
					}}
				>
					field
				</Field>
			</Provider>
		</div>
	);
}

// An explicit slot={null} makes local props completely override context props.
export function ContextPropsOptOut() {
	const ctxValue = { title: 'ctx-title', 'data-from-ctx': 'yes' };
	return (
		<Provider values={[[FieldContext, ctxValue]] as any}>
			<Field slot={null} title="local-title">
				field
			</Field>
		</Provider>
	);
}

// ---------------------------------------------------------------------------
// useRenderProps: className/style/children accept functions receiving values +
// defaults; static className replaces the default; data-rac lands in the DOM.
// ---------------------------------------------------------------------------

function StyledBox(props: any) {
	const { children, ...renderProps } = useRenderProps({
		...props,
		values: { isSelected: !!props.isSelected },
		defaultClassName: 'react-aria-Box',
		defaultStyle: { fontStyle: 'italic' },
		defaultChildren: 'default-children',
	}) as any;
	return (
		<div data-testid={props.testid} {...renderProps}>
			{children}
		</div>
	);
}

export function RenderPropsFunctions() {
	return (
		<div>
			<StyledBox
				testid="fn"
				isSelected
				className={(v: any) => v.defaultClassName + (v.isSelected ? ' selected' : '')}
				style={(v: any) => ({ ...v.defaultStyle, color: 'rgb(255, 0, 0)' })}
				children={(v: any) => (v.isSelected ? 'on:' : 'off:') + String(v.defaultChildren)}
			/>
			<StyledBox
				testid="static"
				className="custom"
				style={{ color: 'rgb(0, 128, 0)' }}
				children="static-children"
			/>
			<StyledBox testid="defaults" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Text / Keyboard: slotted primitives. TextContext routes id/className by the
// slot prop; Keyboard renders a <kbd dir="ltr">.
// ---------------------------------------------------------------------------

const textSlots = {
	slots: {
		label: { id: 'label-id', className: 'label-cls' },
		description: { id: 'description-id' },
	},
};

export function TextSlots() {
	// NOTE: tsrx preserves authored JSX text verbatim (no React-style whitespace
	// collapsing), so text children stay inline.
	return (
		<Provider values={[[TextContext, textSlots]] as any}>
			<Text slot="label" data-testid="t-label" children="Name" />
			<Text slot="description" elementType="p" data-testid="t-desc" children="More info" />
		</Provider>
	);
}

export function KeyboardPlain() {
	return <Keyboard data-testid="kbd">⌘K</Keyboard>;
}

// The custom render override receives the merged DOM props (incl. the merged
// ref) and renders the expected element type itself.
export function TextRenderOverride() {
	return (
		<Text
			data-testid="t-render"
			render={(p: any) => (
				<span {...p} data-rendered="custom">
					rendered
				</span>
			)}
		/>
	);
}
