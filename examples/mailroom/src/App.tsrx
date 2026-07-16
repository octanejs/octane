import { useEffect, useRef, useState } from 'octane';
import {
	Link,
	Outlet,
	RouterProvider,
	createBrowserRouter,
	isRouteErrorResponse,
	useBlocker,
	useFetcher,
	useFetchers,
	useLoaderData,
	useLocation,
	useNavigate,
	useNavigation,
	useRevalidator,
	useRouteError,
	useRouteLoaderData,
} from '@octanejs/remix-router';
import { composeLoader, mailAction, mailboxLoader, shellLoader } from './data';
import type {
	ComposeSnapshot,
	FolderId,
	MailActionResult,
	MailboxSnapshot,
	MailMessage,
	WorkspaceSnapshot,
} from './types';

const FOLDER_LABELS: Record<FolderId, string> = {
	inbox: 'Inbox',
	starred: 'Starred',
	sent: 'Sent',
	drafts: 'Drafts',
	archive: 'Archive',
	outbox: 'Outbox',
};

const FOLDER_ICONS: Record<FolderId, string> = {
	inbox: '⌁',
	starred: '✦',
	sent: '↗',
	drafts: '◇',
	archive: '▱',
	outbox: '◴',
};

function withSearch(path: string, search: string): string {
	return `${path}${search}`;
}

function mailActionURL(search: string): string {
	return withSearch('/actions/mail', search);
}

function folderURL(folder: FolderId, search: string): string {
	return withSearch(`/mail/${folder}`, search);
}

function messageURL(folder: FolderId, messageId: string, search: string): string {
	return withSearch(`/mail/${folder}/${encodeURIComponent(messageId)}`, search);
}

function composeURL(draftId: string, search: string): string {
	return withSearch(`/compose/${encodeURIComponent(draftId)}`, search);
}

function NavItem(props) {
	const label = FOLDER_LABELS[props.folder];
	const count = Number(props.count);
	return <Link
		to={folderURL(props.folder, props.search)}
		class={props.active ? 'mailbox-link is-active' : 'mailbox-link'}
		aria-current={props.active ? 'page' : undefined}
		aria-label={`${label}, ${count} ${count === 1 ? 'item' : 'items'}`}
	>
		<span class="mailbox-icon" aria-hidden="true">
			{FOLDER_ICONS[props.folder] as string}
		</span>
		<span>
			{label as string}
		</span>
		<span class="mailbox-count">{String(props.count)}</span>
	</Link>;
}

function OutboxSync(props) {
	const fetcher = useFetcher({ key: 'mailroom-outbox-sync' });
	const queued = props.workspace.outbox[0];

	useEffect(() => {
		if (!props.online || queued === undefined || fetcher.state !== 'idle') return;
		fetcher.submit({ intent: 'flush-outbox', outboxId: queued.id }, {
			method: 'post',
			action: mailActionURL(props.search),
		});
	}, [props.online, queued?.id, fetcher.state, props.search]);

	return <>
		@if (fetcher.state !== 'idle') {
			<span class="sync-state" role="status">Sending queued mail…</span>
		} @else if (fetcher.data?.ok && fetcher.data?.kind === 'flush') {
			<span class="sync-state" role="status">Queued mail delivered</span>
		} @else {
			<span />
		}
	</>;
}

function Shell() {
	const workspace = useLoaderData() as WorkspaceSnapshot;
	const location = useLocation();
	const navigation = useNavigation();
	const activeFetchers = useFetchers();
	const durableMutation = useFetcher({ key: 'mailroom-message-action' });
	const [online, setOnline] = useState(navigator.onLine);

	useEffect(() => {
		const wentOnline = () => setOnline(true);
		const wentOffline = () => setOnline(false);
		window.addEventListener('online', wentOnline);
		window.addEventListener('offline', wentOffline);
		return () => {
			window.removeEventListener('online', wentOnline);
			window.removeEventListener('offline', wentOffline);
		};
	}, []);

	const pathname = location.pathname;
	const composeActive = pathname.startsWith('/compose/');
	const currentFolder = pathname.startsWith('/mail/') ? pathname.split('/')[2] : '';
	const meaningfulFetchers = activeFetchers.filter((fetcher) => fetcher.state !== 'idle');

	return <div class="app-shell">
		<header class="topbar">
			<Link class="brand" to={folderURL('inbox', location.search)} aria-label="Mailroom inbox">
				<span class="brand-mark" aria-hidden="true">M</span>
				<span>
					<strong>Mailroom</strong>
					<small>Northstar studio</small>
				</span>
			</Link>
			<div class="topbar-actions">
				<span class={online ? 'connection is-online' : 'connection is-offline'}>
					<span aria-hidden="true">●</span>
					{online ? 'Online' : 'Offline'}
				</span>
				<span class="avatar" aria-label="Signed in as Avery Stone">AS</span>
			</div>
		</header>

		<div class="workspace">
			<aside class="sidebar">
				<Link
					to={composeURL('new', location.search)}
					class={composeActive ? 'compose-link is-active' : 'compose-link'}
				>
					<span aria-hidden="true">＋</span>
					Compose
				</Link>
				<nav aria-label="Mailboxes">
					@for (const folder of [
						'inbox',
						'starred',
						'sent',
						'drafts',
						'archive',
						'outbox',
					]; key folder) {
						<NavItem
							folder={folder}
							search={location.search}
							count={workspace.counts[folder]}
							active={currentFolder === folder}
						/>
					}
				</nav>
				<div class="storage-card">
					<span class="storage-title">Local-first mailbox</span>
					<span>Drafts and queued mail stay on this device.</span>
				</div>
			</aside>

			<section class="route-stage">
				<div class="route-status" aria-live="polite">
					@if (navigation.state !== 'idle') {
						<span role="status">Opening mailbox…</span>
					} @else if (durableMutation.state !== 'idle') {
						<span role="status">1 message update in flight</span>
					} @else if (meaningfulFetchers.length > 0) {
						<span role="status">
							{String(meaningfulFetchers.length) + ' background update in flight'}
						</span>
					} @else {
						<span>Mailbox ready</span>
					}
					<OutboxSync workspace={workspace} online={online} search={location.search} />
				</div>
				<Outlet />
			</section>
		</div>
	</div>;
}

function MessageRow(props) {
	const message = props.message as MailMessage;
	return <Link
		to={messageURL(props.folder, message.id, props.search)}
		class={[
			'message-row',
			!message.read && 'is-unread',
			props.active && 'is-active',
		]}
		aria-current={props.active ? 'page' : undefined}
	>
		<div class="message-row-topline">
			<strong>{message.from}</strong>
			<time>{message.receivedAt}</time>
		</div>
		<div class="message-subject">
			@if (message.starred) {
				<span class="star" aria-label="Starred">✦</span>
			}
			{message.subject}
		</div>
		<p>{message.preview}</p>
	</Link>;
}

function MessageDetail(props) {
	const message = props.message as MailMessage;
	const fetcher = useFetcher({ key: 'mailroom-message-action' });
	const desiredFromSubmission = fetcher.formData?.get('desired');
	const optimisticStarred =
		typeof desiredFromSubmission === 'string' ? desiredFromSubmission === 'true' : message.starred;

	const toggleStar = () => {
		fetcher.submit(
			{
				intent: 'toggle-star',
				messageId: message.id,
				desired: String(!optimisticStarred),
			},
			{ method: 'post', action: mailActionURL(props.search) },
		);
	};

	return <article class="message-detail" aria-labelledby="message-title">
		<div class="message-toolbar" role="toolbar" aria-label="Message actions">
			<button
				type="button"
				class={optimisticStarred ? 'icon-button is-active' : 'icon-button'}
				aria-label={optimisticStarred ? 'Remove star' : 'Star message'}
				aria-pressed={optimisticStarred ? 'true' : 'false'}
				onClick={toggleStar}
			>
				{optimisticStarred ? '★' : '☆'}
			</button>
			@if (fetcher.state !== 'idle') {
				<span role="status" class="mutation-status">Saving star…</span>
			} @else if (fetcher.data?.kind === 'star' && fetcher.data?.ok) {
				<span role="status" class="mutation-status">Star saved</span>
			}
		</div>
		<div class="message-heading">
			<p class="eyebrow">
				{message.folder === 'sent' ? 'Sent message' : 'Conversation'}
			</p>
			<h2 id="message-title">{message.subject}</h2>
			<div class="sender-line">
				<span class="sender-avatar" aria-hidden="true">{message.from.slice(0, 1)}</span>
				<span>
					<strong>{message.from}</strong>
					<small>
						{'to ' + message.to.join(', ')}
					</small>
				</span>
				<time>{message.receivedAt}</time>
			</div>
		</div>
		<div class="message-body">
			@for (const paragraph of message.body; key paragraph) {
				<p>{paragraph}</p>
			}
		</div>
		<div class="reply-card">
			<span aria-hidden="true">↩</span>
			<span>
				Replying is intentionally outside this fixture; compose a new deterministic draft instead.
			</span>
		</div>
	</article>;
}

function DraftList(props) {
	return <>
		@if (props.drafts.length === 0) {
			<EmptyMailbox title="No saved drafts" detail="Start a message and save it to keep it here." />
		} @else {
			<div class="draft-list" aria-label="Saved drafts">
				@for (const draft of props.drafts; key draft.id) {
					<Link class="draft-row" to={composeURL(draft.id, props.search)}>
						<span class="draft-badge">Draft</span>
						<strong>
							{draft.subject || 'Untitled draft'}
						</strong>
						<span>
							{draft.to || 'No recipient'}
						</span>
						<small>{draft.updatedAt}</small>
					</Link>
				}
			</div>
		}
	</>;
}

function OutboxList(props) {
	return <>
		@if (props.items.length === 0) {
			<EmptyMailbox
				title="Outbox is clear"
				detail="Messages queued offline will wait here and send automatically when connection returns."
			/>
		} @else {
			<div class="draft-list" role="list" aria-label="Queued messages">
				@for (const item of props.items; key item.id) {
					<div class="draft-row queued-row" role="listitem">
						<span class="draft-badge is-queued">Queued</span>
						<strong>{item.subject}</strong>
						<span>
							{'To ' + item.to}
						</span>
						<span class="queued-preview">{item.body}</span>
						<small>{item.queuedAt}</small>
					</div>
				}
			</div>
		}
	</>;
}

function EmptyMailbox(props) {
	return <div class="empty-mailbox">
		<div class="empty-orbit" aria-hidden="true">✓</div>
		<h2>{props.title}</h2>
		<p>{props.detail}</p>
	</div>;
}

function Mailbox() {
	const data = useLoaderData() as MailboxSnapshot;
	const location = useLocation();
	const messageId = location.pathname.split('/')[3];
	const folderName = FOLDER_LABELS[data.folder];

	return <div class="mailbox-view">
		<section class="message-list-pane" aria-labelledby="folder-title">
			<header class="pane-header">
				<div>
					<p class="eyebrow">Mailbox</p>
					<h1 id="folder-title">{folderName}</h1>
				</div>
				<span class="pane-count">{String(
					data.folder === 'drafts'
						? data.drafts.length
						: data.folder === 'outbox'
							? data.outbox.length
							: data.messages.length,
				)}</span>
			</header>
			@if (data.folder === 'drafts') {
				<DraftList drafts={data.drafts} search={location.search} />
			} @else if (data.folder === 'outbox') {
				<OutboxList items={data.outbox} />
			} @else if (data.messages.length === 0) {
				<EmptyMailbox
					title={'No mail in ' + folderName.toLowerCase()}
					detail="You are completely caught up."
				/>
			} @else {
				<div class="message-list" aria-label={folderName + ' messages'}>
					@for (const message of data.messages; key message.id) {
						<MessageRow
							message={message}
							folder={data.folder}
							search={location.search}
							active={message.id === messageId}
						/>
					}
				</div>
			}
		</section>

		<section class="detail-pane">
			@if (data.folder === 'drafts' || data.folder === 'outbox') {
				<div class="selection-placeholder">
					<span aria-hidden="true">↖</span>
					<p>Select a draft from the list.</p>
				</div>
			} @else if (messageId !== undefined && data.selectedMessage === null) {
				<div class="missing-message" role="alert">
					<span aria-hidden="true">?</span>
					<h2>Message not found</h2>
					<p>This link does not point to a message in the current mailbox.</p>
					<Link to={folderURL(data.folder, location.search)}>Back to {folderName}</Link>
				</div>
			} @else if (data.selectedMessage !== null) {
				<MessageDetail message={data.selectedMessage} search={location.search} />
			} @else {
				<div class="selection-placeholder">
					<span aria-hidden="true">✉</span>
					<p>Choose a message to read it.</p>
				</div>
			}
		</section>
	</div>;
}

function Compose() {
	const data = useLoaderData() as ComposeSnapshot;
	const location = useLocation();
	const navigate = useNavigate();
	const fetcher = useFetcher({ key: 'mailroom-compose' });
	const [to, setTo] = useState(data.draft.to);
	const [subject, setSubject] = useState(data.draft.subject);
	const [body, setBody] = useState(data.draft.body);
	const [dirty, setDirty] = useState(false);
	const [online, setOnline] = useState(navigator.onLine);
	const [localError, setLocalError] = useState('');
	const bodyRef = useRef(null);
	const stayRef = useRef(null);
	const bypassBlocker = useRef(false);
	const blocker = useBlocker(
		({ currentLocation, nextLocation }) => dirty && !bypassBlocker.current &&
			currentLocation.pathname !== nextLocation.pathname,
	);

	useEffect(() => {
		setTo(data.draft.to);
		setSubject(data.draft.subject);
		setBody(data.draft.body);
		setDirty(false);
		setLocalError('');
		bypassBlocker.current = false;
		fetcher.reset();
	}, [data.draft.id]);

	useEffect(() => {
		const wentOnline = () => setOnline(true);
		const wentOffline = () => setOnline(false);
		window.addEventListener('online', wentOnline);
		window.addEventListener('offline', wentOffline);
		return () => {
			window.removeEventListener('online', wentOnline);
			window.removeEventListener('offline', wentOffline);
		};
	}, []);

	useEffect(() => {
		if (blocker.state === 'blocked') stayRef.current?.focus();
	}, [blocker.state]);

	useEffect(() => {
		const result = fetcher.data as MailActionResult | undefined;
		if (!result?.ok) return;
		if (result.kind === 'draft') {
			setDirty(false);
			if (data.draft.id === 'new' && result.draftId !== undefined) {
				bypassBlocker.current = true;
				navigate(composeURL(result.draftId, location.search), { replace: true });
			}
		}
		if (result.kind === 'send') {
			bypassBlocker.current = true;
			setDirty(false);
			navigate(folderURL('sent', location.search));
		}
		if (result.kind === 'queue') {
			bypassBlocker.current = true;
			setDirty(false);
			navigate(folderURL('outbox', location.search));
		}
	}, [fetcher.data]);

	const updateTo = (event) => {
		setTo(event.currentTarget.value);
		setDirty(true);
		setLocalError('');
	};
	const updateSubject = (event) => {
		setSubject(event.currentTarget.value);
		setDirty(true);
		setLocalError('');
	};
	const updateBody = (event) => {
		setBody(event.currentTarget.value);
		setDirty(true);
		setLocalError('');
	};

	const fields = () => ({
		draftId: data.draft.id,
		to,
		subject,
		body,
	});

	const validate = () => {
		if (to.trim() !== '' && subject.trim() !== '' && body.trim() !== '') return true;
		setLocalError('Add a recipient, subject, and message first.');
		return false;
	};

	const saveDraft = () => {
		if (!validate()) return;
		fetcher.submit({ intent: 'save-draft', ...fields() }, {
			method: 'post',
			action: mailActionURL(location.search),
		});
	};

	const sendMessage = () => {
		if (!validate()) return;
		if (!online) {
			fetcher.submit({ intent: 'queue-offline', ...fields() }, {
				method: 'post',
				action: mailActionURL(location.search),
			});
			return;
		}
		fetcher.submit({ intent: 'send-now', ...fields() }, {
			method: 'post',
			action: mailActionURL(location.search),
		});
	};

	const actionResult = fetcher.data as MailActionResult | undefined;
	const actionError =
		actionResult?.ok === false ? actionResult.message ?? 'Mail action failed.' : '';

	return <div class="compose-view">
		<header class="compose-header">
			<div>
				<p class="eyebrow">
					{data.isNew ? 'New message' : 'Saved draft'}
				</p>
				<h1>
					{data.isNew ? 'Compose a note' : data.draft.subject}
				</h1>
			</div>
			<span class={dirty ? 'draft-state is-dirty' : 'draft-state'} role="status">
				{dirty
					? 'Unsaved changes'
					: actionResult?.kind === 'draft' && actionResult.ok
						? 'Draft saved'
						: data.draft.updatedAt}
			</span>
		</header>
		<div class="compose-card">
			<label>
				<span>To</span>
				<input
					type="email"
					value={to}
					onInput={updateTo}
					placeholder="name@example.com"
					aria-label="To"
				/>
			</label>
			<label>
				<span>Subject</span>
				<input
					value={subject}
					onInput={updateSubject}
					placeholder="A clear subject"
					aria-label="Subject"
				/>
			</label>
			<label class="body-field">
				<span>Message</span>
				<textarea
					ref={bodyRef}
					value={body}
					onInput={updateBody}
					placeholder="Write something thoughtful…"
					aria-label="Message"
				/>
			</label>
			@if (localError !== '' || actionError !== '') {
				<div class="compose-alert" role="alert">
					{localError || actionError}
				</div>
			}
			<div class="compose-actions">
				<button
					type="button"
					class="secondary-button"
					onClick={saveDraft}
					disabled={fetcher.state !== 'idle'}
				>
					{fetcher.state === 'submitting' ? 'Saving…' : 'Save draft'}
				</button>
				<button
					type="button"
					class="send-button"
					onClick={sendMessage}
					disabled={fetcher.state !== 'idle'}
				>
					{fetcher.state !== 'idle'
						? 'Working…'
						: online
							? 'Send now'
							: 'Queue for later'}
				</button>
			</div>
		</div>

		@if (blocker.state === 'blocked') {
			<div class="dialog-backdrop">
				<section class="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title">
					<span class="dialog-icon" aria-hidden="true">◇</span>
					<h2 id="leave-title">Leave this draft?</h2>
					<p>Your latest edits have not been saved or queued.</p>
					<div class="dialog-actions">
						<button
							ref={stayRef}
							type="button"
							class="secondary-button"
							onClick={() => {
								blocker.reset();
								window.requestAnimationFrame(() => bodyRef.current?.focus());
							}}
						>Keep writing</button>
						<button
							type="button"
							class="danger-button"
							onClick={() => {
								bypassBlocker.current = true;
								blocker.proceed();
							}}
						>Discard changes</button>
					</div>
				</section>
			</div>
		}
	</div>;
}

function RouteError() {
	const error = useRouteError();
	const revalidator = useRevalidator();
	const message =
		isRouteErrorResponse(error)
			? `${error.status} · ${String(error.data)}`
			: error instanceof Error
				? error.message
				: 'Mailroom could not open this route.';

	return <div class="route-error" role="alert">
		<span class="error-mark" aria-hidden="true">!</span>
		<p class="eyebrow">Delivery interrupted</p>
		<h1>Let’s try that mailbox again</h1>
		<p>{message}</p>
		<button
			type="button"
			class="send-button"
			onClick={() => revalidator.revalidate()}
			disabled={revalidator.state !== 'idle'}
		>
			{revalidator.state === 'loading' ? 'Retrying…' : 'Retry mailbox'}
		</button>
	</div>;
}

function MissingRoute() {
	const location = useLocation();
	return <div class="route-error" role="alert">
		<span class="error-mark" aria-hidden="true">404</span>
		<p class="eyebrow">Unknown address</p>
		<h1>This room does not exist</h1>
		<p>Use a mailbox link to return to your deterministic workspace.</p>
		<Link class="send-button button-link" to={folderURL('inbox', location.search)}>Open inbox</Link>
	</div>;
}

const router = createBrowserRouter([
	{
		id: 'root',
		path: '/',
		loader: shellLoader,
		Component: Shell,
		ErrorBoundary: RouteError,
		children: [
			{
				id: 'mailbox',
				path: 'mail/:folder/:messageId?',
				loader: mailboxLoader,
				Component: Mailbox,
				ErrorBoundary: RouteError,
			},
			{
				id: 'compose',
				path: 'compose/:draftId?',
				loader: composeLoader,
				Component: Compose,
				ErrorBoundary: RouteError,
			},
			{
				id: 'mail-action',
				path: 'actions/mail',
				action: mailAction,
			},
			{ id: 'missing', path: '*', Component: MissingRoute },
		],
	},
]);

export function App() {
	return <RouterProvider
		router={router}
		fallbackElement={<div class="boot-screen" role="status">
			<span>Opening Mailroom…</span>
		</div>}
	/>;
}
