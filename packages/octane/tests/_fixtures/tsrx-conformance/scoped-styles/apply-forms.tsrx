// Every `apply` shape: self-closed, array, with a body, two blocks in one
// scope, and a body-less assigned bundle.
const one = <style>
	.one {
		--label: one;
	}
	div {
		color: red;
	}
</style>;

const two = <style>
	.two {
		--label: two;
	}
	div {
		color: blue;
	}
</style>;

export const both = <style apply={[one, two]} />;

export function SelfClosed() @{
	<>
		<style apply={one} />
		<div class="a1">{'a'}</div>
		<p class="a2">
			<span class="a3">{'c'}</span>
		</p>
	</>
}

export function ArrayForm() @{
	<>
		<style apply={[one, two]} />
		<div class="b1">{'b'}</div>
	</>
}

export function WithBody() @{
	<>
		<style apply={one}>
			.withBody {
				--label: withBody;
			}
			div {
				color: black;
			}
		</style>
		<style>
			.withBody {
				--label: withBody;
			}
			p {
				margin: 0;
			}
		</style>
		<div class="c1 withBody">{'c'}</div>
		<p class="c2">{'p'}</p>
	</>
}

export function TwoApplies() @{
	<>
		<style apply={one} />
		<style apply={two} />
		<div class="d1">{'d'}</div>
	</>
}
