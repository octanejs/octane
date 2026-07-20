import * as React from 'react';
import { Link } from '@tanstack/react-router';

export type Crumb = { label: string; href?: string };

/**
 * Mono, uppercase breadcrumb trail. Intermediate crumbs link; the current
 * page renders as emphasized plain text.
 */
export function ShopCrumbs({ crumbs }: { crumbs: Array<Crumb> }) {
	return (
		<nav
			aria-label="Breadcrumb"
			className="font-shop-mono text-[11px] tracking-[0.12em] uppercase text-shop-muted flex items-center gap-2 flex-wrap"
		>
			{crumbs.map((crumb, i) => {
				const isLast = i === crumbs.length - 1;
				return (
					<React.Fragment key={`${crumb.label}-${i}`}>
						{crumb.href && !isLast ? (
							<Link
								to={crumb.href}
								className="text-shop-muted hover:text-shop-text transition-colors"
							>
								{crumb.label}
							</Link>
						) : (
							<span
								aria-current={isLast ? 'page' : undefined}
								className={isLast ? 'text-shop-text font-medium' : undefined}
							>
								{crumb.label}
							</span>
						)}
						{isLast ? null : (
							<span aria-hidden="true" className="opacity-40">
								/
							</span>
						)}
					</React.Fragment>
				);
			})}
		</nav>
	);
}
