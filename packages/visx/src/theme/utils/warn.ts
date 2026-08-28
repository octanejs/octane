// Keep the literal expression below available to bundler define substitution
// without requiring Node ambient types in browser consumers.
declare const process: { env: { NODE_ENV?: string } };

export default function warn(message: string) {
	if (process.env.NODE_ENV !== 'production') {
		console.warn(message);
	}
}
