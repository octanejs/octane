/** @jsxImportSource octane */
export async function useAwaitedArgument(store, input) {
	return store.useValue(await input);
}
