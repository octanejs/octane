export interface Message {
	id: number;
	title: string;
}

export function MessageRow(props: {
	message: Message;
	selected: boolean;
	onSelect: (id: number) => void;
	onDelete: (id: number) => void;
}) @{
	<li data-message-id={props.message.id} tabIndex={0}>
		<span>
			{props.message.title as string}
		</span>
		<button aria-label={'Delete ' + props.message.title}>Delete</button>
	</li>
}

export function App() @{
	<main>
		<h1>Inbox</h1>
		<p role="status">No message selected</p>
		<ul>
			<li>Not implemented</li>
		</ul>
	</main>
}
