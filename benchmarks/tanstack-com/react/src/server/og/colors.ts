import type { LibraryId } from '~/libraries';

// Each entry matches the textStyle in `src/libraries/libraries.ts`.
// Values are Tailwind v4 default palette (500 shades) with an override
// for black/gray-100 libraries so they stay legible on the dark canvas.
const LIBRARY_ACCENT_COLORS: Partial<Record<LibraryId, string>> = {
	query: '#fb2c36', // red-500
	router: '#00bc7d', // emerald-500
	start: '#00b8db', // cyan-500
	table: '#2b7fff', // blue-500
	form: '#f0b100', // yellow-500
	db: '#ff6900', // orange-500
	ai: '#f6339a', // pink-500
	intent: '#00a6f4', // sky-500
	virtual: '#ad46ff', // purple-500
	pacer: '#7ccf00', // lime-500
	hotkeys: '#ff2056', // rose-500
	store: '#ae7d44', // twine-500 (custom token in app.css)
	ranger: '#f5f5f5', // gray-100 (black/gray-100 library)
	config: '#f5f5f5', // gray-100
	devtools: '#f5f5f5', // gray-100
	cli: '#615fff', // indigo-500
	mcp: '#f5f5f5', // gray-100 (hidden library, fallback)
};

const DEFAULT_ACCENT = '#f5f5f5';

export function getAccentColor(libraryId: LibraryId): string {
	return LIBRARY_ACCENT_COLORS[libraryId] ?? DEFAULT_ACCENT;
}
