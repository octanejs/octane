import { renderToString } from 'octane/server';
import type { AnyRouter } from '@tanstack/router-core';
import type { ComponentProps, OctaneNode } from 'octane';
import { Link, RouterContextProvider, createLink } from '../../src/index.ts';

type FixtureProps = {
	router: AnyRouter;
	linkProps: Record<string, unknown>;
	children?: OctaneNode | ((state: { isActive: boolean }) => OctaneNode);
	custom?: boolean;
};

function CustomAnchor(props: ComponentProps<'a'> & { disabled?: boolean }) @{
	<a {...props} data-disabled={String(props.disabled)} />
}

const CustomLink = createLink(CustomAnchor);

export function LinkParity(props: FixtureProps) @{
	const Component = props.custom ? CustomLink : Link;
	<RouterContextProvider router={props.router}>
		<Component {...props.linkProps} children={props.children} />
	</RouterContextProvider>
}

export function renderLink(props: FixtureProps) {
	return renderToString(LinkParity, props).html;
}
