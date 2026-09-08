import type {
	BoxRenderable,
	PluginContext,
	RootRenderable,
	SelectOption,
	SlotMode,
	SlotRegistry,
} from '@opentui/core';
import type { UniversalRenderable } from 'octane/universal';
import { useState } from 'octane';
import {
	createPortal,
	Slot,
	useKeyboard,
	useRenderer,
	useTerminalDimensions,
} from '@octanejs/opentui';

interface CounterAppProps {
	label: string;
	onKey: (count: number) => void;
	rootRef: (value: BoxRenderable | null) => void;
}

export function CounterApp(props: CounterAppProps) @{
	const [count, setCount] = useState(0);
	const dimensions = useTerminalDimensions();
	const renderer = useRenderer();
	useKeyboard((event) => {
		if (event.name !== 'return') return;
		setCount((value) => value + 1);
		props.onKey(count + 1);
	});
	<box id="counter-root" ref={props.rootRef} style={{ flexDirection: 'column' }}>
		<text>{props.label + ': ' + count}</text>
		<text>{'Size: ' + dimensions.width + 'x' + dimensions.height}</text>
		<text>{'Renderer: ' + renderer.width}</text>
	</box>
}

interface SelectAppProps {
	options: SelectOption[];
	onChange: (index: number, value: unknown) => void;
	onSelect: (index: number, value: unknown) => void;
}

export function SelectApp(props: SelectAppProps) @{
	<select
		focused
		options={props.options}
		onChange={(index, option) => props.onChange(index, option?.value)}
		onSelect={(index, option) => props.onSelect(index, option?.value)}
	/>
}

interface PortalAppProps {
	target: RootRenderable;
}

export function PortalApp(props: PortalAppProps) @{
	<>
		<text id="main-text">Main</text>
		{createPortal(<text id="portal-text">Portal</text>, props.target)}
	</>
}

export function BrokenApp() @{
	throw new Error('terminal exploded');
	<text>unreachable</text>
}

export type StatusSlots = { statusbar: { user: string } };

interface SlotAppProps {
	registry: SlotRegistry<UniversalRenderable, StatusSlots, PluginContext>;
	mode?: SlotMode;
}

export function SlotApp(props: SlotAppProps) @{
	<Slot registry={props.registry} name="statusbar" mode={props.mode} user="sam">
		<text id="fallback-status-text">fallback:sam</text>
	</Slot>
}

export function PluginStatus(props: { id: string; label: string }) @{
	<text id={props.id}>{props.label}</text>
}
