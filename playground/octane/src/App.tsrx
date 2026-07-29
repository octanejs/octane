// Playground shell: the shadcn Sidebar beside a stage, with the URL deciding
// which demo is on screen so any example can be linked to and reloaded into.
import { useEffect } from 'octane';
import { DemoNav } from './components/DemoNav.tsrx';
import { DemoStage } from './components/DemoStage.tsrx';
import { ThemeToggle } from './components/theme-toggle.tsrx';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.tsrx';
import { resolveDemo } from './catalog';
import { useHashRoute } from './lib/hash-route';

export function App() @{
	const [route, navigate] = useHashRoute();
	const demo = resolveDemo(route);

	// A stale or mistyped link renders the fallback demo; rewrite the URL to
	// match so what is shared next points at what is actually on screen.
	useEffect(() => {
		if (route !== demo.id) navigate(demo.id, { replace: true });
	}, [route, demo.id]);

	<SidebarProvider>
		<DemoNav activeId={demo.id} onSelect={navigate} />
		<SidebarInset>
			<header class="demo-header">
				<SidebarTrigger />
				<div class="demo-header-titles">
					<h1>{'octane playground'}</h1>
					<p>{'Template-clone renderer + TSRX directives. Each demo exercises a distinctive corner of the surface.'}</p>
				</div>
				<ThemeToggle />
			</header>
			<DemoStage demo={demo} />
		</SidebarInset>
	</SidebarProvider>
}
