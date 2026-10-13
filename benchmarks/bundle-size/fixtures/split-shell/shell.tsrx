import { createPortal, Hydrate, lazy, use, useEffect, useState, useTransition } from 'octane';
import { visible } from 'octane/hydration';
// Native reads of imported handles need this module's own runtime signals import.
import 'octane/signals';
import { likes$, query$, queryLength$ } from './state.ts';

export type FeedItem = { id: string; title: string };
export type ShellProps = { items: FeedItem[]; greeting: Promise<string> };

const Settings = lazy(() => import('./settings.tsrx'));

function Search() @{
	<label>
		<input
			id="shell-search"
			value={query$.get()}
			onInput={(event) => query$.set((event.currentTarget as HTMLInputElement).value)}
		/>
		<output id="shell-search-length">{String(queryLength$.get())}</output>
	</label>
}

function Menu() @{
	const [open, setOpen] = useState(false);
	<div>
		<button id="shell-menu-toggle" onClick={() => setOpen(!open)}>
			{'menu'}
		</button>
		@if (open) {
			<>{createPortal(<div id="shell-menu">{'account'}</div>, document.body)}</>
		}
	</div>
}

function FeedRow(props: { item: FeedItem; style: { color: string } }) @{
	<li data-id={props.item.id} style={props.style}>
		{props.item.title as string}
	</li>
}

function Feed(props: { items: FeedItem[]; greeting: Promise<string> }) @{
	const greeting = use(props.greeting);
	<section>
		<h1 id="shell-greeting">{greeting as string}</h1>
		<ul>
			@for (const item of props.items; key item.id) {
				<FeedRow
					item={item}
					style={{ color: item.title.includes(query$.get()) ? 'black' : 'gray' }}
				/>
			} @empty {
				<li>{'nothing yet'}</li>
			}
		</ul>
		<button id="shell-like" onClick={() => likes$.set(likes$.get() + 1)}>
			{String(likes$.get())}
		</button>
	</section>
}

// Below-the-fold content that hydrates when it scrolls into view.
function Footer() @{
	const [subscribed, setSubscribed] = useState(false);
	<footer>
		<button id="shell-subscribe" onClick={() => setSubscribed(true)}>
			{subscribed ? 'subscribed' : 'subscribe'}
		</button>
	</footer>
}

export function Shell(props: ShellProps) @{
	const [page, setPage] = useState('home');
	const [pending, startTransition] = useTransition();
	useEffect(() => {
		document.title = page;
	}, [page]);
	<div id="shell" data-pending={pending ? 'true' : undefined}>
		<header>
			<button id="shell-navigate" onClick={() => startTransition(() => setPage('settings'))}>
				{'settings'}
			</button>
			<Search />
			<Menu />
		</header>
		@try {
			@if (page === 'settings') {
				<Settings />
			} @else {
				<Feed items={props.items} greeting={props.greeting} />
			}
		} @pending {
			<p>{'loading'}</p>
		} @catch {
			<p>{'failed'}</p>
		}
		<Hydrate when={visible()}>
			<Footer />
		</Hydrate>
	</div>
}
