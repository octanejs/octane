import { render } from 'preact';
import { useState } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import { initialConversations, nextReply, segText, userMessage } from './data.js';

// Native Preact streaming-chat fixture. compat is used only for the public
// synchronous flush that keeps network-pump and input work inside the timer.
function ChatApp() {
	const [conversations, setConversations] = useState(initialConversations);
	const [active, setActive] = useState(0);
	const [draft, setDraft] = useState('');
	const [streamingId, setStreamingId] = useState(null);

	const send = () => {
		const text = draft.trim();
		if (text === '') return;
		const reply = nextReply();
		flushSync(() => {
			setConversations((items) =>
				items.map((conversation, index) =>
					index === active
						? {
								...conversation,
								messages: [...conversation.messages, userMessage(text), reply],
							}
						: conversation,
				),
			);
			setStreamingId(reply.id);
			setDraft('');
		});
	};

	window.__pump = (count) => {
		if (streamingId === null) return 0;
		const message = conversations[active].messages.find((item) => item.id === streamingId);
		if (message === undefined) return 0;
		const done = Math.min(message.total, message.done + count);
		flushSync(() => {
			setConversations((items) =>
				items.map((conversation, index) =>
					index === active
						? {
								...conversation,
								messages: conversation.messages.map((item) =>
									item.id === streamingId ? { ...item, done } : item,
								),
							}
						: conversation,
				),
			);
			if (done === message.total) setStreamingId(null);
		});
		return message.total - done;
	};
	window.__reset = () =>
		flushSync(() => {
			setConversations(initialConversations());
			setActive(0);
			setDraft('');
			setStreamingId(null);
		});

	const conversation = conversations[active];
	return (
		<div class="chatapp">
			<header class="topbar">
				<h1>chat</h1>
				<nav class="tabs">
					{conversations.map((item) => (
						<button
							key={item.id}
							class={'conv-tab' + (item.id === active ? ' active' : '')}
							data-conv={String(item.id)}
							onClick={() => flushSync(() => setActive(item.id))}
						>
							{item.title}
						</button>
					))}
				</nav>
			</header>
			<main class="messages">
				{conversation.messages.map((message) => (
					<div
						key={message.id}
						class={'message ' + message.role + (message.id === streamingId ? ' streaming' : '')}
					>
						<div class="bubble">
							{message.segments.map((segment) =>
								segment.type === 'code' ? (
									<pre key={segment.id} class="code">
										<code>{segText(segment, message.done)}</code>
									</pre>
								) : (
									<p key={segment.id} class="text">
										{segText(segment, message.done)}
									</p>
								),
							)}
						</div>
					</div>
				))}
			</main>
			<footer class="composer">
				<input
					class="prompt"
					placeholder="Message…"
					value={draft}
					onInput={(event) => flushSync(() => setDraft(event.currentTarget.value))}
					onKeyDown={(event) => {
						if (event.key === 'Enter') send();
					}}
				/>
				<button class="send" onClick={send}>
					Send
				</button>
			</footer>
		</div>
	);
}

render(<ChatApp />, document.getElementById('main'));
