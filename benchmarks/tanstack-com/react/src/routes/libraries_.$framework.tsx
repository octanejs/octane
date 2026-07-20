import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import { type Framework, type Library } from '~/libraries';
import { frameworkOptions } from '~/libraries/frameworks';
import LibraryCard from '~/components/LibraryCard';
import {
	getFrameworkLibraryCounts,
	getVisibleLibraries,
	orderFrameworksForBrowse,
	orderLibrariesForBrowse,
} from './-libraries-utils';

export const Route = createFileRoute('/libraries_/$framework')({
	loader: ({ params }) => {
		const frameworkOption = getFrameworkOption(params.framework);

		if (!frameworkOption) {
			throw notFound();
		}

		return {
			framework: frameworkOption,
		};
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.framework
					? `TanStack ${loaderData.framework.label} Libraries`
					: 'TanStack Libraries by Framework',
			},
			{
				name: 'description',
				content: loaderData?.framework
					? `Type-safe TanStack libraries for ${loaderData.framework.label}: routing, server state, tables, forms, virtualization, sync, AI, and tooling.`
					: 'Browse TanStack libraries by framework.',
			},
		],
	}),
	component: LibrariesFrameworkPage,
});

function LibrariesFrameworkPage() {
	const { framework } = Route.useParams();
	const { framework: frameworkOption } = Route.useLoaderData();

	const allLibraries = getVisibleLibraries();
	const frameworkCounts = getFrameworkLibraryCounts(allLibraries);
	const frameworksWithLibraries = orderFrameworksForBrowse(
		frameworkOptions.filter((option) => (frameworkCounts[option.value] ?? 0) > 0),
		frameworkCounts,
	);
	const filteredLibraries = orderLibrariesForBrowse(
		allLibraries.filter((library) => library.frameworks.includes(framework as Framework)),
	);
	const count = filteredLibraries.length;

	return (
		<div className="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto py-10">
			<div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
				<Link to="/libraries" className="hover:text-blue-500 transition-colors">
					All Libraries
				</Link>
				<span>/</span>
				<span className="text-gray-900 dark:text-white">{frameworkOption.label}</span>
			</div>

			<div className="mt-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
				<div>
					<div className="flex items-center gap-3">
						<img src={frameworkOption.logo} alt="" className="h-10 w-10 object-contain" />
						<h1 className="text-4xl font-black leading-tight">
							TanStack {frameworkOption.label} libraries
						</h1>
					</div>
					<p className="mt-3 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-400">
						Type-safe, headless TanStack primitives with {frameworkOption.label} support for
						routing, data, UI, performance, and tooling.
					</p>
				</div>

				<div
					className={twMerge(
						'inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm',
						frameworkOption.color,
					)}
				>
					{count} {count === 1 ? 'library' : 'libraries'}
				</div>
			</div>

			<section className="mt-8">
				<h2 className="text-xl font-black">Switch framework</h2>
				<div className="mt-4 flex flex-wrap gap-3">
					{frameworksWithLibraries.map((option) => {
						const optionCount = frameworkCounts[option.value] ?? 0;
						const isActive = option.value === frameworkOption.value;

						return (
							<Link
								key={option.value}
								to="/libraries/$framework"
								params={{
									framework: option.value,
								}}
								className={twMerge(
									'group inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-current hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100',
									isActive && 'border-current ring-2 ring-gray-900/10 dark:ring-white/15',
								)}
							>
								<img src={option.logo} alt="" loading="lazy" className="h-5 w-5 object-contain" />
								<span>{option.label}</span>
								<span className="text-gray-500 dark:text-gray-400">
									{optionCount} {optionCount === 1 ? 'library' : 'libraries'}
								</span>
							</Link>
						);
					})}
				</div>
			</section>

			{filteredLibraries.length > 0 ? (
				<div
					className={`grid grid-cols-1 gap-6 gap-y-8 justify-center mt-8
           lg:grid-cols-2`}
				>
					{filteredLibraries.map((library, i) => {
						return (
							<LibraryCard
								key={library.id}
								library={library as Library}
								index={i}
								namePrefix={frameworkOption.label}
							/>
						);
					})}
				</div>
			) : (
				<div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
					No TanStack libraries currently list a {frameworkOption.label} adapter.
				</div>
			)}
		</div>
	);
}

function getFrameworkOption(framework: string) {
	return frameworkOptions.find((option) => option.value === framework);
}
