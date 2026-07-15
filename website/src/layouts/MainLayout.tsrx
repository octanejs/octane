// Root layout: the shell every route renders inside — header, the routed page,
// and (except on the playground, which fills the viewport) the footer. The bar
// itself lives in Header.tsrx; this component only owns the shell frame.
import { Outlet, useLocation } from '@octanejs/tanstack-router';
import { Header } from '../components/Header.tsrx';
import { Footer } from '../components/Footer.tsrx';

export function MainLayout() @{
	const pathname = useLocation({ select: (l: any) => l.pathname });
	const showFooter = pathname !== '/playground';

	<div class="shell">
		<Header />
		<main class="main">
			<Outlet />
		</main>
		@if (showFooter) {
			<Footer />
		}
		<style>
			.shell {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
			}
			.main {
				flex: 1;
				width: 100%;
			}
		</style>
	</div>
}
