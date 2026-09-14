import { enableStaticRendering } from '@octanejs/mobx';
import { renderToString } from 'octane/server';
import { InteractiveList, type ListProps } from './interaction.tsrx';

export function renderList(props: ListProps) {
	enableStaticRendering(true);
	try {
		return renderToString(InteractiveList, props);
	} finally {
		enableStaticRendering(false);
	}
}
