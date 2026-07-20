import { twMerge } from 'tailwind-merge';

/** Animated green dot — signals "live" / "in stock". Keyframes in shop.css. */
export function ShopPulse({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={twMerge(
				'inline-block w-[7px] h-[7px] rounded-full bg-shop-green shrink-0',
				'[animation:shop-pulse_1.8s_infinite]',
				className,
			)}
		/>
	);
}
