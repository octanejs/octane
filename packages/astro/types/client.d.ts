/**
 * Astro client entrypoint — receives the island element and returns the
 * hydrator invoked when Astro's `client:*` directive fires.
 */
declare const client:
	| ((
			element: HTMLElement,
	  ) => (
			Component: any,
			props: Record<string, any>,
			slotted: Record<string, any>,
			meta: { client: string },
	  ) => void)
	| ((
			element: HTMLElement,
	  ) => (
			Component: any,
			props: Record<string, any>,
			slotted: Record<string, any>,
			meta: { client: string },
	  ) => Promise<void>);

export default client;
