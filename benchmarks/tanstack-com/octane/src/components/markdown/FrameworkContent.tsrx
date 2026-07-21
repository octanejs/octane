import { useLocalCurrentFramework } from '../FrameworkSelect.tsrx';
import { useCurrentUserQuery } from '~/hooks/useCurrentUser';
import { useParams } from '@octanejs/tanstack-router';
import type { Framework } from '~/libraries/types';
import { Children, isValidElement } from 'octane';

type FrameworkContentProps = {
	children?: any;
};

function isFrameworkPanel(child: any): child is {
	props: { 'data-framework': string; children?: any };
} {
	return isValidElement(child) && typeof (child as any).props['data-framework'] === 'string';
}

export function FrameworkContent({ children }: FrameworkContentProps) {
	const { framework: paramsFramework } = useParams({ strict: false });
	const localCurrentFramework = useLocalCurrentFramework();
	const userQuery = useCurrentUserQuery();
	const userFramework = userQuery.data?.lastUsedFramework;

	const actualFramework =
		paramsFramework || userFramework || localCurrentFramework.currentFramework ||
			'react' as Framework;

	const normalizedFramework = actualFramework.toLowerCase();
	const panels = Children.toArray(children).filter(isFrameworkPanel);
	const fallbackPanel = panels[0];
	const activePanel =
		panels.find((child) => child.props['data-framework'] === normalizedFramework) || fallbackPanel;

	if (!activePanel || !isValidElement(activePanel)) {
		return null;
	}

	return <div class="framework-content">{activePanel.props.children}</div>;
}
