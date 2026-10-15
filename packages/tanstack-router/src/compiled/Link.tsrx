'use strong';

import { createUseLinkProps } from '../linkBinding';
import { createLinkComponent } from '../linkComponent.tsrx';
import { useRouter } from './bindings';
import type { createLink as StandardCreateLink } from '../link';

export const useLinkProps = createUseLinkProps(useRouter);
export const Link = createLinkComponent(useLinkProps);

export const createLink: typeof StandardCreateLink = (Component: any) => {
	function CreatedLink(props: any) @{
		<Link {...props} _asChild={Component} />
	}
	return CreatedLink as any;
};
