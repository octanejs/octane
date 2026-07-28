import { Activity, memo, use, useState, useEffect } from 'octane';
import { useRepeatedSharedEffects } from './conditional-effect-helpers';

// React-style guarded component: `if (cond) return;` early-exit followed by
// hooks. octane supports runtime-conditional hooks (each call site has
// its own stable slot identity via Symbol.for, so hooks remain referenceable
// even when the body short-circuits). The effect should fire when the guard
// opens AND its deps change — and NOT fire while the guard is closed.
export function Guarded(props) @{
	const [n, setN] = useState(props.initialN ?? 0);
	if (props.hide) return;
	useEffect(() => {
		props.log.push('mount:' + n);
		return () => props.log.push('cleanup:' + n);
	}, [n]);
	<button id="bump" onClick={() => setN(n + 1)}>{n as string}</button>
}

// Same shape but with the hook order interleaved with intermediate logic.
// Exercises the per-call-site slot stability when a render is short-circuited
// after a few hooks have run.
export function PartialGuard(props) @{
	const [n, setN] = useState(0);
	const [m, setM] = useState(0);
	if (props.hide) return;
	useEffect(() => {
		props.log.push('seen:' + n + ':' + m);
	}, [n, m]);
	<>
		<button id="bumpN" onClick={() => setN(n + 1)}>{'n=' + n as string}</button>
		<button id="bumpM" onClick={() => setM(m + 1)}>{'m=' + m as string}</button>
	</>
}

// A plain JavaScript conditional does not create an @if-owned child scope.
// The effect still disconnects when its call site is not reached by a completed
// render, while the component's stable output keeps updating in place.
export function ConditionalTsrxEffect(props: {
	enabled: boolean;
	label: string;
	log: string[];
}) @{
	if (props.enabled) {
		useEffect(() => {
			props.log.push('create:' + props.label);
			return () => props.log.push('cleanup:' + props.label);
		}, [props.label, props.log]);
	}
	<div class="conditional-tsrx">{props.label}</div>
}

export function ConditionalRepeatedEffects(props: { enabled: boolean; log: string[] }) @{
	if (props.enabled) {
		useRepeatedSharedEffects(props.log);
	}
	<div class="conditional-repeated">
		{props.enabled ? 'enabled' : 'disabled'}
	</div>
}

function ConditionalSuspendingEffect(props: {
	enabled: boolean;
	log: string[];
	promise: PromiseLike<string>;
}) @{
	if (props.enabled) {
		useEffect(() => {
			props.log.push('suspense:create');
			return () => props.log.push('suspense:cleanup');
		}, [props.log]);
	}
	const value = use(props.promise);
	<span class="conditional-suspense-value">{value}</span>
}

export function ConditionalSuspenseEffect(props: {
	enabled: boolean;
	log: string[];
	promise: PromiseLike<string>;
}) @{
	@try {
		<ConditionalSuspendingEffect enabled={props.enabled} log={props.log} promise={props.promise} />
	} @pending {
		<span class="conditional-suspense-pending">{'pending'}</span>
	}
}

function ConditionalActivityChildImpl(props: { enabled: boolean; log: string[] }) @{
	if (props.enabled) {
		useEffect(() => {
			props.log.push('activity:create');
			return () => props.log.push('activity:cleanup');
		}, [props.log]);
	}
	<span class="conditional-activity">
		{props.enabled ? 'enabled' : 'disabled'}
	</span>
}

const ConditionalActivityChild = memo(ConditionalActivityChildImpl);

export function ConditionalActivityEffect(props: {
	enabled: boolean;
	log: string[];
	mode: 'visible' | 'hidden';
}) @{
	<Activity mode={props.mode}>
		<ConditionalActivityChild enabled={props.enabled} log={props.log} />
	</Activity>
}

function ConditionalActivityReentryChildImpl(props: {
	expose: (setEnabled: (enabled: boolean) => void) => void;
	log: string[];
}) @{
	const [enabled, setEnabled] = useState(true);
	props.expose(setEnabled);
	if (enabled) {
		useEffect(() => {
			props.log.push('reentry:create');
			return () => props.log.push('reentry:cleanup');
		}, [props.log]);
	} else {
		// This slot is first reached while Activity is hidden, so no EffectSlot is
		// registered. It must not count as evidence that the earlier slot above
		// was reached by this render.
		useEffect(() => {}, [props.log]);
	}
	<span class="conditional-activity-reentry">
		{enabled ? 'enabled' : 'disabled'}
	</span>
}

const ConditionalActivityReentryChild = memo(ConditionalActivityReentryChildImpl);

export function ConditionalActivityReentryEffect(props: {
	expose: (setEnabled: (enabled: boolean) => void) => void;
	log: string[];
	mode: 'visible' | 'hidden';
}) @{
	<Activity mode={props.mode}>
		<ConditionalActivityReentryChild expose={props.expose} log={props.log} />
	</Activity>
}
