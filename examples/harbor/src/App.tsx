// The React 19 shell. React owns the page — providers, header state, error
// boundary, layout — and mounts three compiled Octane islands through
// OctaneCompat. Both authoring forms appear below and BOTH are fully typed
// against each island's own octane-typed signature: the element-child form
// (PriceBadge) and the `component`/`props` transport form (the other two).
// The Compat component arrives AS A PROP: entry-server passes the
// octane/react/server variant, entry-client the octane/react one, with
// identical trees and island props on both sides.
import { useEffect, useState } from 'react';
import type { OctaneCompat } from 'octane/react';
import {
	LocaleContext,
	ThemeContext,
	type HarborLocale,
	type HarborTheme,
} from './shell/contexts.ts';
import { Header } from './shell/Header.tsx';
import { IslandErrorBoundary } from './shell/ErrorBoundary.tsx';
import { FEATURED_PLAN, PLANS } from './data/plans.ts';
import { resetRecommendations } from './data/resources.ts';
import { PriceBadge } from './islands/PriceBadge.tsrx';
import { PlanConfigurator, type CompareEntry } from './islands/PlanConfigurator.tsrx';
import { Recommendations } from './islands/Recommendations.tsrx';

export interface AppProps {
	url: string;
	/** The environment's OctaneCompat variant — client and server share one public type. */
	Compat: typeof OctaneCompat;
}

function faultScenarioFrom(url: string): string | null {
	const query = url.split('?')[1];
	if (!query) return null;
	return new URLSearchParams(query).get('fault');
}

export function App({ url, Compat }: AppProps) {
	const [locale, setLocale] = useState<HarborLocale>('en-US');
	const [theme, setTheme] = useState<HarborTheme>('light');
	const [compares, setCompares] = useState<CompareEntry[]>([]);
	const [recsGeneration, setRecsGeneration] = useState(0);
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	// Stable identity across renders is part of the island-props contract; the
	// updater form keeps this callback closure-free.
	const [onAddToCompare] = useState(
		() => (entry: CompareEntry) => setCompares((current) => [...current, entry]),
	);

	const faultScenario = faultScenarioFrom(url);

	return (
		<LocaleContext.Provider value={locale}>
			<ThemeContext.Provider value={theme}>
				<div className="page" data-app-hydrated={hydrated ? 'true' : 'false'}>
					<Header
						compareCount={compares.length}
						onToggleLocale={() => setLocale(locale === 'en-US' ? 'de-DE' : 'en-US')}
						onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
					/>
					<main className="plans">
						{PLANS.map((plan) => (
							<article className="plan-card" data-plan={plan.id} key={plan.id}>
								<h2 className="plan-name">{plan.name}</h2>
								<p className="plan-tagline">{plan.tagline}</p>
								{plan.id === FEATURED_PLAN.id ? (
									<Compat>
										<PriceBadge pricePerSeat={plan.pricePerSeat} />
									</Compat>
								) : (
									<p className="plan-static-price">{'$' + plan.pricePerSeat + ' / seat / month'}</p>
								)}
							</article>
						))}
						<Compat component={PlanConfigurator} props={{ plan: FEATURED_PLAN, onAddToCompare }} />
						<IslandErrorBoundary
							onRetry={() => {
								resetRecommendations(FEATURED_PLAN.id);
								setRecsGeneration(recsGeneration + 1);
							}}
						>
							{/* The key bump replaces the island wholesale on retry — a clean
							    remount whose seeded resources read synchronously again. */}
							<Compat
								key={'recs-' + recsGeneration}
								component={Recommendations}
								props={{ plan: FEATURED_PLAN, faultScenario }}
							/>
						</IslandErrorBoundary>
						{compares.length > 0 && (
							<aside className="compare-summary">
								<h2 className="compare-title">In comparison</h2>
								<ul className="compare-list">
									{compares.map((entry, index) => (
										<li className="compare-entry" key={index}>
											{entry.planId + ' · ' + entry.seats + ' seats'}
										</li>
									))}
								</ul>
							</aside>
						)}
					</main>
				</div>
			</ThemeContext.Provider>
		</LocaleContext.Provider>
	);
}
