import { useLinguiInternal } from './I18nProvider.tsrx';
import { TransNoContext, type TransProps } from './TransNoContext.tsrx';
import type { OctaneNode } from 'octane';

export function Trans(props: TransProps): OctaneNode {
	let errMessage = undefined;
	if (process.env.NODE_ENV !== 'production') {
		errMessage = `Trans component was rendered without I18nProvider. ` +
			`Attempted to render message: ${props.message} id: ${props.id}. ` +
			`Make sure this component is rendered inside a I18nProvider.` +
			`\n\nThis often happens when multiple instances of @lingui/react are installed ` +
			`(e.g. due to a version mismatch or misconfiguration in a monorepo). ` +
			`Verify you have only one version installed by running: ` +
		`npm ls @lingui/react (or pnpm why @lingui/react / yarn why @lingui/react).`;
	}
	const lingui = useLinguiInternal(errMessage);

	return <TransNoContext {...props} lingui={lingui} />;
}
