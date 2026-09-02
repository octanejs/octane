// A diamond: `pair` applies `base` directly and again through `accent`.
const base = <style>
	.base {
		--label: base;
	}
</style>;

const accent = <style apply={base}>
	.accent {
		--label: accent;
	}
</style>;

export const pair = <style apply={[base, accent]}>
	.pair {
		--label: pair;
	}
</style>;
