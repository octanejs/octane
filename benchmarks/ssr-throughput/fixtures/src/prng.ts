// Deterministic mulberry32 PRNG + word pool (cribbed from benchmarks/news/gen.mjs)
// so every fixture dataset is byte-stable across runs and processes — the harness
// gates (byte-identity, expected waterfall values, escape round-trip) depend on it.
export function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const WORDS =
	'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum'.split(
		' ',
	);

export function wordPicker(rand: () => number): () => string {
	return () => WORDS[Math.floor(rand() * WORDS.length)];
}
