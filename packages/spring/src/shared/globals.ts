// Mutable target globals adapted from react-spring v10.1.2 packages/shared/src/globals.ts.
export const Globals = {
	skipAnimation: false,
	assign(values: { skipAnimation?: boolean }) {
		if (values.skipAnimation !== undefined) this.skipAnimation = values.skipAnimation;
	},
};
