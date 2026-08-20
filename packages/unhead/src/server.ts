import type { OctaneNode } from 'octane';
import type { UniversalUnheadProviderProps } from './context';
import { createElement } from 'octane';
import { UnheadContext } from './context';

export {
	createHead,
	type PreparedTemplate,
	prepareTemplate,
	renderSSRHead,
	transformHtmlTemplate,
} from 'unhead/server';

export type UnheadProviderProps = UniversalUnheadProviderProps;

export function UnheadProvider(props: UnheadProviderProps): OctaneNode {
	return createElement(UnheadContext.Provider, { value: props.value }, props.children);
}

export type { CreateServerHeadOptions, SSRHeadPayload, Unhead } from 'unhead/types';
