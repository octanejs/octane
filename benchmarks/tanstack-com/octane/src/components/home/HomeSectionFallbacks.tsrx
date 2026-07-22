import { Card } from '~/components/Card.tsrx';

function SectionTitle({ id, title }: { id: string; title: string }) {
	return <h3 id={id} class="text-3xl font-bold mb-6 scroll-mt-24">
		<a
			href={`#${id}`}
			class="hover:underline decoration-gray-400 dark:decoration-gray-600"
		>{title as string}</a>
	</h3>;
}

function SectionBlock({ className }: { className?: string }) {
	return <Card
		aria-hidden="true"
		className={`animate-pulse overflow-hidden ${className ?? 'min-h-[220px]'}`}
	>
		<div
			class="h-full w-full bg-linear-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900"
		/>
	</Card>;
}

export function HomeSocialProofFallback() {
	return <div class="space-y-24 min-h-[1840px] md:min-h-[1260px] lg:min-h-[1180px]">
		<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
			<SectionTitle id="partners" title="Partners" />
			<SectionBlock className="min-h-[360px] md:min-h-[240px]" />
		</div>

		<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
			<div class="space-y-2">
				<div class="h-8 w-56 rounded bg-gray-200 dark:bg-gray-800" />
				<div class="h-5 w-80 max-w-full rounded bg-gray-100 dark:bg-gray-900" />
			</div>
			<div class="mt-8">
				<SectionBlock className="min-h-[420px] md:min-h-[360px]" />
			</div>
		</div>

		<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
			<SectionTitle id="blog" title="Latest Blog Posts" />
			<SectionBlock className="min-h-[420px] md:min-h-[320px]" />
		</div>
	</div>;
}

export function HomeCommunityFallback() {
	return <div class="space-y-24 min-h-[1180px] md:min-h-[780px] lg:min-h-[760px]">
		<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
			<SectionTitle id="maintainers" title="Core Maintainers" />
			<SectionBlock className="min-h-[260px] md:min-h-[220px]" />
		</div>

		<div class="px-4 w-full lg:max-w-(--breakpoint-lg) md:mx-auto">
			<div class="space-y-8">
				<div class="h-10 w-48 rounded bg-gray-200 dark:bg-gray-800" />
				<SectionBlock className="min-h-[320px] md:min-h-[260px]" />
			</div>
		</div>
	</div>;
}

export function HomeNewsletterFallback() {
	return <div class="px-4 mx-auto max-w-(--breakpoint-lg) relative min-h-[330px] md:min-h-[360px]">
		<Card className="rounded-md p-8 min-h-[250px] animate-pulse">
			<div class="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
			<div class="mt-2 h-5 w-56 rounded bg-gray-100 dark:bg-gray-800" />
			<div class="mt-6 grid max-w-sm gap-2">
				<div class="h-12 rounded bg-gray-200 dark:bg-gray-700" />
				<div class="h-4 w-56 rounded bg-gray-100 dark:bg-gray-800" />
			</div>
		</Card>
		<div class="h-20" />
	</div>;
}

export function HomeApplicationStarterFallback() {
	return <div
		aria-hidden="true"
		class="min-h-[320px] overflow-hidden rounded-[1rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 md:min-h-[360px]"
	>
		<div
			class="border-b border-gray-200 bg-gray-50/70 px-5 py-4 dark:border-gray-800 dark:bg-gray-900/50"
		>
			<div class="h-7 w-64 max-w-full rounded bg-gray-200 dark:bg-gray-800" />
			<div class="mt-4 flex flex-wrap gap-2">
				<div class="h-9 w-28 rounded-lg bg-gray-200 dark:bg-gray-800" />
				<div class="h-9 w-32 rounded-lg bg-gray-200 dark:bg-gray-800" />
				<div class="h-9 w-24 rounded-lg bg-gray-200 dark:bg-gray-800" />
			</div>
		</div>

		<div class="relative border-b border-gray-200 dark:border-gray-800">
			<div class="px-5 pt-4">
				<div class="h-3 w-12 rounded bg-gray-200 dark:bg-gray-800" />
			</div>
			<div class="px-5 pb-4 pt-3">
				<div class="h-28 rounded-xl bg-gray-100 dark:bg-gray-900" />
			</div>

			<div class="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
				<div class="flex flex-wrap gap-3">
					<div class="h-10 w-28 rounded-lg bg-gray-200 dark:bg-gray-800" />
					<div class="h-10 w-36 rounded-lg bg-gray-200 dark:bg-gray-800" />
				</div>
			</div>
		</div>
	</div>;
}

export function HomeStatsFallback() {
	return <div
		aria-hidden="true"
		class="mx-auto grid w-full max-w-3xl animate-pulse grid-cols-1 gap-4 sm:grid-cols-3"
	>{Array.from({ length: 3 }).map(
		(_, index) => <div
			key={index}
			class="min-w-0 rounded-r-md border-l-2 border-gray-200 bg-linear-to-r from-transparent to-gray-200/10 px-4 py-2 dark:border-gray-800 dark:to-gray-800/10"
		>
			<div class="flex min-w-0 items-start gap-3">
				<div class="mt-1 h-5 w-5 shrink-0 rounded bg-gray-200 dark:bg-gray-800" />
				<div class="min-w-0">
					<div class="h-7 w-32 rounded bg-gray-200 dark:bg-gray-700" />
					<div class="mt-2 h-4 w-28 rounded bg-gray-100 dark:bg-gray-800" />
				</div>
			</div>
		</div>,
	)}</div>;
}
