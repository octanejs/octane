import { Link } from '@octanejs/tanstack-router';
import { GithubIcon } from '~/components/icons/GithubIcon.tsrx';

export function LandingEcosystemProof() {
	return <div
		class="mt-5 flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-zinc-300 pl-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
	>
		<span class="inline-flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
			<GithubIcon className="h-3.5 w-3.5" />
			Built in public
		</span>
		<Link to="/partners" className="font-semibold hover:text-zinc-950 dark:hover:text-white">
			Partner-backed
		</Link>
		<Link to="/support" className="font-semibold hover:text-zinc-950 dark:hover:text-white">
			Sponsor-supported
		</Link>
	</div>;
}
