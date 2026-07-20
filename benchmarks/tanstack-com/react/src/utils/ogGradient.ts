// Slug-derived gradient used as a muted cover-image placeholder for blog
// posts that ship without a header image. Same input slug always renders
// the same gradient. When a library id is provided, the palette is built
// around that library's primary hue so posts feel branded.

type Blob = {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	hue: number;
	sat: number;
	light: number;
	alpha: number;
	stop: number;
};

// Base hues per library, chosen to match each library's primary brand color.
// Libraries without a clear chromatic color (ranger, config, devtools, mcp)
// are omitted and fall back to the slug-derived palette.
const LIBRARY_HUES: Record<string, number> = {
	query: 0, // red → amber
	router: 150, // emerald → lime
	start: 180, // teal → cyan
	table: 200, // cyan → blue
	form: 50, // yellow
	virtual: 270, // purple → violet
	store: 30, // twine
	pacer: 80, // lime
	hotkeys: 350, // rose
	db: 25, // orange
	ai: 330, // pink
	intent: 200, // sky
	cli: 250, // indigo → violet
};

// Palette mixes hue offsets with lightness/saturation variation so adjacent
// blobs read as separate "regions" rather than blending into one wash.
function paletteFromHue(hue: number): Array<[number, number, number]> {
	return [
		[(hue - 30 + 360) % 360, 38, 52],
		[(hue - 12 + 360) % 360, 30, 70],
		[(hue + 360) % 360, 42, 58],
		[(hue + 18) % 360, 28, 72],
		[(hue + 36) % 360, 40, 55],
	];
}

const PALETTES: Array<Array<[number, number, number]>> = [
	// indigo / violet / rose
	[
		[250, 35, 60],
		[280, 30, 58],
		[320, 28, 62],
		[220, 32, 55],
		[260, 35, 65],
	],
	// teal / cyan / blue
	[
		[180, 32, 55],
		[200, 35, 60],
		[220, 32, 58],
		[170, 30, 60],
		[205, 35, 62],
	],
	// ember — amber / orange / rose
	[
		[25, 38, 60],
		[10, 35, 60],
		[340, 32, 60],
		[40, 38, 62],
		[355, 35, 60],
	],
	// forest / emerald / lime
	[
		[140, 30, 55],
		[160, 32, 55],
		[100, 28, 58],
		[180, 26, 55],
		[120, 30, 58],
	],
	// dusk — purple / pink / coral
	[
		[300, 30, 62],
		[330, 32, 65],
		[350, 32, 65],
		[270, 28, 60],
		[315, 30, 62],
	],
	// ocean — deep blue / cyan / aqua
	[
		[210, 35, 58],
		[195, 32, 60],
		[240, 30, 60],
		[180, 30, 58],
		[225, 32, 60],
	],
	// sunset — gold / coral / magenta
	[
		[35, 38, 62],
		[10, 35, 62],
		[330, 30, 62],
		[50, 38, 65],
		[355, 32, 60],
	],
	// moss — olive / sage / teal
	[
		[85, 25, 55],
		[120, 22, 55],
		[160, 25, 55],
		[60, 25, 58],
		[140, 22, 55],
	],
];

function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function rng(seed: number): () => number {
	let s = seed || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 10000) / 10000;
	};
}

function paletteFor(slug: string, library?: string): Array<[number, number, number]> {
	if (library) {
		const firstId = library.split(',')[0]?.trim();
		const baseHue = firstId ? LIBRARY_HUES[firstId] : undefined;
		if (baseHue !== undefined) {
			return paletteFromHue(baseHue);
		}
	}
	const seed = hash(slug || 'fallback');
	return PALETTES[seed % PALETTES.length];
}

// Two layers of blob anchors: large "wash" blobs cover the canvas with
// soft color, and smaller "accent" blobs add organic punch on top. Both
// layers get jittered + asymmetric ellipse radii so no two posts look the
// same and shapes feel hand-placed rather than radially centered.
type Anchor = { cx: number; cy: number; kind: 'wash' | 'accent' };

const ANCHORS: Array<Anchor> = [
	{ cx: 18, cy: 22, kind: 'wash' },
	{ cx: 78, cy: 18, kind: 'wash' },
	{ cx: 25, cy: 78, kind: 'wash' },
	{ cx: 72, cy: 82, kind: 'wash' },
	{ cx: 50, cy: 12, kind: 'accent' },
	{ cx: 8, cy: 88, kind: 'accent' },
	{ cx: 88, cy: 92, kind: 'accent' },
	{ cx: 42, cy: 38, kind: 'accent' },
	{ cx: 60, cy: 65, kind: 'accent' },
	{ cx: 32, cy: 92, kind: 'accent' },
];

// Containers using this gradient are wide (5:2 or 16:9), so percentage-based
// ellipse radii get visually squished horizontally. We bias ry > rx so blobs
// read as roughly circular rather than as horizontal bands.
function blobsFor(slug: string, library?: string): Array<Blob> {
	const seed = hash(slug || 'fallback');
	const rand = rng(seed);
	const palette = paletteFor(slug, library);
	return ANCHORS.map((anchor, i) => {
		const [baseHue, baseSat, baseLight] = palette[i % palette.length];
		const hueJitter = (rand() - 0.5) * 14;
		if (anchor.kind === 'wash') {
			const rx = 60 + rand() * 25;
			return {
				cx: anchor.cx + (rand() - 0.5) * 24,
				cy: anchor.cy + (rand() - 0.5) * 24,
				rx,
				ry: rx * (1.5 + rand() * 0.6),
				hue: (baseHue + hueJitter + 360) % 360,
				sat: baseSat,
				light: baseLight,
				alpha: 0.6 + rand() * 0.2,
				stop: 95 + rand() * 25,
			};
		}
		const rx = 32 + rand() * 18;
		return {
			cx: anchor.cx + (rand() - 0.5) * 18,
			cy: anchor.cy + (rand() - 0.5) * 18,
			rx,
			ry: rx * (1.4 + rand() * 0.6),
			hue: (baseHue + hueJitter + 360) % 360,
			sat: baseSat,
			light: baseLight,
			alpha: 0.65 + rand() * 0.2,
			stop: 85 + rand() * 20,
		};
	});
}

function baseTintCss(palette: Array<[number, number, number]>): string {
	const [h1, s1, l1] = palette[0];
	const [h2, s2, l2] = palette[Math.floor(palette.length / 2)];
	return `linear-gradient(135deg, hsla(${h1}, ${s1}%, ${Math.max(35, l1 - 8)}%, 0.35) 0%, hsla(${h2}, ${s2}%, ${Math.max(35, l2 - 8)}%, 0.35) 100%)`;
}

function blobsToCss(blobs: Array<Blob>, tint: string): string {
	const layers = blobs.map(
		(b) =>
			`radial-gradient(ellipse ${b.rx.toFixed(1)}% ${b.ry.toFixed(1)}% at ${b.cx.toFixed(2)}% ${b.cy.toFixed(2)}%, hsla(${b.hue.toFixed(1)}, ${b.sat.toFixed(1)}%, ${b.light.toFixed(1)}%, ${b.alpha.toFixed(2)}) 0%, hsla(${b.hue.toFixed(1)}, ${b.sat.toFixed(1)}%, ${b.light.toFixed(1)}%, 0) ${b.stop.toFixed(1)}%)`,
	);
	// The base tint sits underneath so edges never wash out to the wrapper bg.
	return [...layers, tint].join(', ');
}

export function gradientBackgroundCss(slug: string, library?: string): string {
	const palette = paletteFor(slug, library);
	return blobsToCss(blobsFor(slug, library), baseTintCss(palette));
}
