// Repro fixture for audit ledger entry SFL-002: the base theme sets the
// `border-top-color` longhand, then an agent's override block writes the
// `border` shorthand instead of the longhand it meant to change. `apply`
// merges both classes onto the element, and in the emitted sheet order the
// shorthand silently resets the longhand — the clash only shows at runtime.
const base = <style>
	.card {
		border-top-color: rgb(200, 0, 0);
	}
</style>;

const agentOverride = <style apply={base}>
	.card {
		border: 1px solid rgb(0, 0, 200);
	}
</style>;

export function Card() @{
	<>
		<style apply={agentOverride} />
		<article class="card">{'content'}</article>
	</>
}
