// Ported from styled-components 6.4.3 (MIT), adapted for octane: component
// targets infer props from their function signature (`TargetProps`) instead of
// `React.ComponentPropsWithRef`, and host tags rely on the permissive
// polymorphic call surface (octane has no `JSX.IntrinsicElements` map).
import createStyledComponent from '../models/StyledComponent';
import { BaseObject, KnownTarget, TargetProps, WebTarget } from '../types';
import domElements, { SupportedHTMLElements } from '../utils/domElements';
import constructWithOptions, { Styled as StyledInstance } from './constructWithOptions';

/**
 * Create a styled component from an HTML element or octane component.
 *
 * ```tsx
 * const Button = styled.button`color: red;`;
 * const Link = styled(RouterLink)`text-decoration: none;`;
 * ```
 */
const baseStyled = <Target extends WebTarget, InjectedProps extends object = BaseObject>(
	tag: Target,
) =>
	constructWithOptions<
		'web',
		Target,
		Target extends KnownTarget ? TargetProps<Target> & InjectedProps : InjectedProps
	>(createStyledComponent, tag);

const styled = baseStyled as typeof baseStyled & {
	[E in SupportedHTMLElements]: StyledInstance<'web', E, BaseObject>;
};

// Shorthands for all valid HTML Elements.
// The type assertion avoids 120 Styled<> instantiations during type checking -
// the correct types are declared on the `styled` const above via the mapped type.
domElements.forEach((domElement) => {
	(styled as any)[domElement] = baseStyled(domElement);
});

export default styled;
export type { StyledInstance };

/**
 * This is the type of the `styled` HOC.
 */
export type Styled = typeof styled;

/**
 * Use this higher-order type for scenarios where you are wrapping `styled`
 * and providing extra props as a third-party library.
 */
export type LibraryStyled<LibraryProps extends object = BaseObject> = <Target extends WebTarget>(
	tag: Target,
) => typeof baseStyled<Target, LibraryProps>;
