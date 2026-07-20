import { useLocalCurrentFramework } from '../FrameworkSelect';
import { useCurrentUserQuery } from '~/hooks/useCurrentUser';
import { useParams } from '@tanstack/react-router';
import type { Framework } from '~/libraries/types';
import { Children, isValidElement, type ReactNode } from 'react';

type FrameworkContentProps = {
	children?: ReactNode;
};

function isFrameworkPanel(child: ReactNode): child is React.ReactElement<{
	'data-framework': string;
	children?: ReactNode;
}> {
	return (
		isValidElement<{ 'data-framework'?: string }>(child) &&
		typeof child.props['data-framework'] === 'string'
	);
}

export function FrameworkContent({ children }: FrameworkContentProps) {
	const { framework: paramsFramework } = useParams({ strict: false });
	const localCurrentFramework = useLocalCurrentFramework();
	const userQuery = useCurrentUserQuery();
	const userFramework = userQuery.data?.lastUsedFramework;

	const actualFramework = (paramsFramework ||
		userFramework ||
		localCurrentFramework.currentFramework ||
		'react') as Framework;

	const normalizedFramework = actualFramework.toLowerCase();
	const panels = Children.toArray(children).filter(isFrameworkPanel);
	const fallbackPanel = panels[0];
	const activePanel =
		panels.find((child) => child.props['data-framework'] === normalizedFramework) || fallbackPanel;

	if (!activePanel || !isValidElement(activePanel)) {
		return null;
	}

	return <div className="framework-content">{activePanel.props.children}</div>;
}
