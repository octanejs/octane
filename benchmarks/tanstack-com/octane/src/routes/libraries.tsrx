import { Link, createFileRoute } from '@octanejs/tanstack-router';
import { type Library } from '~/libraries';
import { frameworkOptions } from '~/libraries/frameworks';
import { reactChartsProject } from '~/libraries/react-charts';
import LibraryCard from '~/components/LibraryCard.tsrx';
import {
	getFrameworkLibraryCounts,
	getVisibleLibraries,
	orderFrameworksForBrowse,
	orderLibrariesForBrowse,
} from './-libraries-utils';

export const Route = createFileRoute('/libraries')({
	component: LibrariesPage,
	head: () => ({
		meta: [
			{ title: 'TanStack Libraries: Type-Safe Tools for Modern Web Apps' },
			{
				name: 'description',
				content: 'Explore TanStack libraries for routing, server state, tables, forms, virtualization, sync, AI, and developer tooling.',
			},
		],
	}),
});

function LibrariesPage() {
	const allLibraries = getVisibleLibraries();
	const ordered = orderLibrariesForBrowse(allLibraries);
	const frameworkCounts = getFrameworkLibraryCounts(allLibraries);
	const frameworksWithLibraries = orderFrameworksForBrowse(
		frameworkOptions.filter((framework) => (frameworkCounts[framework.value] ?? 0) > 0),
		frameworkCounts,
	);
	const deprecatedLibraries = [reactChartsProject];

	return <div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto py-10">
		<div class="max-w-3xl">
			<p class="text-sm font-black uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
				TanStack libraries
			</p>
			<h1 class="mt-3 text-4xl font-black leading-tight sm:text-5xl">
				Headless libraries for the hard parts of web apps.
			</h1>
			<p class="mt-4 text-lg leading-8 text-gray-600 dark:text-gray-400">
				Routes, server state, tables, forms, virtualization, sync, AI, and tooling. Use the pieces
				you need, keep your markup and runtime, and let the stack stay type-safe where apps usually
				drift.
			</p>
		</div>

		<section class="mt-8">
			<h2 class="text-xl font-black">Browse by framework</h2>
			<div class="mt-4 flex flex-wrap gap-3">{frameworksWithLibraries.map((framework) => {
				const count = frameworkCounts[framework.value] ?? 0;

				return <Link
					key={framework.value}
					to="/libraries/$framework"
					params={{
						framework: framework.value,
					}}
					className="group inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-current hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
				>
					<img src={framework.logo} alt="" loading="lazy" class="h-5 w-5 object-contain" />
					<span>
						{framework.label as string}
					</span>
					<span class="text-gray-500 dark:text-gray-400">
						{count}

						{(count === 1 ? 'library' : 'libraries') as string}
					</span>
				</Link>;
			})}</div>
		</section>

		<div
			class={`grid grid-cols-1 gap-6 gap-y-8 justify-center mt-8
        sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3`}
		>{ordered.map((library, i) => {
			return <LibraryCard key={library.id} library={library as Library} index={i} />;
		})}</div>

		{deprecatedLibraries.length > 0 &&
			<>
				<h2 class="text-3xl font-light mt-16 mb-8">Deprecated Libraries</h2>
				<div
					class={`grid grid-cols-1 gap-6 gap-y-8 justify-center
            sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3`}
				>{deprecatedLibraries.map((library, i) => {
					return <LibraryCard
						key={library.id}
						library={library as Library}
						index={i}
						isGeneric={library.id === 'react-charts'}
					/>;
				})}</div>
			</>}
	</div>;
}
