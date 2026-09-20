import { Activity, useEffect, useLayoutEffect, useState, type ComponentBody } from 'octane';

interface LabelProps {
	text: string;
}

export function NativeLabel(props: LabelProps) @{
	<span>{props.text as string}</span>
}

export function ConditionalLabel(props: LabelProps & { alternate: boolean }) @{
	<>
		@if (props.alternate) {
			<strong>{props.text as string}</strong>
		} @else {
			<span>{props.text as string}</span>
		}
	</>
}

export function SelectedLabel(props: LabelProps & { alternate: boolean }) @{
	<>
		@switch (props.alternate) {
			@case true: {
				<strong>{props.text as string}</strong>
			}
			@default: {
				<span>{props.text as string}</span>
			}
		}
	</>
}

export function MappedLabels(props: { rows: { id: number; text: string }[] }) @{
	<>
		{props.rows.map((row) => <span key={row.id} data-row={row.id}>{row.text as string}</span>)}
	</>
}

export function VisibleLabel(props: LabelProps) @{
	<Activity mode="visible">
		<span>{props.text as string}</span>
	</Activity>
}

interface LifetimeProps {
	text: string;
	mode: 'visible' | 'hidden';
	alternate: boolean;
	log: (entry: string) => void;
	onRef: (node: HTMLButtonElement | null) => void;
	onPick: (value: string) => void;
	read?: () => string;
}

function LifetimeCounter(props: LifetimeProps & { role: string }) @{
	const [count, setCount] = useState(0);
	props.log('render ' + props.role);
	useLayoutEffect(() => {
		props.log('layout mount ' + props.role);
		return () => props.log('layout cleanup ' + props.role);
	}, [props.log]);
	useEffect(() => {
		props.log('passive mount ' + props.role);
		return () => props.log('passive cleanup ' + props.role);
	}, [props.log]);
	<button
		class="lifetime-counter"
		ref={props.onRef}
		onClick={() => {
			setCount(count + 1);
			props.onPick(props.role + ':' + props.text);
		}}
	>
		{props.role + ':' + props.text + ':' + count}
	</button>
}

export function ReturnedLifetime(props: LifetimeProps) @{
	<LifetimeCounter {...props} role="returned" />
}

export function ActivityLifetime(props: LifetimeProps) @{
	<Activity mode={props.mode}>
		<LifetimeCounter {...props} role="activity" />
	</Activity>
}

export function ConditionalLifetime(props: LifetimeProps) @{
	<>
		@if (props.alternate) {
			<LifetimeCounter {...props} role="second" />
		} @else {
			<LifetimeCounter {...props} role="first" />
		}
	</>
}

export function SelectedLifetime(props: LifetimeProps) @{
	<>
		@switch (props.alternate) {
			@case true: {
				<LifetimeCounter {...props} role="second" />
			}
			@default: {
				<LifetimeCounter {...props} role="first" />
			}
		}
	</>
}

export function NestedLifetime(props: LifetimeProps) @{
	<>
		@if (props.mode === 'visible') {
			@if (props.alternate) {
				<strong class="nested-output">{props.text as string}</strong>
			} @else {
				<span class="nested-output">{props.text as string}</span>
			}
		}
	</>
}

function FollowingRead(props: Pick<LifetimeProps, 'read'>) {
	return props.read?.() ?? 'following';
}

export function LifetimeOwner(props: LifetimeProps & { Lazy: ComponentBody<LifetimeProps> }) @{
	const [count, setCount] = useState(0);
	<section>
		<p class="parent-count">{count as number}</p>
		<props.Lazy
			text={props.text}
			mode={props.mode}
			alternate={props.alternate}
			log={props.log}
			onRef={props.onRef}
			onPick={(value: string) => {
				setCount((previous) => previous + 1);
				props.onPick(value);
			}}
		/>
		<button class="following" onClick={() => setCount((previous) => previous + 1)}>
			<FollowingRead read={props.read} />
		</button>
	</section>
}
