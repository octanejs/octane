// The theme module of the RFC's opening example (tsrx-org/RFCs#1). Exported
// blocks are themes: every selector survives, and `$class` composes the
// applied chain first, the block's own hash last.
export const base = <style>
	div {
		font-family: system-ui;
	}
	.muted {
		color: rgb(128, 128, 128);
	}
</style>;

export const theme = <style apply={base}>
	div {
		color: rgb(0, 128, 0);
	}
	.dark {
		color: rgb(128, 0, 128);
	}
</style>;
