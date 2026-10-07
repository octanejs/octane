import { useContext, useState } from 'octane';
import 'octane/signals';
import { Button, Icon, IconButton, Tooltip } from './primitives.tsrx';
import { draft$, StringsContext } from './state';

type Style = Record<string, string> | undefined;

const TOOLS = ['attach', 'image', 'search', 'research', 'canvas', 'voice'];

function ToolChip(props: { tool: string; style?: Style }) @{
	const [active, setActive] = useState(false);
	@if (!active) {
		<Tooltip label={props.tool}>
			<Button
				icon={'tool-' + props.tool}
				variant="chip"
				style={props.style}
				onClick={() => setActive(true)}
			/>
		</Tooltip>
	} @else {
		<Button
			icon={'tool-' + props.tool}
			label={props.tool}
			variant="chip-active"
			style={props.style}
			onClick={() => setActive(false)}
		/>
	}
}

function ToolbarGroup(props: { index: number }) @{
	<div class="toolbar-group" data-group={String(props.index)}>
		<ToolChip tool={TOOLS[0]} />
		<ToolChip tool={TOOLS[1]} />
		<ToolChip tool={TOOLS[2]} />
		<ToolChip tool={TOOLS[3]} />
		<ToolChip tool={TOOLS[4]} />
		<ToolChip tool={TOOLS[5]} />
	</div>
}

function SendControl() @{
	const strings = useContext(StringsContext);
	<div class="composer-send">
		@if (draft$.get() === '') {
			<IconButton icon="voice" label="Dictate" />
		} @else {
			<Button icon="send" ariaLabel={strings.send} variant="send" />
		}
	</div>
}

export function Composer(props: { toolbarGroups: number; liveSections: boolean }) @{
	const strings = useContext(StringsContext);
	const groups = Array.from({ length: props.toolbarGroups }, (_, index) => index);
	const empty = props.liveSections ? draft$.get() === '' : true;
	<form
		class="composer"
		data-empty={empty ? 'true' : 'false'}
		onSubmit={(event: SubmitEvent) => event.preventDefault()}
	>
		<div class="composer-input">
			<textarea
				name="prompt"
				placeholder="Ask anything"
				defaultValue=""
				onInput={(event: InputEvent) => draft$.set((event.target as HTMLTextAreaElement).value)}
			/>
		</div>
		<div class="composer-toolbar">
			<IconButton icon="plus" label={strings.attach} />
			@for (const group of groups; key group) {
				<ToolbarGroup index={group} />
			}
			<SendControl />
		</div>
	</form>
}

export function Suggestions(props: {
	items: Array<{ id: string; icon: string; title: string; detail: string }>;
}) @{
	<ul class="suggestions">
		@for (const item of props.items; key item.id) {
			<li class="suggestion">
				<Button variant="suggestion">
					<Icon name={item.icon} size={18} />
					<span class="suggestion-title">{item.title}</span>
					<span class="suggestion-detail">{item.detail}</span>
				</Button>
			</li>
		}
	</ul>
}
