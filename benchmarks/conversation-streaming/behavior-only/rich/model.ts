import type { RichConversationProps } from './RichConversation.tsrx';

export interface BodyFrame {
	revision: number;
	rows: readonly { id: string; prompt: string; answer: string }[];
}
export interface HistoryFrame {
	revision: number;
	rows: readonly { id: string; title: string }[];
}

export const initialRich: RichConversationProps = {
	title: 'A trip taking shape',
	progress: [{ id: 'search', text: 'Preparing a response…', state: 'active' }],
	paragraphs: [],
	links: [],
	places: [],
	mapReady: false,
	selectedPlace: null,
	viewBox: '0 0 100 50',
	onActivateMap() {},
	onSelectPlace() {},
	onZoom() {},
};

/** Pure data projection. The authored view alone owns the presentation. */
export function richContent(body: BodyFrame | null, history: HistoryFrame | null) {
	// A later frame temporarily removes one prior result and reorders survivors.
	// The final authority reintroduces it, exercising deletion as well as append.
	const rows =
		body?.revision === 3 ? [...body.rows.slice(0, 1), ...body.rows.slice(2).reverse()] : body?.rows;
	return {
		title: history ? `A trip taking shape · title revision ${history.revision}` : initialRich.title,
		progress: body
			? [
					{
						id: 'search',
						text: `Finding places · update ${body.revision}`,
						state: body.revision === 4 ? ('complete' as const) : ('active' as const),
					},
					{
						id: 'summarize',
						text: `Building the response from ${body.rows.length} results`,
						state: body.revision === 4 ? ('complete' as const) : ('active' as const),
					},
				]
			: initialRich.progress,
		paragraphs:
			rows?.map((row) => ({ id: row.id, text: `${row.answer} Update ${body!.revision}.` })) ?? [],
		links:
			rows
				?.filter((_, index) => index % 3 === 0)
				.map((row) => ({
					id: row.id,
					label: row.prompt,
					href: `/place/${row.id}?revision=${body!.revision}`,
				})) ?? [],
		places:
			rows?.map((row, index) => ({
				id: row.id,
				label: `${row.prompt} · ${body!.revision}`,
				x: 10 + (index % 8) * 11,
				y: 10 + Math.floor(index / 8) * 12,
			})) ?? [],
	};
}
