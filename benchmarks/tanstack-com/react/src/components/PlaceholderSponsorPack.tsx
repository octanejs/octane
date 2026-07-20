function createBubbleStyle(index: number) {
	const left = ((index * 37) % 100) / 100;
	const top = ((index * 61) % 100) / 100;
	const size = 20 + ((index * 17) % 90);
	const opacity = 0.14 + ((index * 13) % 12) / 100;

	return {
		left: `${8 + left * 84}%`,
		top: `${6 + top * 88}%`,
		width: `${size}px`,
		height: `${size}px`,
		opacity,
	};
}

export default function PlaceholderSponsorPack() {
	return (
		<div className="relative w-full h-full overflow-hidden rounded-[2rem] bg-linear-to-br from-gray-100/80 via-white to-gray-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
			{Array.from({ length: 48 }).map((_, index) => {
				const style = createBubbleStyle(index);

				return (
					<div
						key={index}
						className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-300/30 bg-gray-300/40 dark:border-gray-700/40 dark:bg-gray-700/30"
						style={style}
					/>
				);
			})}
		</div>
	);
}
