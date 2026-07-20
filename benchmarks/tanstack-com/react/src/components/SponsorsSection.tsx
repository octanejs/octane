import * as React from 'react';
import { Await } from '@tanstack/react-router';
import { Spinner } from '~/components/Spinner';
import SponsorPack from '~/components/SponsorPack';
import { Button } from '~/ui';
import { twMerge } from 'tailwind-merge';

type SponsorsSectionProps = {
	sponsorsPromise: Promise<any>;
	title?: string;
	aspectRatio?: string;
	showCTA?: boolean;
	ctaClassName?: string;
};

export function SponsorsSection({
	sponsorsPromise,
	title = 'Sponsors',
	aspectRatio = '1/1',
	showCTA = true,
	ctaClassName = 'bg-emerald-500 border-emerald-500 hover:bg-emerald-600 text-white',
}: SponsorsSectionProps) {
	return (
		<div className="relative text-lg overflow-hidden">
			<h3 className="text-center text-3xl leading-8 font-extrabold tracking-tight sm:text-4xl sm:leading-10 lg:leading-none mt-8">
				{title}
			</h3>
			<div
				className="my-4 flex flex-wrap mx-auto max-w-(--breakpoint-lg) overflow-hidden"
				style={{ aspectRatio }}
			>
				<Await promise={sponsorsPromise} fallback={<Spinner className="text-3xl" />}>
					{(sponsors: any) => <SponsorPack sponsors={sponsors} />}
				</Await>
			</div>
			{showCTA ? (
				<div className="flex justify-center">
					<Button
						as="a"
						href="https://github.com/sponsors/tannerlinsley"
						className={twMerge('py-2 px-4 text-sm', ctaClassName)}
					>
						Become a Sponsor!
					</Button>
				</div>
			) : null}
		</div>
	);
}
