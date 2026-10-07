import { createContext } from 'octane';
import { signal$ } from 'octane/signals';

// Document signals the frame reads natively during hydration. Most components
// read none of them; every module still imports octane/signals, so the whole
// frame compiles with native-read brackets and runtime style bindings.
export const sidebarOpen$ = signal$(true);
export const draft$ = signal$('');
export const model$ = signal$('default');
export const menuOpen$ = signal$(false);
export const searchOpen$ = signal$(false);

export const FRAME_PROPS = { activeId: 'chat-3', signedIn: false };

// `frame` keeps native reads in leaf components, as the audited app frame does.
// `frame-live-sections` reads in two section roots, so releasing the adopted
// server values re-renders those whole sections after hydration commits.
export const SCENARIOS = {
	frame: { liveSections: false },
	'frame-live-sections': { liveSections: true },
} as const;

export type Scenario = keyof typeof SCENARIOS;

export interface FrameStrings {
	newChat: string;
	search: string;
	options: string;
	send: string;
	attach: string;
	disclaimer: string;
}

export const StringsContext = createContext<FrameStrings>({
	newChat: 'New chat',
	search: 'Search chats',
	options: 'Options',
	send: 'Send prompt',
	attach: 'Attach files',
	disclaimer: 'Answers can contain mistakes. Check important details.',
});

export interface NavEntry {
	id: string;
	title: string;
	href: string;
	icon: string;
	badge: string | null;
	pinned: boolean;
}

export interface FrameData {
	projects: NavEntry[];
	history: NavEntry[];
	tools: NavEntry[];
	suggestions: Array<{ id: string; icon: string; title: string; detail: string }>;
	toolbarGroups: number;
}

// Deterministic data: the server and every client sample see the same frame.
function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

const WORDS = [
	'plan',
	'draft',
	'summary',
	'review',
	'notes',
	'trip',
	'budget',
	'recipe',
	'outline',
	'compare',
	'explain',
	'fix',
	'chart',
	'email',
	'story',
	'list',
];
const ICONS = ['chat', 'folder', 'star', 'code', 'image', 'book', 'globe', 'pen'];

function entries(prefix: string, count: number, random: () => number): NavEntry[] {
	return Array.from({ length: count }, (_, index) => {
		const words = 2 + Math.floor(random() * 4);
		const title = Array.from(
			{ length: words },
			() => WORDS[Math.floor(random() * WORDS.length)],
		).join(' ');
		return {
			id: `${prefix}-${index}`,
			title,
			href: `/${prefix}/${index}`,
			icon: ICONS[Math.floor(random() * ICONS.length)],
			badge: random() < 0.2 ? String(1 + Math.floor(random() * 9)) : null,
			pinned: random() < 0.15,
		};
	});
}

export function frameData(): FrameData {
	const random = seeded(0x5eed);
	return {
		projects: entries('project', 6, random),
		history: entries('chat', 48, random),
		tools: entries('tool', 6, random),
		suggestions: Array.from({ length: 4 }, (_, index) => ({
			id: `suggestion-${index}`,
			icon: ICONS[index],
			title: `${WORDS[index]} ${WORDS[index + 4]}`,
			detail: `${WORDS[index + 8]} ${WORDS[index + 12]}`,
		})),
		toolbarGroups: 10,
	};
}
