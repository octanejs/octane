import { createElement } from 'octane';
import type { ComponentBody } from 'octane';
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core';
import { useRouter } from './context';
import { Link } from './Link.tsrx';
import { createUseLinkProps } from './linkBinding';
import type { LinkComponent } from './linkTypes';
import type { ValidateLinkOptions, ValidateLinkOptionsArray } from './typePrimitives';

export const useLinkProps = createUseLinkProps(useRouter);

// Wrap a design-system component so it navigates like <Link> — the component
// receives the fully-built link props (href, handlers, data-status, …).
export function createLink<const TComp extends ComponentBody<any>>(
	Comp: TComp,
): LinkComponent<TComp>;
export function createLink(Comp: any): any {
	return function CreatedLink(props: any) {
		return createElement(Link as any, { ...props, _asChild: Comp });
	};
}

export type LinkOptionsFnOptions<TOptions, TComp, TRouter extends AnyRouter = RegisteredRouter> =
	TOptions extends ReadonlyArray<any>
		? ValidateLinkOptionsArray<TRouter, TOptions, string, TComp>
		: ValidateLinkOptions<TRouter, TOptions, string, TComp>;

export type LinkOptionsFn<TComp> = <const TOptions, TRouter extends AnyRouter = RegisteredRouter>(
	options: LinkOptionsFnOptions<TOptions, TComp, TRouter>,
) => TOptions;

// Identity helper for pre-validating and reusing navigation options.
export const linkOptions: LinkOptionsFn<'a'> = (options) => options as any;
