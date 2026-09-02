// Same-module composition chain: every hash is known statically and inlined.
const base = <style>
	.base {
		--label: base;
	}
	div {
		font-family: system-ui;
	}
</style>;

const accent = <style apply={base}>
	.accent {
		--label: accent;
	}
	div {
		color: blue;
	}
</style>;

export const theme = <style apply={accent}>
	.theme {
		--label: theme;
	}
	div {
		color: green;
	}
</style>;

const plain = <style>
	.plain {
		--label: plain;
	}
	p {
		margin: 0;
	}
</style>;

export const bundle = <style apply={[plain, theme]} />;

export function Composed() @{
	<>
		<style apply={theme} />
		<div class="c1">{'composed'}</div>
	</>
}
