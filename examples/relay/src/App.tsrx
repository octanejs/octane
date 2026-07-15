import {
	createPortal,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import { loadHistory, loadThread, publishMessage, requestTeammateUpdate, subscribe } from './api';
import { CHANNELS, CHANNEL_DETAILS, channelURL, readRoute, threadURL } from './router';
import type {
	Author,
	ChannelId,
	ConnectionState,
	LoadState,
	Message,
	Route,
	ThreadReply,
} from './types';

const CURRENT_USER: Author = { name: 'Avery Stone', initials: 'AS', tone: 'violet' };

interface PrependSnapshot {
	messageId: string;
	top: number;
}

interface PendingHistoryLoad {
	channel: ChannelId;
	generation: number;
	before: string;
}

function compareMessages(left: Message, right: Message): number {
	return left.order - right.order || left.id.localeCompare(right.id);
}

function normalizeMessages(messages: readonly Message[]): Message[] {
	const byId = new Map<string, Message>();
	for (const message of messages) byId.set(message.id, message);
	const confirmedByRequest = new Map<string, Message>();
	for (const message of byId.values()) {
		const requestId = message.clientRequestId;
		if (requestId === undefined || message.delivery !== undefined) continue;
		const confirmed = confirmedByRequest.get(requestId);
		if (confirmed === undefined || compareMessages(confirmed, message) < 0) {
			confirmedByRequest.set(requestId, message);
		}
	}
	return [...byId.values()].filter((message) => {
		const requestId = message.clientRequestId;
		if (requestId === undefined) return true;
		const confirmed = confirmedByRequest.get(requestId);
		return confirmed === undefined || confirmed === message;
	}).sort(compareMessages);
}

function mergeIncoming(messages: readonly Message[], incoming: Message): Message[] {
	return normalizeMessages([
		...messages.filter(
			(message) =>
				message.id !== incoming.id &&
					(incoming.clientRequestId === undefined ||
						message.clientRequestId !== incoming.clientRequestId),
		),
		incoming,
	]);
}

function Avatar({ author, small = false }: { author: Author; small?: boolean }) @{
	<span
		class={['avatar', `avatar--${author.tone}`, small && 'avatar--small']}
		aria-hidden="true"
	>{author.initials}</span>
}

function ConnectionPill({ state }: { state: ConnectionState }) @{
	<div
		class={['connection-pill', `connection-pill--${state}`]}
		role="status"
		aria-label={`Realtime connection: ${state}`}
		aria-live="polite"
	>
		<span class="connection-dot" aria-hidden="true"></span>
		@if (state === 'live') {
			<span>Live</span>
		} @else if (state === 'paused') {
			<span>Updates paused</span>
		} @else if (state === 'reconnecting') {
			<span>Reconnecting…</span>
		} @else {
			<span>Connecting…</span>
		}
	</div>
}

function MessageRow({
	message,
	onOpenThread,
	onReact,
}: {
	message: Message;
	onOpenThread: (messageId: string, trigger: HTMLElement | null) => void;
	onReact: (messageId: string) => void;
}) @{
	<article
		class={['message', message.delivery && `message--${message.delivery}`]}
		aria-label={`Message from ${message.author.name}`}
		data-message-id={message.id}
	>
		<Avatar author={message.author} />
		<div class="message-content">
			<header class="message-meta">
				<strong>{message.author.name}</strong>
				<time>{message.sentAt}</time>
				@if (message.delivery === 'pending') {
					<span class="delivery-state">Sending…</span>
				} @else if (message.delivery === 'failed') {
					<span class="delivery-state delivery-state--failed">Not sent</span>
				}
			</header>
			<p>{message.body}</p>
			<div class="message-actions">
				<button
					type="button"
					class="reaction"
					onClick={() => onReact(message.id)}
					aria-label={`Applaud message from ${message.author.name}`}
				>
					<span aria-hidden="true">✦</span>
					<span>{String(message.reactions)}</span>
				</button>
				@if (message.threadCount > 0) {
					<a
						class="thread-link"
						href={threadURL(message.channel, message.id)}
						onClick={(event: MouseEvent) => {
							event.preventDefault();
							onOpenThread(message.id, event.currentTarget as HTMLElement);
						}}
					>
						{`${message.threadCount} replies`}
						<span aria-hidden="true">→</span>
					</a>
				}
			</div>
		</div>
	</article>
}

function LoadingConversation() @{
	<div
		class="conversation-state conversation-state--loading"
		role="status"
		aria-label="Loading conversation"
	>
		<div class="loading-mark" aria-hidden="true">
			<span></span>
			<span></span>
			<span></span>
		</div>
		<p>Gathering the latest conversation…</p>
	</div>
}

function HistoryFailure({ onRetry }: { onRetry: () => void }) @{
	<div class="conversation-state conversation-state--error" role="alert">
		<div class="state-icon" aria-hidden="true">↻</div>
		<h2>Conversation out of reach</h2>
		<p>The local relay missed this request. Your workspace is still here.</p>
		<button type="button" class="primary-button" onClick={onRetry}>Try again</button>
	</div>
}

function EmptyConversation({ channel }: { channel: ChannelId }) @{
	<div class="conversation-state conversation-state--empty">
		<div class="state-icon" aria-hidden="true">#</div>
		<h2>{`Start #${channel}`}</h2>
		<p>This channel is wonderfully quiet. Share the first note when the moment is right.</p>
	</div>
}

interface ThreadPanelProps {
	parent: Message | null;
	replies: readonly ThreadReply[];
	loading: boolean;
	onClose: () => void;
	onReply: (body: string) => void;
	headingRef: { current: HTMLHeadingElement | null };
}

function ThreadPanel({
	parent,
	replies,
	loading,
	onClose,
	onReply,
	headingRef,
}: ThreadPanelProps) @{
	const [draft, setDraft] = useState('');
	const submit = (event: SubmitEvent) => {
		event.preventDefault();
		const body = draft.trim();
		if (body === '') return;
		onReply(body);
		setDraft('');
	};
	const handleKeyDown = (event: KeyboardEvent) => {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	};
	const keepFocusInThread = (event: KeyboardEvent) => {
		if (event.key !== 'Tab') return;
		const panel = event.currentTarget as HTMLElement;
		const focusable = [
			...panel.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		];
		const first = focusable[0];
		const last = focusable.at(-1);
		if (first === undefined || last === undefined) return;
		if (
			event.shiftKey &&
				(document.activeElement === first || document.activeElement === headingRef.current)
		) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	<div class="thread-backdrop" role="presentation" onClick={onClose}>
		<aside
			class="thread-panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="thread-heading"
			onKeyDown={keepFocusInThread}
			onClick={(event: MouseEvent) => event.stopPropagation()}
		>
			<header class="thread-header">
				<div>
					<p class="eyebrow">Focused conversation</p>
					<h2 id="thread-heading" ref={headingRef} tabIndex="-1">Thread</h2>
				</div>
				<button type="button" class="icon-button" onClick={onClose} aria-label="Close thread">
					×
				</button>
			</header>
			<div class="thread-scroll">
				@if (parent !== null) {
					<div class="thread-parent">
						<Avatar author={parent.author} />
						<div>
							<strong>{parent.author.name}</strong>
							<p>{parent.body}</p>
						</div>
					</div>
				}
				@if (loading) {
					<div class="thread-loading" role="status">Loading replies…</div>
				} @else {
					<>
						<div class="reply-divider">
							<span>{`${replies.length} replies`}</span>
						</div>
						@for (const reply of replies; key reply.id) {
							<article class="reply" aria-label={`Reply from ${reply.author.name}`}>
								<Avatar author={reply.author} small={true} />
								<div>
									<header>
										<strong>{reply.author.name}</strong>
										<time>{reply.sentAt}</time>
									</header>
									<p>{reply.body}</p>
								</div>
							</article>
						}
					</>
				}
			</div>
			<form class="thread-composer" onSubmit={submit}>
				<label for="thread-reply">Reply to thread</label>
				<textarea
					id="thread-reply"
					rows="3"
					value={draft}
					onInput={(event: InputEvent) => setDraft(
						(event.currentTarget as HTMLTextAreaElement).value,
					)}
					onKeyDown={handleKeyDown}
					placeholder="Add a useful detail…"
				></textarea>
				<div>
					<span>⌘ Enter to reply</span>
					<button type="submit" disabled={draft.trim() === ''}>Reply</button>
				</div>
			</form>
		</aside>
	</div>
}

function ThreadPortal(props: ThreadPanelProps) {
	const target = document.getElementById('panel-root');
	if (target === null) return null;
	return createPortal(ThreadPanel, target, props);
}

export function App() @{
	const [route, setRoute] = useState<Route>(() => readRoute());
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [messages, setMessages] = useState<Message[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const [connection, setConnection] = useState<ConnectionState>('connecting');
	const [paused, setPaused] = useState(false);
	const [composer, setComposer] = useState('');
	const [activity, setActivity] = useState('Opening Relay');
	const [threadReplies, setThreadReplies] = useState<ThreadReply[]>([]);
	const [localThreadReplies, setLocalThreadReplies] = useState<Record<string, ThreadReply[]>>({});
	const [threadLoading, setThreadLoading] = useState(false);
	const sessionRef = useRef(`relay-${crypto.randomUUID()}`);
	const sequenceByChannelRef = useRef(new Map<ChannelId, number>());
	const requestCounterRef = useRef(0);
	const conversationGenerationRef = useRef(0);
	const pendingHistoryLoadRef = useRef<PendingHistoryLoad | null>(null);
	const faultPendingRef = useRef(
		new URLSearchParams(window.location.search).get('fault') === 'history',
	);
	const conversationRef = useRef<HTMLDivElement | null>(null);
	const channelHeadingRef = useRef<HTMLHeadingElement | null>(null);
	const threadHeadingRef = useRef<HTMLHeadingElement | null>(null);
	const threadReturnFocusRef = useRef<HTMLElement | null>(null);
	const prependSnapshotRef = useRef<PrependSnapshot | null>(null);
	const channelDetails = CHANNEL_DETAILS[route.channel];

	const navigate = useCallback((next: Route, replace = false) => {
		const url =
			next.threadId ? threadURL(next.channel, next.threadId) : channelURL(next.channel);
		if (replace) history.replaceState(null, '', url);
		else history.pushState(null, '', url);
		setRoute(next);
	}, []);

	useEffect(() => {
		if (!window.location.pathname.startsWith('/channels/')) {
			navigate({ channel: 'general', threadId: null }, true);
		}
		const sync = () => setRoute(readRoute());
		window.addEventListener('popstate', sync);
		return () => window.removeEventListener('popstate', sync);
	}, [navigate]);

	const fetchConversation = useCallback(() => {
		const channel = route.channel;
		const generation = ++conversationGenerationRef.current;
		const failOnce = faultPendingRef.current;
		faultPendingRef.current = false;
		prependSnapshotRef.current = null;
		pendingHistoryLoadRef.current = null;
		setLoadingOlder(false);
		setLoadState('loading');
		setMessages([]);
		setHasMore(false);
		void loadHistory(sessionRef.current, channel, { failOnce }).then((page) => {
			if (
				readRoute().channel !== channel || conversationGenerationRef.current !== generation
			) return;
			setMessages(
				(current) => normalizeMessages([
					...page.messages,
					...current.filter((item) => item.channel === channel),
				]),
			);
			setHasMore(page.hasMore);
			setLoadState('ready');
			setActivity(`${page.messages.length} recent messages loaded in #${channel}`);
			requestAnimationFrame(() => {
				const conversation = conversationRef.current;
				if (conversation !== null) conversation.scrollTop = conversation.scrollHeight;
			});
		}).catch(() => {
			if (
				readRoute().channel !== channel || conversationGenerationRef.current !== generation
			) return;
			setLoadState('error');
			setActivity(`Could not load #${channel}`);
		});
	}, [route.channel]);

	useEffect(() => {
		fetchConversation();
	}, [fetchConversation]);

	useEffect(() => {
		if (paused) {
			setConnection('paused');
			return;
		}
		const channel = route.channel;
		setConnection('connecting');
		const subscription = subscribe(
			sessionRef.current,
			channel,
			sequenceByChannelRef.current.get(channel) ?? 0,
			{
				onOpen: () => {
					setConnection('live');
					setActivity(`Live updates connected for #${channel}`);
				},
				onReconnect: () => setConnection('reconnecting'),
				onMessage: (message, sequence) => {
					sequenceByChannelRef.current.set(
						channel,
						Math.max(sequenceByChannelRef.current.get(channel) ?? 0, sequence),
					);
					if (readRoute().channel !== channel) return;
					setMessages((current) => mergeIncoming(current, message));
					setActivity(`${message.author.name} posted in #${channel}`);
				},
			},
		);
		return () => subscription.close();
	}, [route.channel, paused]);

	useLayoutEffect(() => {
		const snapshot = prependSnapshotRef.current;
		const conversation = conversationRef.current;
		if (snapshot === null || conversation === null) return;
		const anchor = conversation.querySelector<HTMLElement>(
			`[data-message-id="${snapshot.messageId}"]`,
		);
		if (anchor === null) return;
		conversation.scrollTop += anchor.getBoundingClientRect().top - snapshot.top;
		prependSnapshotRef.current = null;
		setActivity('Earlier messages loaded without moving your place');
	}, [messages]);

	useEffect(() => {
		const threadId = route.threadId;
		if (threadId === null) {
			setThreadReplies([]);
			return;
		}
		setThreadLoading(true);
		void loadThread(threadId).then((thread) => {
			if (readRoute().threadId !== threadId) return;
			setThreadReplies(thread.replies);
			setThreadLoading(false);
			requestAnimationFrame(() => threadHeadingRef.current?.focus());
		}).catch(() => {
			if (readRoute().threadId !== threadId) return;
			setThreadReplies([]);
			setThreadLoading(false);
		});
	}, [route.threadId]);

	useEffect(() => {
		if (route.threadId === null) return;
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeThread();
			}
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [route.threadId]);

	const openChannel = useCallback((channel: ChannelId) => {
		navigate({ channel, threadId: null });
		requestAnimationFrame(() => channelHeadingRef.current?.focus());
	}, [navigate]);

	const openThread = useCallback((messageId: string, trigger: HTMLElement | null) => {
		threadReturnFocusRef.current = trigger;
		navigate({ channel: route.channel, threadId: messageId });
	}, [navigate, route.channel]);

	const closeThread = useCallback(() => {
		navigate({ channel: readRoute().channel, threadId: null });
		requestAnimationFrame(
			() => (threadReturnFocusRef.current ?? channelHeadingRef.current)?.focus(),
		);
	}, [navigate]);

	const loadEarlier = useCallback(() => {
		const first = messages[0];
		const channel = route.channel;
		const generation = conversationGenerationRef.current;
		const conversation = conversationRef.current;
		if (first === undefined || conversation === null || pendingHistoryLoadRef.current !== null) {
			return;
		}
		const anchor = conversation.querySelector<HTMLElement>(`[data-message-id="${first.id}"]`);
		if (anchor === null) return;
		const request: PendingHistoryLoad = { channel, generation, before: first.id };
		const snapshot: PrependSnapshot = {
			messageId: first.id,
			top: anchor.getBoundingClientRect().top,
		};
		pendingHistoryLoadRef.current = request;
		setLoadingOlder(true);
		const historyRequest = loadHistory(sessionRef.current, request.channel, {
			before: request.before,
		});
		void historyRequest.then((page) => {
			if (
				pendingHistoryLoadRef.current !== request || readRoute().channel !== request.channel ||
					conversationGenerationRef.current !== request.generation
			) return;
			pendingHistoryLoadRef.current = null;
			prependSnapshotRef.current = snapshot;
			setMessages((current) => normalizeMessages([...page.messages, ...current]));
			setHasMore(page.hasMore);
			setLoadingOlder(false);
		}).catch(() => {
			if (
				pendingHistoryLoadRef.current !== request || readRoute().channel !== request.channel ||
					conversationGenerationRef.current !== request.generation
			) return;
			pendingHistoryLoadRef.current = null;
			prependSnapshotRef.current = null;
			setLoadingOlder(false);
			setActivity('Earlier messages could not be loaded');
		});
	}, [messages, route.channel]);

	const submitMessage = useCallback((event: SubmitEvent) => {
		event.preventDefault();
		const body = composer.trim();
		if (body === '' || paused) return;
		const requestId = `${sessionRef.current}-${++requestCounterRef.current}`;
		const optimistic: Message = {
			id: `optimistic-${requestId}`,
			channel: route.channel,
			author: CURRENT_USER,
			body,
			sentAt: 'Just now',
			order: 1000 + requestCounterRef.current,
			reactions: 0,
			threadCount: 0,
			clientRequestId: requestId,
			delivery: 'pending',
		};
		setMessages((current) => normalizeMessages([...current, optimistic]));
		setComposer('');
		setActivity('Sending your message');
		void publishMessage(sessionRef.current, route.channel, body, requestId).catch(() => {
			setMessages(
				(current) => current.map(
					(message) => message.clientRequestId === requestId
						? { ...message, delivery: 'failed' }
						: message,
				),
			);
			setActivity('Message could not be sent');
		});
	}, [composer, paused, route.channel]);

	const handleComposerKey = useCallback((event: KeyboardEvent) => {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}, []);

	const requestUpdate = useCallback(() => {
		setActivity(
			paused ? 'A teammate update is waiting for reconnect' : 'Requesting a teammate update',
		);
		void requestTeammateUpdate(sessionRef.current, route.channel).catch(() => {
			setActivity('The teammate update could not be queued');
		});
	}, [paused, route.channel]);

	const reactToMessage = useCallback((messageId: string) => {
		setMessages(
			(current) => current.map(
				(message) => message.id === messageId
					? { ...message, reactions: message.reactions + 1 }
					: message,
			),
		);
	}, []);

	const addThreadReply = useCallback((body: string) => {
		const threadId = route.threadId;
		if (threadId === null) return;
		const reply: ThreadReply = {
			id: `local-reply-${++requestCounterRef.current}`,
			author: CURRENT_USER,
			body,
			sentAt: 'Just now',
		};
		setLocalThreadReplies(
			(current) => ({
				...current,
				[threadId]: [...(current[threadId] ?? []), reply],
			}),
		);
		setActivity('Reply added to thread');
	}, [route.threadId]);

	const visibleMessages = useMemo(
		() => messages.map((message) => {
			const addedReplies = localThreadReplies[message.id]?.length ?? 0;
			return addedReplies === 0
				? message
				: { ...message, threadCount: message.threadCount + addedReplies };
		}),
		[messages, localThreadReplies],
	);
	const visibleThreadReplies = useMemo(
		() => route.threadId === null
			? threadReplies
			: [...threadReplies, ...(localThreadReplies[route.threadId] ?? [])],
		[localThreadReplies, route.threadId, threadReplies],
	);

	const currentThreadParent = useMemo(
		() => visibleMessages.find((message) => message.id === route.threadId) ?? null,
		[route.threadId, visibleMessages],
	);
	<div class="relay-shell" data-testid="relay-ready">
		<a class="skip-link" href="#conversation">Skip to conversation</a>
		<aside class="workspace-sidebar">
			<header class="workspace-header">
				<div class="workspace-logo" aria-hidden="true">R</div>
				<div>
					<strong>Relay</strong>
					<span>Northstar Studio</span>
				</div>
			</header>
			<nav class="sidebar-nav" aria-label="Workspace channels">
				<p>Channels</p>
				@for (const channel of CHANNELS; key channel) {
					<a
						class={['channel-link', route.channel === channel && 'channel-link--active']}
						href={channelURL(channel)}
						aria-current={route.channel === channel ? 'page' : undefined}
						onClick={(event: MouseEvent) => {
							event.preventDefault();
							openChannel(channel);
						}}
					>
						<span aria-hidden="true">#</span>
						<span>{CHANNEL_DETAILS[channel].label}</span>
						@if (channel === 'general') {
							<span class="unread-dot" aria-label="Unread activity"></span>
						}
					</a>
				}
			</nav>
			<div class="sidebar-people">
				<p>Direct messages</p>
				<div>
					<span class="presence presence--online"></span>
					<Avatar author={{ name: 'Maya Chen', initials: 'MC', tone: 'coral' }} small={true} />
					<span>Maya Chen</span>
				</div>
				<div>
					<span class="presence"></span>
					<Avatar author={{ name: 'Kai Bell', initials: 'KB', tone: 'mint' }} small={true} />
					<span>Kai Bell</span>
				</div>
			</div>
			<footer class="profile-chip">
				<Avatar author={CURRENT_USER} small={true} />
				<div>
					<strong>Avery Stone</strong>
					<span>Available</span>
				</div>
			</footer>
		</aside>

		<main class="chat-main">
			<header class="channel-header">
				<div class="channel-title">
					<p class="mobile-brand">Relay / Northstar</p>
					<h1 ref={channelHeadingRef} tabIndex="-1">{`# ${channelDetails.label}`}</h1>
					<p>{channelDetails.description}</p>
				</div>
				<div class="channel-tools">
					<div class="member-stack" aria-label={`${channelDetails.members} channel members`}>
						<span>MC</span>
						<span>KB</span>
						<span>+{String(channelDetails.members - 2)}</span>
					</div>
					<ConnectionPill state={connection} />
					<button
						type="button"
						class="secondary-button"
						onClick={() => setPaused((value) => !value)}
					>
						{paused ? 'Reconnect' : 'Pause live updates'}
					</button>
				</div>
			</header>

			@if (paused) {
				<div class="offline-banner" role="note">
					<div>
						<strong>Live updates are paused.</strong>
						<span>Your draft stays here while Relay catches up later.</span>
					</div>
					<button type="button" onClick={requestUpdate}>Queue teammate update</button>
				</div>
			}

			<div id="conversation" class="conversation" ref={conversationRef} tabIndex="-1">
				@if (loadState === 'loading') {
					<LoadingConversation />
				} @else if (loadState === 'error') {
					<HistoryFailure onRetry={fetchConversation} />
				} @else if (messages.length === 0) {
					<EmptyConversation channel={route.channel} />
				} @else {
					<>
						<div class="history-controls">
							@if (hasMore) {
								<button
									type="button"
									onClick={loadEarlier}
									aria-busy={loadingOlder ? 'true' : 'false'}
									aria-disabled={loadingOlder ? 'true' : undefined}
								>
									{loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}
								</button>
							} @else {
								<span>Beginning of this channel</span>
							}
						</div>
						<div class="date-divider">
							<span>Today</span>
						</div>
						@for (const message of visibleMessages; key message.id) {
							<MessageRow message={message} onOpenThread={openThread} onReact={reactToMessage} />
						}
					</>
				}
			</div>

			<footer class="composer-area">
				<div class="live-demo">
					<span>Realtime fixture</span>
					<button type="button" onClick={requestUpdate} disabled={paused}>
						Bring in a teammate update
					</button>
				</div>
				<form class="composer" onSubmit={submitMessage}>
					<label for="message-composer">{`Message #${route.channel}`}</label>
					<textarea
						id="message-composer"
						rows="3"
						value={composer}
						onInput={(event: InputEvent) => setComposer(
							(event.currentTarget as HTMLTextAreaElement).value,
						)}
						onKeyDown={handleComposerKey}
						placeholder={paused
							? 'Draft safely while updates are paused…'
							: `Share with #${route.channel}`}
					></textarea>
					<div class="composer-actions">
						<span>⌘ Enter to send</span>
						<button type="submit" class="send-button" disabled={composer.trim() === '' || paused}>
							Send
						</button>
					</div>
				</form>
			</footer>
		</main>

		<nav class="mobile-nav" aria-label="Mobile channels">
			@for (const channel of CHANNELS; key channel) {
				<a
					href={channelURL(channel)}
					aria-current={route.channel === channel ? 'page' : undefined}
					onClick={(event: MouseEvent) => {
						event.preventDefault();
						openChannel(channel);
					}}
				>
					<span aria-hidden="true">#</span>
					{CHANNEL_DETAILS[channel].label}
				</a>
			}
		</nav>
		<div class="activity-announcer" role="status" aria-live="polite">{activity}</div>
		@if (route.threadId !== null) {
			<ThreadPortal
				key={route.threadId}
				parent={currentThreadParent}
				replies={visibleThreadReplies}
				loading={threadLoading}
				onClose={closeThread}
				onReply={addThreadReply}
				headingRef={threadHeadingRef}
			/>
		}
	</div>
}
