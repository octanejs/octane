import { createSignal, For, flush } from 'solid-js';
import { render } from '@solidjs/web';
import { initialConversations, nextReply, userMessage, segText } from './data.js';

// Streaming-chat fixture (Solid 2.0) — shared DOM/API contract with the
// sibling apps (see ../../README.md). Fastest-version authoring (the
// js-framework `solid-next` pattern): immutable signal structure for
// conversations/messages (cheap mounts and switches — no proxy graph), with
// ONE PER-MESSAGE `done` SIGNAL driving the streaming path — a pump tick is
// a single signal write that re-renders only the streaming message's segment
// text, instead of rebuilding the message subtree per token.
// Class STRINGS throughout (the 2.0-beta's classList is inert — same finding
// as the TodoMVC column).

function ChatApp() {
	const [convs, setConvs] = createSignal(initialConversations());
	const [active, setActive] = createSignal(0);
	const [draft, setDraft] = createSignal('');
	const [streamingId, setStreamingId] = createSignal(null);

	// The streaming message carries a live `done` signal; settled messages
	// keep their plain `done` field (never changes again).
	const arm = (msg) => {
		const [done, setDone] = createSignal(msg.done);
		msg.doneSig = done;
		msg.setDone = setDone;
		return msg;
	};
	const doneOf = (m) => (m.doneSig !== undefined ? m.doneSig() : m.done);

	const send = () => {
		const text = draft().trim();
		if (text === '') return;
		const reply = arm(nextReply());
		setConvs((cs) =>
			cs.map((c, i) =>
				i === active() ? { ...c, messages: [...c.messages, userMessage(text), reply] } : c,
			),
		);
		setStreamingId(reply.id);
		setDraft('');
		flush();
	};

	window.__pump = (k) => {
		const sid = streamingId();
		if (sid === null) return 0;
		const msg = convs()[active()].messages.find((m) => m.id === sid);
		if (msg === undefined) return 0;
		const done = Math.min(msg.total, msg.doneSig() + k);
		msg.setDone(done);
		msg.done = done; // keep the plain field settled for post-stream reads
		if (done === msg.total) setStreamingId(null);
		flush();
		return msg.total - done;
	};
	window.__reset = () => {
		setConvs(initialConversations());
		setActive(0);
		setDraft('');
		setStreamingId(null);
		flush();
	};

	const conv = () => convs()[active()];

	return (
		<div class="chatapp">
			<header class="topbar">
				<h1>chat</h1>
				<nav class="tabs">
					<For each={convs()}>
						{(c) => (
							<button
								class={'conv-tab' + (c.id === active() ? ' active' : '')}
								data-conv={'' + c.id}
								onClick={() => {
									setActive(c.id);
									flush();
								}}
								textContent={c.title}
							/>
						)}
					</For>
				</nav>
			</header>
			<main class="messages">
				<For each={conv().messages}>
					{(m) => (
						<div class={'message ' + m.role + (m.id === streamingId() ? ' streaming' : '')}>
							<div class="bubble">
								<For each={m.segments}>
									{(s) =>
										// a segment's type never changes: a plain construction-time
										// branch, not a reactive <Show>
										s.type === 'code' ? (
											<pre class="code">
												<code textContent={segText(s, doneOf(m))} />
											</pre>
										) : (
											<p class="text" textContent={segText(s, doneOf(m))} />
										)
									}
								</For>
							</div>
						</div>
					)}
				</For>
			</main>
			<footer class="composer">
				<input
					class="prompt"
					placeholder="Message…"
					value={draft()}
					onInput={(e) => {
						setDraft(e.target.value);
						flush();
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') send();
					}}
				/>
				<button class="send" onClick={send}>
					Send
				</button>
			</footer>
		</div>
	);
}

render(() => <ChatApp />, document.getElementById('main'));
