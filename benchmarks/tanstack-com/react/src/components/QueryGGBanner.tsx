import headerCourse from '~/images/query-header-course.svg';
import cornerTopLeft from '~/images/query-corner-top-left.svg';
import cornerTopRight from '~/images/query-corner-top-right.svg';
import cornerFishBottomRight from '~/images/query-corner-fish-bottom-right.svg';
import { useQueryGGPPPDiscount } from '~/hooks/useQueryGGPPPDiscount';

export function QueryGGBanner() {
	const ppp = useQueryGGPPPDiscount();

	let body = (
		<>
			<p className="text-lg">
				“If you’re serious about *really* understanding React Query, there’s no better way than with
				query.gg”
			</p>
			<p className="mt-2"> —Tanner Linsley</p>
		</>
	);

	if (ppp) {
		body = (
			<>
				<p className="text-lg font-bold mb-2">
					We noticed you’re in {ppp.flag} {ppp.country}
				</p>
				<p>
					To help make query.gg more globally accessible, you can enable a regional discount of{' '}
					{ppp.discount * 100}% off.
				</p>
			</>
		);
	}

	return (
		<aside className="mx-auto w-full max-w-[1200px] px-8 flex justify-between items-center">
			<div className="w-full xl:flex xl:gap-6 bg-[#f9f4da] border-4 border-[#231f20] relative">
				<a
					href="https://query.gg?s=tanstack"
					className="xl:w-7/12 pb-4 grid grid-cols-[70px_1fr_70px] sm:grid-cols-[100px_1fr_100px] md:grid-cols-[140px_1fr_140px] xl:grid-cols-[110px_1fr] 2xl:grid-cols-[150px_1fr]"
				>
					<img
						src={cornerTopLeft}
						alt="sun"
						width={242}
						height={232}
						loading="lazy"
						decoding="async"
						className="h-auto w-full"
					/>
					<img
						src={headerCourse}
						alt="Query.gg - The Official React Query Course"
						width={316}
						height={136}
						loading="lazy"
						decoding="async"
						className="-mt-px h-auto w-10/12 max-w-[350px] justify-self-center"
					/>
					<img
						src={cornerTopRight}
						alt="moon"
						width={242}
						height={232}
						loading="lazy"
						decoding="async"
						className="h-auto w-full xl:hidden"
					/>
				</a>
				<div className="hidden xl:block w-[80px] mr-[-55px] bg-[#231f20] border-4 border-r-0 border-[#f9f4da] border-s-[#f9f4da] shadow-[-4px_0_0_#231f20] -skew-x-15 z-0"></div>
				<div className="xl:w-5/12 py-2 xl:pb-0 grid xl:grid-cols-[1fr_90px] 2xl:grid-cols-[1fr_120px] justify-center bg-[#231f20] border-2 xl:border-4 xl:border-l-0 border-[#f9f4da] text-[#f9f4da] z-10">
					<div className="my-2 text-center place-self-center">
						{body}
						<a
							href="https://query.gg?s=tanstack"
							className="mt-4 mb-1 xl:mb-2 px-6 py-2 inline-block bg-[#fcba28] text-[#231f20] rounded-full border border-black cursor-pointer font-black"
						>
							{ppp?.discount ? `Get ${ppp.discount * 100}% off` : 'Join now'}
						</a>
					</div>
					<img
						src={cornerFishBottomRight}
						alt="mutated fish"
						width={242}
						height={232}
						loading="lazy"
						decoding="async"
						className="hidden h-auto w-full self-end xl:block"
					/>
				</div>
			</div>
		</aside>
	);
}
