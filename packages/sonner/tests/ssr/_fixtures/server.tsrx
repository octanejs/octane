import { Toaster } from '@octanejs/sonner';

export function ServerToaster() {
	return <main>
		<h1>Toast host</h1>
		<Toaster theme="system" position="top-center" />
	</main>;
}
