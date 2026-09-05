import { base, theme } from './style-theme.tsrx';

// The component module of the RFC's opening example (tsrx-org/RFCs#1): an
// imported theme is a runtime `theme.$class` read appended after every scope
// hash, and every element of the applying scope (nested scopes included)
// carries it.
export function Panel() @{
	<>
		<style apply={theme}>
			div {
				color: rgb(0, 0, 0);
			}
		</style>
		<span id="panel-span" class={theme.dark}>{'Purple'}</span>
		<div id="panel-d1" class="panel-d1">{'Black'}</div>
		<style>
			p {
				margin: 0;
			}
		</style>
		<p id="panel-p1" class="panel-p1">{'No margin'}</p>
		@{
			<>
				<style>
					div {
						font-weight: 700;
					}
				</style>
				<div id="panel-d2" class="panel-d2">{'Bold'}</div>
				<p id="panel-p2" class="panel-p2">{'p2'}</p>
			</>
		}
	</>
}

const localBase = <style>
	.lb {
		letter-spacing: 1px;
	}
</style>;

// `$class` composition across modules: the same-module part is a literal, the
// imported part a runtime read, the block's own hash last.
export const mixed = <style apply={[localBase, theme]}>
	.mixed {
		text-decoration: underline;
	}
</style>;

// A body-less bundle exposes `$class` only.
export const bundle = <style apply={[theme, base]} />;

export function SelfClosedApply() @{
	<>
		<style apply={theme} />
		<div id="sca-host" class="sca">{'applied'}</div>
	</>
}

export function ArrayApply() @{
	<>
		<style apply={[theme, localBase]} />
		<div id="aa-host" class="aa">{'array'}</div>
	</>
}

export function BundleApply() @{
	<>
		<style apply={bundle} />
		<div id="ba-host" class="ba">{'bundle'}</div>
	</>
}

// clsx composition under a spread inside a scope applying an imported theme:
// the dynamic class normalizes first, then the scope hash, then `theme.$class`.
export function SpreadApplied(props: { attrs: Record<string, unknown>; cond: boolean }) @{
	<>
		<style apply={theme}>
			.sa {
				padding: 1px;
			}
		</style>
		<div id="sa-host" {...props.attrs} class={['sa', props.cond && 'on']}>{'spread'}</div>
	</>
}
