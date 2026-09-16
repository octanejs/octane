import { Activity } from 'octane';
import { useSignal$ } from 'octane/signals/client';
import type { CSSProperties, SignalCSSProperties } from 'octane/jsx-runtime';
import { signal$, type SignalHandle } from 'octane/signals';

const globalStyle$ = signal$(4);

function FacadeStyleRow(props: { initial: number }) @{
	const position$ = signal$(props.initial);
	const position = position$;
	<div data-style-row style={{ left: position, '--position': position }}>
		<button onClick={() => position$.set((value) => value + 1)}>{'move row'}</button>
	</div>
}

export function FacadeStyleOwners() @{
	const position = globalStyle$;
	<section>
		<div data-style-global style={{ left: position }}>
			<button onClick={() => globalStyle$.set((value) => value + 1)}>{'move global'}</button>
		</div>
		<FacadeStyleRow initial={1} />
		<FacadeStyleRow initial={10} />
	</section>
}

export function LocalStyles(props: { style?: CSSProperties }) @{
	const left$ = useSignal$(1);
	const right$ = useSignal$(2);
	<section>
		<button
			onClick={() => {
				left$.set(10);
				right$.set(20);
			}}
		>{'move'}</button>
		<div style={{ ...props.style, left: left$, right: right$ }} />
	</section>
}

export function SignalStyles(props: {
	left$: SignalHandle<number | null>;
	style?: CSSProperties;
}) @{
	<div style={{ ...props.style, left: props.left$ }}>
		<span>{'keep'}</span>
	</div>
}

export function ReturnedSignalStyles(props: { left$: SignalHandle<number | null> }) {
	return <div style={{ left: props.left$ }} />;
}

export function ConditionalSignalStyles(props: {
	left$: SignalHandle<number | null>;
	useRight?: boolean;
}) @{
	<div style={props.useRight ? { right: props.left$ } : { left: props.left$ }} />
}

export function SpreadSignalStyles(props: {
	left$: SignalHandle<number | null>;
	override?: boolean;
}) @{
	<div style={{ left: props.left$ }} {...(props.override ? { style: { left: 42 } } : {})} />
}

export function WholeSignalStyle(props: { style$: SignalHandle<CSSProperties | string | null> }) @{
	<div style={props.style$}>
		<span>{'survivor'}</span>
	</div>
}

export function HiddenStyles(props: {
	left$: SignalHandle<number | null>;
	hidden: boolean;
}) @{
	<Activity mode={props.hidden ? 'hidden' : 'visible'}>
		<SignalStyles left$={props.left$} />
	</Activity>
}

export function CssValueStyles(props: {
	opacity$: SignalHandle<number>;
	color$: SignalHandle<string | null>;
}) @{
	<svg style={{ opacity: props.opacity$, color: props.color$, '--tint': props.color$ }} />
}

export function GuardedStyles(props: { left$: SignalHandle<number | null> }) @{
	<section>
		@try {
			<SignalStyles left$={props.left$} />
		} @pending {
			<p>{'waiting'}</p>
		} @catch (_error) {
			<p>{'failed'}</p>
		}
	</section>
}

export function InlineGuardedStyles(props: { left$: SignalHandle<number | null> }) @{
	@try {
		<div style={{ left: props.left$ }} />
	} @pending {
		<p>{'waiting'}</p>
	}
}

export function InlineGuardedStylePair(props: {
	left$: SignalHandle<number | null>;
	right$: SignalHandle<number | null>;
}) @{
	@try {
		<section>
			<div style={{ left: props.left$ }} />
			<div style={{ left: props.right$ }} />
			<SignalStyles left$={props.left$} />
		</section>
	} @pending {
		<p>{'waiting'}</p>
	}
}

export function GuardedStylePair(props: {
	left$: SignalHandle<number | null>;
	right$: SignalHandle<number | null>;
}) @{
	@try {
		<section>
			<SignalStyles left$={props.left$} />
			<SignalStyles left$={props.right$} />
		</section>
	} @pending {
		<p>{'waiting'}</p>
	}
}

function SpreadOnlyStyles(props: { attributes: { style: SignalCSSProperties } }) @{
	<div {...props.attributes} />
}

export function GuardedSpreadStylePair(props: {
	leftStyle: SignalCSSProperties;
	rightStyle: SignalCSSProperties;
}) @{
	@try {
		<section>
			<SpreadOnlyStyles attributes={{ style: props.leftStyle }} />
			<SpreadOnlyStyles attributes={{ style: props.rightStyle }} />
		</section>
	} @pending {
		<p>{'waiting'}</p>
	}
}

function MaybeError(props: { fail: boolean }) @{
	if (props.fail) throw new Error('discard styles');
	<p>{'ready'}</p>
}

export function AbortableStyles(props: { left$: SignalHandle<number | null>; fail: boolean }) @{
	<section>
		<SignalStyles left$={props.left$} />
		<MaybeError fail={props.fail} />
	</section>
}
