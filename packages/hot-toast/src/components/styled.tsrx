// Octane stand-in for the goober `styled('div')` components react-hot-toast@2.6.1
// builds after `setup(React.createElement)`. Element construction is authored
// here instead of going through goober's global pragma, so the port never calls
// goober's `setup()` and leaves any application pragma in place. goober's own
// `css` still compiles and injects every rule.
//
// goober names a class by hashing its template text, and react-hot-toast's
// published build (esbuild-minify-templates) collapses every whitespace run in
// its template literals. The port's templates carry that collapsed text, so its
// class names and injected stylesheet are the ones react-hot-toast@2.6.1 ships.
import { css } from '../goober.js';
import type { ComponentProps } from 'octane';

type Interpolation<T> = string | number | ((props: StyledDivProps<T>) => string | number);

// goober types className as a string, so the clsx-style forms Octane's hosts
// accept are not part of this contract.
export type StyledDivProps<T = {}> = Omit<ComponentProps<'div'>, 'className'> & {
	className?: string;
} & T;

// As goober's styled: interpolations read the element's props, the generated
// class comes before a caller's className (and its rules are prepended when that
// className already carries a goober class), and every prop reaches the div.
export function styledDiv<T extends object = {}>(
	template: TemplateStringsArray,
	...interpolations: Interpolation<T>[]
) {
	return function Styled(props: StyledDivProps<T>) @{
		const { className: previous, children, ...rest } = props;
		const generated = css.call(
			{ p: props, o: /go\d/.test(previous ?? '') },
			template,
			...(interpolations as (string | number)[]),
		);
		<div {...rest} className={previous ? generated + ' ' + previous : generated}>
			{children}
		</div>
	};
}
