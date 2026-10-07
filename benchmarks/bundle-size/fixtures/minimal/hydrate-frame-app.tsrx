import { createPortal, use, useState } from 'octane';
import { derived$, signal$ } from 'octane/signals';

export type FrameItem = { id: string; label: string };
export type FrameProps = {
	items: FrameItem[];
	content: Promise<string>;
	style: { width: string };
};

export const selected$ = signal$('inbox');
const selectedLength$ = derived$(() => selected$.get().length);

function Row(props: { item: FrameItem; style: { color: string } }) @{
	<li data-id={props.item.id} style={props.style}>{props.item.label as string}</li>
}

function Sidebar(props: { items: FrameItem[]; style: { width: string } }) @{
	<nav id="frame-sidebar" style={props.style}>
		<ul>
			@for (const item of props.items; key item.id) {
				<Row item={item} style={{ color: selected$.get() === item.id ? 'red' : 'black' }} />
			}
		</ul>
	</nav>
}

function Content(props: { content: Promise<string> }) @{
	const text = use(props.content);
	<article id="frame-content">{text as string}</article>
}

function Menu() @{
	const [open, setOpen] = useState(false);
	<div>
		<button id="frame-menu-toggle" onClick={() => setOpen(!open)}>{'menu'}</button>
		@if (open) {
			<>
				{createPortal(<div id="frame-menu">{'portal'}</div>, document.body)}
			</>
		}
	</div>
}

export function Frame(props: FrameProps) @{
	<main id="frame">
		<header>
			<button
				id="frame-select"
				onClick={() => selected$.set('sent')}
			>{selected$.get() as string}</button>
			<output id="frame-length">{String(selectedLength$.get())}</output>
			<Menu />
		</header>
		<Sidebar items={props.items} style={props.style} />
		@try {
			<Content content={props.content} />
		} @pending {
			<p id="frame-pending">{'loading'}</p>
		} @catch {
			<p id="frame-error">{'failed'}</p>
		}
	</main>
}
