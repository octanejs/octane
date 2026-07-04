import { mulberry32, wordPicker } from './prng';

// Shared dataset for BOTH deopt-page authorings (DeoptFast.tsrx and
// deopt-plain.ts) — one module so the two pages are guaranteed to render the
// same content; the harness gate then asserts the two bodies are byte-identical
// once hydration comment markers are stripped.
export interface CardData {
	id: number;
	initials: string;
	hue: number;
	name: string;
	role: string;
	theme: string;
	featured: boolean;
	width: number;
	tags: string[];
	// Spread onto the <article> in both authorings. Values deliberately carry
	// `&`, `"` and `<` so attribute serialization exercises escapeAttr on both
	// the compiled ssrSpread path and the descriptor ssrAttr path.
	meta: { title: string; 'data-active': string };
}

const rand = mulberry32(9001);
const pick = wordPicker(rand);
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

export const CARDS: CardData[] = Array.from({ length: 300 }, (_, i) => {
	const name = cap(pick()) + ' ' + cap(pick());
	const role = pick() + ' ' + pick();
	return {
		id: i + 1,
		initials: name
			.split(' ')
			.map((w) => w[0])
			.join(''),
		hue: Math.floor(rand() * 360),
		name,
		role,
		theme: 'theme-' + (i % 7),
		featured: rand() < 0.25,
		width: 220 + Math.floor(rand() * 120),
		// Suffix keeps tag keys unique within a card (words repeat).
		tags: Array.from({ length: 3 }, (_, k) => pick() + '-' + k),
		meta: {
			title: 'Card "' + name + '" & <' + role + '>',
			'data-active': i % 3 === 0 ? 'true' : 'false',
		},
	};
});
