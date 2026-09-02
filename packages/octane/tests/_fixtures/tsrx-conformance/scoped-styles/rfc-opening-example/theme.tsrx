// theme.tsrx — the theme module of the RFC's opening example.
export const base = <style>
	.base {
		--label: base;
	}
	div {
		font-family: system-ui;
	}
	.muted {
		color: gray;
	}
</style>;

export const theme = <style apply={base}>
	.theme {
		--label: theme;
	}
	div {
		color: green;
	}
	.dark {
		color: purple;
	}
</style>;
