// Type surface of an assigned <style> block (RFC tsrx-org/RFCs#1): the
// initializer lowers to a class map whose `$class` is the scope class string
// and whose other keys are the block's own class selectors — nothing else.
// Checked with tsrx-tsc like the sibling primary program.
const theme = <style>
	.dark {
		color: purple;
	}
</style>;

type Theme = typeof theme;
type HasKey<K extends PropertyKey> = K extends keyof Theme ? true : false;
type IsString<T> = [T] extends [string] ? ([string] extends [T] ? true : false) : false;

// `$class` and the authored class both exist and are plain (widened) strings.
export const hasClass: HasKey<'$class'> = true;
export const hasDark: HasKey<'dark'> = true;
export const classIsString: IsString<Theme['$class']> = true;
export const darkIsString: IsString<Theme['dark']> = true;
export const scopeClass: string = theme.$class;
export const darkClass: string = theme.dark;

// A key the block never declared is not on the map.
export const hasNope: HasKey<'$nope'> = false;
// @ts-expect-error — `$nope` is not a class of this block
export const nope: string = theme.$nope;

export function Themed() @{
	<div class={theme.$class + ' ' + theme.dark}>{'themed'}</div>
}
