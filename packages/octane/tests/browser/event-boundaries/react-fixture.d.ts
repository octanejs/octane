declare module 'virtual:event-boundaries-react-fixture' {
	export const SameRoot: import('react').ComponentType<
		import('../../_fixtures/event-boundaries.tsrx').EventProbeProps
	>;
	export const OuterNested: import('react').ComponentType<
		import('../../_fixtures/event-boundaries.tsrx').EventProbeProps
	>;
	export const Inner: import('react').ComponentType<
		import('../../_fixtures/event-boundaries.tsrx').EventProbeProps
	>;
}
