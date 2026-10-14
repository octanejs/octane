'use strong';

import {
	createContext,
	isChildrenBlock,
	useContext,
	useEffect,
	useState,
	type OctaneNode,
} from 'octane';

const Channel = createContext('author');
type Subscribe = (channel: string) => () => void;

function Slot(props: { content: OctaneNode; visible: boolean; channel: string }) @{
	<Channel value={props.channel}>
		<section data-kind={isChildrenBlock(props.content) ? 'body' : 'value'}>
			@if (props.visible) {
				<div data-slot="only">{props.content}</div>
			}
		</section>
	</Channel>
}

export function WrappedRenderValues(props: { label: string; visible: boolean }) @{
	<div>
		<Slot
			visible={props.visible}
			channel="receiver"
			content={
				(
					@{
						<span>{props.label}</span>
					}
				) as OctaneNode
			}
		/>
		<Slot
			visible={props.visible}
			channel="receiver"
			content={
				(
					@{
						<span>{props.label}</span>
					}
				) satisfies OctaneNode
			}
		/>
		<Slot
			visible={props.visible}
			channel="receiver"
			content={
				(
					@{
						<span>{props.label}</span>
					}
				)!
			}
		/>
	</div>
}

export function NamedRenderValue(props: {
	label: string;
	visible: boolean;
	channel: string;
	evaluate: () => void;
	subscribe: Subscribe;
}) @{
	<Slot
		visible={props.visible}
		channel={props.channel}
		content={@{
			const label = props.label;
			const channel = useContext(Channel);
			const [count, setCount] = useState(0);
			props.evaluate();
			useEffect(() => props.subscribe(channel));
			<button onClick={() => setCount(count + 1)}>{`${channel}:${label}:${count}`}</button>
		}}
	/>
}

function RepeatedSlot(props: { content: OctaneNode; second: boolean }) @{
	<div>
		<Channel value="first">
			<section data-slot="first">{props.content}</section>
		</Channel>
		@if (props.second) {
			<Channel value="second">
				<section data-slot="second">{props.content}</section>
			</Channel>
		}
	</div>
}

export function RepeatedRenderValue(props: {
	label: string;
	second: boolean;
	subscribe: Subscribe;
}) @{
	<RepeatedSlot
		second={props.second}
		content={@{
			const channel = useContext(Channel);
			const [count, setCount] = useState(0);
			useEffect(() => props.subscribe(channel));
			<button onClick={() => setCount(count + 1)}>{`${channel}:${props.label}:${count}`}</button>
		}}
	/>
}

export function StatefulLeaf(props: { label: string }) @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{`${props.label}:${count}`}</button>
}

export function AlternateLeaf(props: { label: string }) @{
	const [count, setCount] = useState(0);
	<button class="alternate" onClick={() => setCount(count + 1)}>{`${props.label}:${count}`}</button>
}

export function KeyedRenderValue(props: {
	label: string;
	entryKey: string;
	Component: typeof StatefulLeaf;
}) @{
	<Slot
		visible={true}
		channel="receiver"
		content={@{
			<props.Component key={props.entryKey} label={props.label} />
		}}
	/>
}

function SelectedSlot(props: {
	first: OctaneNode;
	second: OctaneNode;
	useSecond: boolean;
	forward?: (value: OctaneNode) => OctaneNode;
}) @{
	const content = props.useSecond ? props.second : props.first;
	<section>{props.forward ? props.forward(content) : content}</section>
}

export function SelectedRenderValue(props: {
	label: string;
	detail: { label: string } | null;
	useSecond: boolean;
	subscribe?: Subscribe;
	read?: () => string;
	forward?: (value: OctaneNode) => OctaneNode;
}) @{
	<SelectedSlot
		useSecond={props.useSecond}
		forward={props.forward}
		first={@{
			const label = props.label;
			useEffect(() => props.subscribe?.('first'));
			<article>
				<span>{label}</span>
				@if (props.detail !== null) {
					<strong>{props.detail.label}</strong>
				}
			</article>
		}}
		second={@{
			useEffect(() => props.subscribe?.('second'));
			<>
				<span data-second-prefix>prefix</span>
				<aside>
					<PendingLabel label={props.label} read={props.read} />
				</aside>
			</>
		}}
	/>
}

function PendingLabel(props: { label: string; read?: () => string }) @{
	const label = props.read ? props.read() : props.label;
	<input defaultValue={label} />
}

function Contracts(props: {
	content: OctaneNode;
	element: OctaneNode;
	slots: { content: OctaneNode };
	callback: (label: string) => string;
	inspect: (value: unknown) => string;
	clone: (value: OctaneNode) => OctaneNode;
}) @{
	<div>
		<output data-kind="body">{props.inspect(props.content)}</output>
		<output data-kind="element">{props.inspect(props.element)}</output>
		<output data-kind="object">{props.inspect(props.slots.content)}</output>
		<output data-kind="callback">{props.inspect(props.callback)}</output>
		<section data-cloned>{props.clone(props.element)}</section>
		<section data-body>{props.content}</section>
		<section data-callback>{props.callback('payload')}</section>
	</div>
}

export function RenderValueContracts(props: {
	label: string;
	inspect: (value: unknown) => string;
	clone: (value: OctaneNode) => OctaneNode;
}) @{
	<Contracts
		content={@{
			<b>{props.label}</b>
		}}
		element={<span title="original">{props.label}</span>}
		slots={{
			content: (
				@{
					<i>{props.label}</i>
				}
			),
		}}
		callback={(label) => `${props.label}:${label}`}
		inspect={props.inspect}
		clone={props.clone}
	/>
}

export function CaughtReplacement(props: Parameters<typeof SelectedRenderValue>[0]) @{
	@try {
		<SelectedRenderValue {...props} />
	} @catch (error) {
		<output data-caught>{String(error)}</output>
	}
}

function SvgSlot(props: { content: OctaneNode }) @{
	<svg>{props.content}</svg>
}

export function SvgRenderValue(props: { radius: number }) @{
	<SvgSlot
		content={@{
			<circle r={props.radius} />
		}}
	/>
}

export function StyledRenderValue(props: { label: string }) @{
	<div>
		<Slot
			visible={true}
			channel="receiver"
			content={@{
				<>
					<style>
						.render-label {
							color: rgb(41, 52, 63);
						}
					</style>
					<span class="render-label">{props.label}</span>
				</>
			}}
		/>
		<span class="render-label" data-outside>
			outside
		</span>
	</div>
}

export function DescriptorSetupValue(props: { label: string }) @{
	const element = (
		<Slot
			visible={true}
			channel="receiver"
			content={@{
				<b>{props.label}</b>
			}}
		/>
	);
	<main>{element}</main>
}

function PureSlot(props: { content: OctaneNode; visible: boolean }) @{
	<section>
		@if (props.visible) {
			<div>{props.content}</div>
		}
	</section>
}

export function PureRenderValue(props: {
	label: string;
	detail: { label: string } | null;
	visible: boolean;
}) @{
	<PureSlot
		visible={props.visible}
		content={@{
			<article>
				<span>{props.label}</span>
				@if (props.detail !== null) {
					<strong>{props.detail.label}</strong>
				}
			</article>
		}}
	/>
}

export function PureLocalRenderValue(props: { label: string }) @{
	<PureSlot
		visible={true}
		content={@{
			const label = props.label;
			<span>{label}</span>
		}}
	/>
}

export function DynamicHost(props: { tag: 'div'; content: OctaneNode }) @{
	<props.tag children={props.content} />
}

export function PureLeafRenderValue(props: { label: string; visible: boolean }) @{
	<PureSlot
		visible={props.visible}
		content={@{
			<span>{props.label}</span>
		}}
	/>
}

export function PureDeepRenderValue(props: {
	detail: { label: string } | null;
	visible: boolean;
}) @{
	<PureSlot
		visible={props.visible}
		content={@{
			<span>{props.detail!.label}</span>
		}}
	/>
}
