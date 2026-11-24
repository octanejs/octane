import { Activity, memo, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
	RetainedSignalProvider,
	useRetainedSignalValue,
	useSignalValue,
} from 'octane/signals/react';
import { ROOM_NAMES, ROW_COUNT } from './model.js';
import { install, pressed, tailCommitted } from './browser.js';

function messageBody(kind, text) {
	switch (kind) {
		case 'checklist':
			return (
				<ul>
					{text.split('\n').map((item, i) => (
						<li key={i}>{i ? '\n' + item : item}</li>
					))}
				</ul>
			);
		case 'reading':
			return <pre>{text}</pre>;
		case 'question':
			return <blockquote>{text}</blockquote>;
		case 'attachment':
			return (
				<figure>
					<figcaption>{text}</figcaption>
				</figure>
			);
		default:
			return <p>{text}</p>;
	}
}

function LatestReply({ id, text }) {
	useLayoutEffect(tailCommitted, [text]);
	return <p id={id}>{text}</p>;
}

function Message({ row, latest }) {
	const author = useRetainedSignalValue(row.author$);
	const presence = useRetainedSignalValue(row.presence$);
	const body = useRetainedSignalValue(row.body$);
	const status = useRetainedSignalValue(row.status$);
	const reactions = useSignalValue(row.reactions$);
	return (
		<article data-kind={row.kind}>
			<header>
				<strong>{author}</strong>
				<small>{presence}</small>
			</header>
			{latest ? <LatestReply id={latest} text={body} /> : messageBody(row.kind, body)}
			<footer>
				<span>{status}</span>
				<span>{reactions}</span>
			</footer>
		</article>
	);
}

function Preview({ room }) {
	const preview = useSyncExternalStore(room.subscribePreview, room.readPreview);
	return <output>{preview}</output>;
}

const Conversation = memo(function Conversation({ room }) {
	return (
		<section id={'room-' + room.id} aria-label={ROOM_NAMES[room.id]}>
			<h1 id={'title-' + room.id}>{ROOM_NAMES[room.id]}</h1>
			<Preview room={room} />
			<div className="history">
				<div>
					{room.rows.map((row) => (
						<Message
							key={row.index}
							row={row}
							latest={row.index === ROW_COUNT - 1 ? 'latest-' + room.id : undefined}
						/>
					))}
				</div>
			</div>
		</section>
	);
});

function Chat({ rooms, committed, evicted, model }) {
	const active = rooms.at(-1).id;
	useLayoutEffect(committed, [committed]);
	useEffect(() => {
		// Hidden Activity readers finish releasing in a microtask after removal.
		if (evicted !== undefined) queueMicrotask(() => model.evict(evicted));
	}, [model, evicted]);
	return (
		<RetainedSignalProvider>
			<nav aria-label="Conversations">
				{ROOM_NAMES.map((name, id) => (
					<button
						key={id}
						data-target={id}
						aria-current={id === active ? 'page' : undefined}
						onPointerDown={(event) => pressed(id, event)}
					>
						{name}
					</button>
				))}
			</nav>
			{rooms
				.toSorted((a, b) => a.id - b.id)
				.map((room) => (
					<Activity key={room.id} mode={room.id === active ? 'visible' : 'hidden'}>
						<RetainedSignalProvider>
							<Conversation room={room} />
						</RetainedSignalProvider>
					</Activity>
				))}
		</RetainedSignalProvider>
	);
}

install((host) => {
	const root = createRoot(host);
	return {
		render: (props) => root.render(<Chat {...props} />),
		unmount: () => root.unmount(),
	};
});
