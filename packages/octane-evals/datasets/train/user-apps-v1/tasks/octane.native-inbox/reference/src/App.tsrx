import { useState } from 'octane';

export interface Message {
	id: number;
	title: string;
}

const initialMessages: Message[] = [
	{ id: 1, title: 'Release notes' },
	{ id: 2, title: 'Deploy report' },
];

export function MessageRow(props: {
	message: Message;
	selected: boolean;
	onSelect: (id: number) => void;
	onDelete: (id: number) => void;
}) @{
	const select = () => props.onSelect(props.message.id);

	<li
		data-message-id={props.message.id}
		tabIndex={0}
		aria-current={props.selected ? 'true' : undefined}
		class={{ selected: props.selected }}
		onClick={select}
		onKeyDown={(event: KeyboardEvent) => {
			if (event.currentTarget !== event.target) return;
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			select();
		}}
	>
		<span>
			{props.message.title as string}
		</span>
		<button
			aria-label={'Delete ' + props.message.title}
			onClick={(event: MouseEvent) => {
				event.stopPropagation();
				props.onDelete(props.message.id);
			}}
		>
			Delete
		</button>
	</li>
}

export function App() @{
	const [messages, setMessages] = useState(initialMessages);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const selected = messages.find((message) => message.id === selectedId);
	const remove = (id: number) => {
		setMessages((current) => current.filter((message) => message.id !== id));
		setSelectedId((current) => current === id ? null : current);
	};

	<main>
		<h1>Inbox</h1>
		@if (selected) {
			<p role="status">
				{'Selected: ' + selected.title}
			</p>
		} @else {
			<p role="status">No message selected</p>
		}
		<ul>
			@for (const message of messages; key message.id) {
				<MessageRow
					message={message}
					selected={message.id === selectedId}
					onSelect={setSelectedId}
					onDelete={remove}
				/>
			} @empty {
				<li>Inbox empty</li>
			}
		</ul>
	</main>
}
