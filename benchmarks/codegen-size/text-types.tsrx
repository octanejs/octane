import { formatTitle, type TextRow } from './text-types-model.js';

export function TextTypes(props: {
	title: string;
	rows: TextRow[];
	count: number;
	labels: string[];
}) @{
	<article>
		<h1>{props.title}</h1>
		<p class="text-title">{formatTitle(props.title)}</p>
		<span class="text-count">{String(props.count)}</span>
		<ul>
			@for (const row of props.rows; key row.id) {
				<li data-id={row.id}>{row.label}</li>
			} @empty {
				<li>empty</li>
			}
		</ul>
		<footer>{props.labels[0] ?? ''}</footer>
	</article>
}
