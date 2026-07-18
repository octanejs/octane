// Library hooks whose names collide with octane base hooks (a React-parity
// binding like @octanejs/aria exports `useId`). A compiled call site that
// imports these must resolve HERE — the custom-hook path — never to octane's
// builtins. The trailing compiler slot arrives as an extra argument, which a
// real binding splits off; these probes just ignore it.
export function useId(defaultId?: string, ..._args: any[]): string {
	return defaultId ? `foreign-${defaultId}` : 'foreign-id';
}

export function useState(_initial: string, ..._args: any[]): [string, string, () => string] {
	return ['foreign-a', 'foreign-b', () => 'foreign-c'];
}
