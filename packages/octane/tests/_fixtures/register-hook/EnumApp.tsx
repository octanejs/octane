/** @jsxImportSource octane */
// A compiled `.tsx` component keeps TypeScript with runtime semantics, such as
// `enum`; the preload must hand that output to Bun's TypeScript loader.
enum Tone {
	Loud = 'loud',
	Quiet = 'quiet',
}

export function EnumApp({ tone }: { tone: Tone }) {
	return <main data-tone={tone}>{tone === Tone.Loud ? 'HELLO' : 'hello'}</main>;
}

export { Tone };
