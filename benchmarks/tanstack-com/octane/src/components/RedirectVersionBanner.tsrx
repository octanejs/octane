import { useLocalStorage } from '~/utils/useLocalStorage';
import { useMounted } from '~/hooks/useMounted';
import { Link, useMatches } from '@octanejs/tanstack-router';
import { Button } from '~/ui';

export function RedirectVersionBanner(props: { version: string; latestVersion: string }) {
	const { version, latestVersion } = props;

	const matches = useMatches();
	const activeMatch = matches[matches.length - 1];

	// After user clicks hide, do not show modal for a month, and then remind users that there is a new version!
	const [showModal, setShowModal] = useLocalStorage(
		'showRedirectToLatestModal',
		true,
		1000 * 60 * 24 * 30,
	);

	if (!useMounted()) {
		return null;
	}

	if (![latestVersion, 'latest'].includes(version) && showModal) {
		return <div
			class="p-4 bg-white/70 text-black dark:bg-gray-500/40 dark:text-white shadow-lg flex items-center justify-center gap-2.5 lg:gap-4 fixed top-4 left-1/2 bottom-auto backdrop-blur-sm z-100 -translate-x-1/2 rounded-3xl lg:rounded-full overflow-hidden w-[80%] lg:w-auto"
		>
			<p class="block">
				You are currently reading
				<strong>{version as string}</strong>
				docs. Redirect to
				{' '}
				<Link
					to={activeMatch.fullPath as never}
					params={{ version: 'latest' } as never}
					className="font-bold underline"
				>
					latest
				</Link>
				{' '}
				version?
			</p>
			<div class="flex gap-2 flex-col lg:flex-row items-center">
				<Button
					as={Link}
					to={activeMatch.fullPath as never}
					params={{ version: 'latest' } as never}
					replace
					variant="secondary"
					className="w-full lg:w-auto justify-center"
				>
					Latest
				</Button>
				<Button
					variant="secondary"
					onClick={() => setShowModal(false)}
					className="w-full lg:w-auto justify-center"
				>
					Hide
				</Button>
			</div>
		</div>;
	}

	return null;
}
