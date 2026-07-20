import { BuilderProvider } from './BuilderProvider';
import { BuilderWorkspace } from './BuilderWorkspace';

export function BuilderPage() {
	return (
		<BuilderProvider>
			<BuilderWorkspace />
		</BuilderProvider>
	);
}
