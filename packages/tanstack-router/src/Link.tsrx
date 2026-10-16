import { useRouter } from './context';
import { createUseLinkProps } from './linkBinding';
import { createLinkComponent } from './linkComponent.tsrx';

export const useLinkProps = createUseLinkProps(useRouter);
export const Link = createLinkComponent(useLinkProps);
