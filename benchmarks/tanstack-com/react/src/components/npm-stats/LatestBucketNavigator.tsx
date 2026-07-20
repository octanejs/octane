import * as React from 'react';
import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	MoreHorizontal,
	Pause,
	Play,
} from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import {
	binningOptionsByType,
	getLatestBucketOffsetBounds,
	getLatestBucketOffsetOptions,
} from './binning';
import {
	defaultPlaybackIntervalMs,
	maxPlaybackIntervalMs,
	type BinType,
	type TimeRange,
} from './shared';

const playbackSpeedOptions = [
	{ label: 'Slow', intervalMs: 800 },
	{ label: 'Medium', intervalMs: 350 },
	{ label: 'Fast', intervalMs: 150 },
	{ label: 'Very Fast', intervalMs: 75 },
	{ label: 'Very Very Fast', intervalMs: 35 },
] as const;

const navigatorButtonStyles =
	'flex size-6 items-center justify-center hover:bg-gray-500/10 disabled:cursor-not-allowed disabled:opacity-40';
const borderedNavigatorButtonStyles = `${navigatorButtonStyles} border-l border-gray-500/15`;
const menuItemStyles =
	'flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs outline-none hover:bg-gray-500/20 data-highlighted:bg-gray-500/20 data-highlighted:text-blue-500';

export type LatestBucketNavigatorProps = {
	binType: BinType;
	range: TimeRange;
	bucketOffset: number;
	isLooping: boolean;
	isPlaying: boolean;
	playbackIntervalMs: number;
	onBucketOffsetChange: (bucketOffset: number) => void;
	onLoopingChange: (isLooping: boolean) => void;
	onPlaybackIntervalChange: (playbackIntervalMs: number) => void;
	onPlayingChange: (isPlaying: boolean) => void;
};

export function LatestBucketNavigator({
	binType,
	range,
	bucketOffset,
	isLooping,
	isPlaying,
	playbackIntervalMs,
	onBucketOffsetChange,
	onLoopingChange,
	onPlaybackIntervalChange,
	onPlayingChange,
}: LatestBucketNavigatorProps) {
	const bucketSelectId = React.useId();
	const bucketRangeListId = React.useId();
	const playbackIntervalInputId = React.useId();
	const pendingRestartRef = React.useRef(false);
	const [playbackIntervalInput, setPlaybackIntervalInput] = React.useState(
		`${defaultPlaybackIntervalMs}`,
	);
	const bounds = getLatestBucketOffsetBounds({ binType, range });
	const bucketOptions = React.useMemo(
		() => getLatestBucketOffsetOptions({ binType, range }),
		[binType, range],
	);
	const clampedBucketOffset = Math.max(bounds.minOffset, Math.min(bucketOffset, bounds.maxOffset));
	const binLabel = binningOptionsByType[binType].single;
	const canGoBack = clampedBucketOffset > bounds.minOffset;
	const canGoForward = clampedBucketOffset < bounds.maxOffset;
	const canPlay = bounds.minOffset < bounds.maxOffset;

	React.useEffect(() => {
		if (!canPlay && isPlaying) {
			onPlayingChange(false);
		}
	}, [canPlay, isPlaying, onPlayingChange]);

	React.useEffect(() => {
		setPlaybackIntervalInput(`${playbackIntervalMs}`);
	}, [playbackIntervalMs]);

	React.useEffect(() => {
		pendingRestartRef.current = false;
	}, [binType, range]);

	React.useEffect(() => {
		if (pendingRestartRef.current && clampedBucketOffset < bounds.maxOffset) {
			pendingRestartRef.current = false;
		}
	}, [bounds.maxOffset, clampedBucketOffset]);

	React.useEffect(() => {
		if (!isPlaying || !canPlay) return;

		if (pendingRestartRef.current && clampedBucketOffset >= bounds.maxOffset) {
			return;
		}

		if (clampedBucketOffset >= bounds.maxOffset) {
			if (!isLooping) {
				onPlayingChange(false);
				return;
			}

			const timeoutId = window.setTimeout(() => {
				onBucketOffsetChange(bounds.minOffset);
			}, playbackIntervalMs);

			return () => window.clearTimeout(timeoutId);
		}

		const timeoutId = window.setTimeout(() => {
			onBucketOffsetChange(clampedBucketOffset + 1);
		}, playbackIntervalMs);

		return () => window.clearTimeout(timeoutId);
	}, [
		bounds.maxOffset,
		bounds.minOffset,
		canPlay,
		clampedBucketOffset,
		isLooping,
		isPlaying,
		onBucketOffsetChange,
		onPlayingChange,
		playbackIntervalMs,
	]);

	const handleTogglePlayback = () => {
		if (!canPlay) return;

		if (isPlaying) {
			onPlayingChange(false);
			pendingRestartRef.current = false;
			return;
		}

		if (clampedBucketOffset >= bounds.maxOffset) {
			pendingRestartRef.current = true;
			onBucketOffsetChange(bounds.minOffset);
		}

		onPlayingChange(true);
	};
	const handlePlaybackIntervalInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setPlaybackIntervalInput(value);

		const nextInterval = Number(value);
		if (
			Number.isInteger(nextInterval) &&
			nextInterval > 0 &&
			nextInterval <= maxPlaybackIntervalMs
		) {
			onPlaybackIntervalChange(nextInterval);
		}
	};

	return (
		<>
			<label className="sr-only" htmlFor={bucketSelectId}>
				Select {binLabel}
			</label>
			<div className="relative min-w-36">
				<select
					className="h-6 w-full appearance-none rounded border border-gray-500/15 bg-white/80 pl-2 pr-6 text-xs font-medium text-gray-800 shadow-xs outline-none hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:bg-gray-900/70 dark:text-gray-100 dark:hover:bg-gray-900"
					id={bucketSelectId}
					onChange={(event) => onBucketOffsetChange(Number(event.currentTarget.value))}
					value={clampedBucketOffset}
				>
					{bucketOptions.map((option) => (
						<option key={option.offset} value={option.offset}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-gray-500" />
			</div>
			<div className="flex items-center overflow-hidden rounded border border-gray-500/15 bg-white/70 shadow-xs dark:bg-gray-900/70">
				<button
					aria-label={`First ${binLabel}`}
					className={navigatorButtonStyles}
					disabled={!canGoBack}
					onClick={() => onBucketOffsetChange(bounds.minOffset)}
					type="button"
				>
					<ChevronsLeft className="size-3.5" />
				</button>
				<button
					aria-label={`Previous ${binLabel}`}
					className={borderedNavigatorButtonStyles}
					disabled={!canGoBack}
					onClick={() => onBucketOffsetChange(clampedBucketOffset - 1)}
					type="button"
				>
					<ChevronLeft className="size-3.5" />
				</button>
				<button
					aria-label={`Next ${binLabel}`}
					className={borderedNavigatorButtonStyles}
					disabled={!canGoForward}
					onClick={() => onBucketOffsetChange(clampedBucketOffset + 1)}
					type="button"
				>
					<ChevronRight className="size-3.5" />
				</button>
				<button
					aria-label={`Last ${binLabel}`}
					className={borderedNavigatorButtonStyles}
					disabled={!canGoForward}
					onClick={() => onBucketOffsetChange(bounds.maxOffset)}
					type="button"
				>
					<ChevronsRight className="size-3.5" />
				</button>
			</div>
			<div className="flex max-w-[348px] flex-1 items-center overflow-hidden rounded border border-gray-500/15 bg-white/70 shadow-xs dark:bg-gray-900/70">
				<button
					aria-label={isPlaying ? 'Pause bucket playback' : 'Play buckets'}
					aria-pressed={isPlaying}
					className={navigatorButtonStyles}
					disabled={!canPlay}
					onClick={handleTogglePlayback}
					type="button"
				>
					{isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
				</button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							aria-label="Bucket playback options"
							className={borderedNavigatorButtonStyles}
							type="button"
						>
							<MoreHorizontal className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="z-50 min-w-[160px] rounded-md bg-white p-1.5 shadow-lg dark:bg-gray-800"
						collisionPadding={8}
						sideOffset={5}
					>
						<div className="mb-1 flex items-center justify-between px-0.5 text-xs font-medium">
							<span>Playback Speed</span>
						</div>
						{playbackSpeedOptions.map((option) => (
							<DropdownMenuItem
								className={menuItemStyles}
								key={option.intervalMs}
								onSelect={() => onPlaybackIntervalChange(option.intervalMs)}
							>
								<Check
									className={
										option.intervalMs === playbackIntervalMs
											? 'size-3 opacity-100'
											: 'size-3 opacity-0'
									}
								/>
								<span>{option.label}</span>
							</DropdownMenuItem>
						))}
						<div className="mt-1 px-0.5 pb-1">
							<label className="mb-1 block text-xs font-medium" htmlFor={playbackIntervalInputId}>
								Custom ms
							</label>
							<input
								className="h-6 w-full rounded border border-gray-500/20 bg-transparent px-1.5 text-xs outline-none focus:border-blue-500"
								id={playbackIntervalInputId}
								max={maxPlaybackIntervalMs}
								min={1}
								onChange={handlePlaybackIntervalInputChange}
								onKeyDown={(event) => event.stopPropagation()}
								step={1}
								type="number"
								value={playbackIntervalInput}
							/>
						</div>
						<div className="my-1 h-px bg-gray-500/20" />
						<DropdownMenuItem
							className={menuItemStyles}
							onSelect={() => onLoopingChange(!isLooping)}
						>
							<Check className={isLooping ? 'size-3 opacity-100' : 'size-3 opacity-0'} />
							<span>Loop</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="flex h-6 min-w-36 max-w-[300px] flex-1 items-center border-l border-gray-500/15 bg-gray-500/5 px-1.5">
					<input
						aria-label={`Scrub ${binLabel}s`}
						className="block h-6 w-full appearance-none bg-transparent outline-none
              [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:shadow-md
              [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-gray-500/15
              [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-gray-500/15
              [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-md
              dark:[&::-moz-range-thumb]:border-gray-900 dark:[&::-moz-range-track]:bg-gray-100/15
              dark:[&::-webkit-slider-runnable-track]:bg-gray-100/15 dark:[&::-webkit-slider-thumb]:border-gray-900"
						list={bucketRangeListId}
						max={bounds.maxOffset}
						min={bounds.minOffset}
						onChange={(event) => onBucketOffsetChange(Number(event.currentTarget.value))}
						step={1}
						type="range"
						value={clampedBucketOffset}
					/>
				</div>
			</div>
			<datalist id={bucketRangeListId}>
				{bucketOptions.map((option) => (
					<option key={option.offset} value={option.offset} />
				))}
			</datalist>
		</>
	);
}
