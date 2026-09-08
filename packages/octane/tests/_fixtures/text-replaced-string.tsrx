export function replaceString(next: (value?: unknown) => unknown): () => void {
	const previous = globalThis.String;
	globalThis.String = next as unknown as StringConstructor;
	return () => {
		globalThis.String = previous;
	};
}

export function ReplacedString(props: { value: unknown }) @{
	<div id="replaced-string">{String(props.value)}</div>
}
