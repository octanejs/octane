import { useInvoke, useInvokeState, useTauriEvent } from '@octanejs/tauri';

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

function HeaderedGreeting(props: { token: string }) @{
	const greeting = useInvoke<string>('greet', undefined, {
		headers: { Authorization: props.token },
	});
	<span id="greeting">{greeting as string}</span>
}

export function HeaderedGreetingApp(props: { token: string }) @{
	@try {
		<HeaderedGreeting token={props.token} />
	} @pending {
		<span id="fallback">loading</span>
	}
}

export function HeaderedCommandState(props: { token: string }) @{
	const result = useInvokeState<string>('greet', undefined, {
		headers: { Authorization: props.token },
	});
	<div>
		<span id="status">{result.status as string}</span>
		<span id="data">{(result.data ?? '') as string}</span>
	</div>
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

export function BareEventReader(props: { event: string; onTick: (value: string) => void }) @{
	useTauriEvent<string>(props.event, (received) => props.onTick(received.payload));
	<span id="reader">ready</span>
}

export function ReportingEventReader(props: {
	event: string;
	enabled?: boolean;
	onTick: (value: string) => void;
	onFailure: (error: unknown) => void;
}) @{
	useTauriEvent<string>(props.event, (received) => props.onTick(received.payload), {
		enabled: props.enabled ?? true,
		onError: props.onFailure,
	});
	<span id="reader">ready</span>
}

export function EventReader(props: {
	event: string;
	nonce?: number;
	enabled?: boolean;
	onTick: (value: string) => void;
}) @{
	useTauriEvent<string>(props.event, (received) => props.onTick(received.payload), {
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
