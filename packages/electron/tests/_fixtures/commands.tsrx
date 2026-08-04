import { useInvoke, useInvokeState, useIpcEvent } from '@octanejs/electron';

function Greeting(props: { name: string }) @{
	const greeting = useInvoke<string>('greet', { name: props.name });
	<span id="greeting">{greeting as string}</span>
}

export function GreetingApp(props: { name: string }) @{
	@try {
		<Greeting name={props.name} />
	} @pending {
		<span id="fallback">loading</span>
	} @catch (error) {
		<span id="caught">{(error as Error).name as string}</span>
	}
}

function BareGreeting() @{
	const greeting = useInvoke<string>('greet');
	<span id="greeting">{greeting as string}</span>
}

export function BareGreetingApp() @{
	@try {
		<BareGreeting />
	} @pending {
		<span id="fallback">loading</span>
	}
}

function DynamicCommand(props: { cmd: string; version: number }) @{
	const value = useInvoke<string>(props.cmd, undefined, { deps: [props.version] });
	<span id="dynamic">{value as string}</span>
}

export function DynamicCommandApp(props: { cmd: string; version: number }) @{
	@try {
		<DynamicCommand cmd={props.cmd} version={props.version} />
	} @pending {
		<span id="fallback">loading</span>
	}
}

export function CommandState(props: { name: string }) @{
	const result = useInvokeState<string>('greet', { name: props.name });
	<div>
		<span id="status">{result.status as string}</span>
		<span id="data">{(result.data ?? '') as string}</span>
		<span id="error">{((result.error as Error | undefined)?.name ?? '') as string}</span>
		<button id="refetch" onClick={() => result.refetch()}>refetch</button>
	</div>
}

export function EventReader(props: {
	event: string;
	nonce?: number;
	enabled?: boolean;
	onTick: (value: string) => void;
}) @{
	useIpcEvent(props.event, (...args) => props.onTick(String(args[0])), {
		enabled: props.enabled ?? true,
	});
	<span id="reader">{String(props.nonce ?? 0)}</span>
}

export function EventBoundary(props: {
	event: string;
	nonce?: number;
	enabled?: boolean;
	onTick: (value: string) => void;
}) @{
	@try {
		<EventReader
			event={props.event}
			nonce={props.nonce}
			enabled={props.enabled}
			onTick={props.onTick}
		/>
	} @catch (error) {
		<span id="caught">{(error as Error).name as string}</span>
	}
}

export function ReportingEventReader(props: {
	event: string;
	enabled?: boolean;
	onTick: (value: string) => void;
	onFailure: (error: unknown) => void;
}) @{
	useIpcEvent(props.event, (...args) => props.onTick(String(args[0])), {
		enabled: props.enabled ?? true,
		onError: props.onFailure,
	});
	<span id="reader">ready</span>
}
