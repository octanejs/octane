// Imported themes stay runtime `$class` reads, after every static hash.
import { theme } from './theme.tsrx';
import * as themes from './themes.tsrx';

const localBase = <style>
	.localBase {
		--label: localBase;
	}
	div {
		color: red;
	}
</style>;

export const mixed = <style apply={[localBase, theme]}>
	.mixed {
		--label: mixed;
	}
	div {
		color: blue;
	}
</style>;

export const bundle = <style apply={[theme, themes.dark]} />;

export function CrossModule({ active }: { active: boolean }) @{
	<>
		<style apply={[theme, themes.dark]} />
		<style>
			.scope {
				--label: scope;
			}
			div {
				color: black;
			}
		</style>
		<div class="x1 scope">{'x'}</div>
		<p class={active ? 'on' : 'off'}>@{
			<>
				<style>
					.nested {
						--label: nested;
					}
				</style>
				<b class="x2 nested">{'n'}</b>
			</>
		}</p>
	</>
}
