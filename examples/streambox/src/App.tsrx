import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';
import { createComments, findVideo, VIDEOS } from './seed';
import { readWatchRoute, watchURL } from './router';
import type { CommentRecord, VideoRecord, WatchPanel, WatchRoute } from './types';

type LoadState = 'loading' | 'ready' | 'error';
type CommentSort = 'featured' | 'latest';

const COMMENT_ESTIMATE = () => 132;

function formatTime(value: number): string {
	if (!Number.isFinite(value) || value < 0) return '0:00';
	const totalSeconds = Math.floor(value);
	const minutes = Math.floor(totalSeconds / 60);
	return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function mediaURL(videoId: string): string {
	return `/media/streambox-demo.webm?video=${encodeURIComponent(videoId)}`;
}

function VideoCard(props: {
	video: VideoRecord;
	active: boolean;
	onOpen: (videoId: string) => void;
}) @{
	const video = props.video;
	<a
		class={{ 'video-card': true, 'video-card--active': props.active }}
		href={watchURL(video.id)}
		onClick={(event) => {
			event.preventDefault();
			props.onOpen(video.id);
		}}
		aria-current={props.active ? 'page' : undefined}
	>
		<div class="video-card__art">
			<img src={video.poster} alt="" />
			<span>{video.durationLabel}</span>
		</div>
		<div class="video-card__copy">
			<strong>{video.title}</strong>
			<span>{video.creator}</span>
			<span>{`${video.views} · ${video.published}`}</span>
		</div>
	</a>
}

function CommentList(props: {
	comments: readonly CommentRecord[];
	onJump: (seconds: number) => void;
}) @{
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
		count: props.comments.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: COMMENT_ESTIMATE,
		getItemKey: (index) => props.comments[index]?.id ?? index,
		overscan: 4,
	});

	<div
		class="comments-window"
		ref={scrollRef}
		role="feed"
		aria-label="Virtualized comments"
		aria-busy="false"
		data-testid="comments-window"
	>
		<div
			class="comments-sizer"
			style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}
		>
			@for (const item of virtualizer.getVirtualItems(); key item.key) {
				<article
					class="comment-card"
					data-comment-index={item.index}
					data-comment-id={props.comments[item.index].id}
					ref={virtualizer.measureElement}
					style={{
						position: 'absolute',
						top: '0px',
						left: '0px',
						width: '100%',
						transform: 'translateY(' + item.start + 'px)',
					}}
					aria-posinset={item.index + 1}
					aria-setsize={props.comments.length}
				>
					<div
						class="avatar avatar--comment"
						aria-hidden="true"
					>{props.comments[item.index].initials}</div>
					<div class="comment-card__body">
						<header>
							<strong>{props.comments[item.index].author}</strong>
							<span>{props.comments[item.index].when}</span>
							@if (props.comments[item.index].creatorLiked) {
								<span class="creator-mark">Creator heart</span>
							}
						</header>
						<p>{props.comments[item.index].body}</p>
						<footer>
							<button
								class="timecode"
								type="button"
								onClick={() => props.onJump(props.comments[item.index].timecode)}
							>{formatTime(props.comments[item.index].timecode)}</button>
							<span>{`${props.comments[item.index].likes} likes`}</span>
							<span>
								Conversation #
								{props.comments[item.index].index + 1}
							</span>
						</footer>
					</div>
				</article>
			}
		</div>
	</div>
}

function CommentsPanel(props: {
	comments: readonly CommentRecord[];
	onJump: (seconds: number) => void;
}) @{
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<CommentSort>('featured');
	const visibleComments = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase();
		const matching = props.comments.filter(
			(comment) => `${comment.author} ${comment.body}`.toLocaleLowerCase().includes(normalized),
		);
		if (sort === 'latest') return [...matching].reverse();
		return matching;
	}, [props.comments, query, sort]);

	<section class="panel-card comments-panel" aria-labelledby="comments-heading">
		<div class="panel-heading comments-heading">
			<div>
				<p class="eyebrow">Conversation</p>
				<h2 id="comments-heading">{`${props.comments.length} comments`}</h2>
			</div>
			<div class="comments-tools">
				<label class="search-control search-control--comments">
					<span class="sr-only">Search comments</span>
					<span aria-hidden="true">⌕</span>
					<input
						type="search"
						placeholder="Search comments"
						value={query}
						onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
						aria-label="Search comments"
					/>
				</label>
				<label class="sort-control">
					<span class="sr-only">Sort comments</span>
					<select
						value={sort}
						onChange={(event) => setSort(
							(event.currentTarget as HTMLSelectElement).value as CommentSort,
						)}
						aria-label="Sort comments"
					>
						<option value="featured">Featured</option>
						<option value="latest">Latest</option>
					</select>
				</label>
			</div>
		</div>
		@if (visibleComments.length === 0) {
			<div class="empty-state" role="status">
				<span aria-hidden="true">◎</span>
				<h3>No comments found</h3>
				<p>Try another name or phrase from the conversation.</p>
				<button type="button" onClick={() => setQuery('')}>Clear comment search</button>
			</div>
		} @else {
			<CommentList comments={visibleComments} onJump={props.onJump} />
		}
	</section>
}

export function App() @{
	const [route, setRoute] = useState<WatchRoute>(() => readWatchRoute());
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [catalogQuery, setCatalogQuery] = useState('');
	const [online, setOnline] = useState(() => navigator.onLine);
	const [isPlaying, setIsPlaying] = useState(false);
	const [mediaReady, setMediaReady] = useState(false);
	const [mediaFailed, setMediaFailed] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(6);
	const [muted, setMuted] = useState(true);
	const [lastMediaEvent, setLastMediaEvent] = useState('Waiting for media');
	const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(() => new Set());
	const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(() => new Set());
	const [followedCreators, setFollowedCreators] = useState<Set<string>>(() => new Set());
	const [queuedActions, setQueuedActions] = useState(0);
	const [theaterMode, setTheaterMode] = useState(false);
	const [activity, setActivity] = useState('Loading local catalog');
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const loadTimerRef = useRef<number | null>(null);
	const failurePendingRef = useRef(
		new URLSearchParams(window.location.search).get('scenario') === 'failure',
	);
	const video = findVideo(route.videoId);
	const comments = useMemo(() => createComments(video.id), [video.id]);
	const liked = likedVideoIds.has(video.id);
	const saved = savedVideoIds.has(video.id);
	const subscribed = followedCreators.has(video.creator);

	const loadCatalog = useCallback(() => {
		setLoadState('loading');
		setActivity('Loading local catalog');
		if (loadTimerRef.current !== null) {
			window.clearTimeout(loadTimerRef.current);
			loadTimerRef.current = null;
		}
		loadTimerRef.current = window.setTimeout(() => {
			loadTimerRef.current = null;
			if (failurePendingRef.current) {
				failurePendingRef.current = false;
				setLoadState('error');
				setActivity('Catalog load failed');
				return;
			}
			const activeVideo = findVideo(readWatchRoute().videoId);
			setLoadState('ready');
			setActivity(`${activeVideo.title} loaded from the local catalog`);
		}, 220);
	}, []);

	useEffect(() => {
		loadCatalog();
		return () => {
			if (loadTimerRef.current !== null) {
				window.clearTimeout(loadTimerRef.current);
				loadTimerRef.current = null;
			}
		};
	}, [loadCatalog]);

	useEffect(() => {
		const syncRoute = () => setRoute(readWatchRoute());
		const markOnline = () => setOnline(true);
		const markOffline = () => setOnline(false);
		window.addEventListener('popstate', syncRoute);
		window.addEventListener('online', markOnline);
		window.addEventListener('offline', markOffline);
		return () => {
			window.removeEventListener('popstate', syncRoute);
			window.removeEventListener('online', markOnline);
			window.removeEventListener('offline', markOffline);
		};
	}, []);

	useEffect(() => {
		if (online && queuedActions > 0) {
			setActivity(`${queuedActions} offline action${queuedActions === 1 ? '' : 's'} synced`);
			setQueuedActions(0);
		}
	}, [online]);

	useLayoutEffect(() => {
		setMediaReady(false);
		setMediaFailed(false);
		setCurrentTime(0);
		setIsPlaying(false);
		setLastMediaEvent('Waiting for media');
		setActivity(`Loading ${video.title}`);
	}, [video.id, video.title]);

	const navigate = useCallback((videoId: string, panel: WatchPanel = 'overview') => {
		history.pushState(null, '', watchURL(videoId, panel));
		setRoute({ videoId, panel });
		setCatalogQuery('');
	}, []);

	const setPanel = useCallback((panel: WatchPanel) => {
		history.pushState(null, '', watchURL(video.id, panel));
		setRoute({ videoId: video.id, panel });
	}, [video.id]);

	const togglePlayback = useCallback(() => {
		const player = videoRef.current;
		if (!player) return;
		if (player.paused || player.ended) {
			void player.play().catch(() => setActivity('Playback needs another user gesture'));
		} else {
			player.pause();
		}
	}, []);

	const seekTo = useCallback((seconds: number) => {
		const player = videoRef.current;
		if (!player) return;
		player.currentTime = Math.min(seconds, Number.isFinite(player.duration) ? player.duration : 6);
		player.focus({ preventScroll: true });
	}, []);

	const retryMedia = useCallback(() => {
		const player = videoRef.current;
		if (!player) return;
		setMediaFailed(false);
		setMediaReady(false);
		setCurrentTime(0);
		setIsPlaying(false);
		setLastMediaEvent('Waiting for media');
		setActivity(`Retrying ${video.title}`);
		player.load();
	}, [video.title]);

	const commitAction = useCallback((message: string) => {
		if (!online) setQueuedActions((count) => count + 1);
		setActivity(online ? message : `${message} · queued offline`);
	}, [online]);

	const shareVideo = useCallback(() => {
		const shareURL = window.location.href;
		if (!navigator.clipboard) {
			setActivity(`Share link ready · ${shareURL}`);
			return;
		}
		void navigator.clipboard.writeText(shareURL).then(
			() => setActivity('Share link copied'),
			() => setActivity(`Share link ready · ${shareURL}`),
		);
	}, []);

	const matchingVideos = useMemo(() => {
		const normalized = catalogQuery.trim().toLocaleLowerCase();
		if (normalized === '') return [];
		return VIDEOS.filter(
			(item) => `${item.title} ${item.creator} ${item.category}`.toLocaleLowerCase().includes(
				normalized,
			),
		);
	}, [catalogQuery]);

	<div class="app-shell">
		<a class="skip-link" href="#watch-main">Skip to video</a>
		<header class="topbar">
			<a
				class="brand"
				href={watchURL('neon-tides')}
				onClick={(event) => {
					event.preventDefault();
					navigate('neon-tides');
				}}
			>
				<span class="brand__mark" aria-hidden="true">
					<i></i>
				</span>
				<span>Streambox</span>
			</a>
			<div class="catalog-search">
				<label class="search-control">
					<span aria-hidden="true">⌕</span>
					<input
						type="search"
						value={catalogQuery}
						onInput={(event) => setCatalogQuery((event.currentTarget as HTMLInputElement).value)}
						placeholder="Search films, journals, creators"
						aria-label="Search videos"
					/>
				</label>
				@if (catalogQuery !== '') {
					<div class="search-popover" aria-label="Video search results">
						@if (matchingVideos.length === 0) {
							<p>No videos match that search.</p>
						} @else {
							@for (const result of matchingVideos; key result.id) {
								<a
									href={watchURL(result.id)}
									onClick={(event) => {
										event.preventDefault();
										navigate(result.id);
									}}
								>
									<span class="search-result-dot" style={{ background: result.accent }}></span>
									<span>
										<strong>{result.title}</strong>
										<small>{result.creator}</small>
									</span>
								</a>
							}
						}
					</div>
				}
			</div>
			<div class="topbar__actions">
				<button
					class="icon-button"
					type="button"
					aria-label="Open notifications"
					onClick={() => setActivity('You’re all caught up · no new notifications')}
				>
					<span aria-hidden="true">◌</span>
				</button>
				<div class="avatar" aria-label="Signed in as Alex Morgan">AM</div>
			</div>
		</header>

		<aside class="sidebar" aria-label="Streambox navigation">
			<nav aria-label="Primary navigation">
				<a class="sidebar-link sidebar-link--active" href={watchURL(video.id)}>
					<span aria-hidden="true">⌂</span>
					<span>Home</span>
				</a>
				<a class="sidebar-link" href="#recommended">
					<span aria-hidden="true">◇</span>
					<span>Discover</span>
				</a>
			</nav>
			<div class="sidebar-section">
				<p>Following</p>
				@for (const creatorVideo of VIDEOS; key creatorVideo.id) {
					<a
						class="creator-link"
						href={watchURL(creatorVideo.id)}
						onClick={(event) => {
							event.preventDefault();
							navigate(creatorVideo.id);
						}}
					>
						<span class="avatar avatar--tiny">{creatorVideo.creatorInitials}</span>
						<span>{creatorVideo.creator}</span>
					</a>
				}
			</div>
			<div class="sidebar-note">
				<span aria-hidden="true">✦</span>
				<strong>Made for focus</strong>
				<p>No ads interrupt the story.</p>
			</div>
		</aside>

		<main id="watch-main" class="watch-main" tabIndex={-1}>
			@if (!online) {
				<div class="offline-banner" role="status">
					<span aria-hidden="true">↯</span>
					<strong>Offline</strong>
					<span>This local video stays available; actions will sync on reconnect.</span>
					<span class="offline-banner__queue" data-testid="queued-actions">
						{queuedActions === 0
							? 'No queued actions'
							: `${queuedActions} queued action${queuedActions === 1 ? '' : 's'}`}
					</span>
				</div>
			}
			@if (loadState === 'loading') {
				<section class="loading-shell" aria-label="Loading Streambox video" aria-busy="true">
					<div class="skeleton skeleton--player"></div>
					<div class="skeleton skeleton--title"></div>
					<div class="skeleton skeleton--copy"></div>
					<p>Loading the local Streambox catalog…</p>
				</section>
			} @else if (loadState === 'error') {
				<section class="load-error" role="alert">
					<span class="load-error__mark" aria-hidden="true">↺</span>
					<p class="eyebrow">Playback library unavailable</p>
					<h1>We couldn’t load this video</h1>
					<p>The deterministic fixture stopped before media was attached. Retry to continue.</p>
					<button type="button" onClick={loadCatalog}>Retry loading video</button>
				</section>
			} @else {
				<div
					class={{ 'watch-grid': true, 'watch-grid--theater': theaterMode }}
					data-testid="watch-ready"
				>
					<section class="watch-column">
						<section
							class="player-shell"
							style={'--video-accent: ' + video.accent}
							data-testid="player-shell"
						>
							<div class="player-frame">
								<video
									ref={videoRef}
									src={mediaURL(video.id)}
									poster={video.poster}
									preload="auto"
									playsInline={true}
									muted={muted}
									aria-label={video.title}
									data-testid="streambox-video"
									onLoadedMetadata={(event) => {
										const player = event.currentTarget as HTMLVideoElement;
										setDuration(player.duration);
										setMediaReady(true);
										setMediaFailed(false);
										setLastMediaEvent('Native event · metadata loaded');
										setActivity(`${video.title} is ready to play`);
									}}
									onError={() => {
										setMediaReady(false);
										setMediaFailed(true);
										setIsPlaying(false);
										setLastMediaEvent('Native event · error');
										setActivity(`${video.title} could not be loaded`);
									}}
									onPlay={() => {
										setIsPlaying(true);
										setLastMediaEvent('Native event · play');
										setActivity(`Playing ${video.title}`);
									}}
									onPause={() => {
										setIsPlaying(false);
										setLastMediaEvent('Native event · pause');
										setActivity(`${video.title} paused`);
									}}
									onTimeUpdate={(event) => {
										setCurrentTime((event.currentTarget as HTMLVideoElement).currentTime);
									}}
									onSeeked={(event) => {
										const nextTime = (event.currentTarget as HTMLVideoElement).currentTime;
										setCurrentTime(nextTime);
										setLastMediaEvent('Native event · seeked');
										setActivity(`Jumped to ${formatTime(nextTime)}`);
									}}
									onVolumeChange={(event) => {
										const nextMuted = (event.currentTarget as HTMLVideoElement).muted;
										setMuted(nextMuted);
										setLastMediaEvent('Native event · volume changed');
									}}
									onEnded={() => {
										setIsPlaying(false);
										setLastMediaEvent('Native event · ended');
										setActivity('Playback complete');
									}}
								></video>
								@if (mediaFailed) {
									<div class="media-error" role="alert">
										<span class="media-error__mark" aria-hidden="true">!</span>
										<div>
											<strong>Video playback unavailable</strong>
											<p>The local media file could not be prepared.</p>
										</div>
										<button type="button" onClick={retryMedia}>Retry video</button>
									</div>
								} @else {
									<div class={{ 'media-loader': true, 'media-loader--hidden': mediaReady }}>
										<span></span>
										Preparing local video
									</div>
								}
							</div>
							<div class="player-controls">
								<button
									class="play-button"
									type="button"
									onClick={togglePlayback}
									aria-label={isPlaying ? 'Pause video' : 'Play video'}
									disabled={!mediaReady}
								>
									<span aria-hidden="true">
										{isPlaying ? 'Ⅱ' : '▶'}
									</span>
								</button>
								<span class="time-readout" data-testid="time-readout">{`${formatTime(
									currentTime,
								)} / ${formatTime(duration)}`}</span>
								<label class="seek-control">
									<span class="sr-only">Seek video</span>
									<input
										type="range"
										min="0"
										max={Math.max(duration, 1)}
										step="0.05"
										value={Math.min(currentTime, duration)}
										onInput={(event) => seekTo(
											Number((event.currentTarget as HTMLInputElement).value),
										)}
										aria-label="Seek video"
									/>
								</label>
								<button
									class="control-button"
									type="button"
									onClick={() => {
										if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
									}}
									aria-label={muted ? 'Unmute video' : 'Mute video'}
								>
									<span aria-hidden="true">
										{muted ? '⊘' : '◖'}
									</span>
								</button>
								<button
									class="control-button control-button--wide"
									type="button"
									aria-label={theaterMode ? 'Exit theater mode' : 'Enter theater mode'}
									aria-pressed={theaterMode}
									onClick={() => {
										setTheaterMode(!theaterMode);
										setActivity(theaterMode ? 'Theater mode closed' : 'Theater mode opened');
									}}
								>
									<span aria-hidden="true">▭</span>
									<span>
										{theaterMode ? 'Close' : 'Theater'}
									</span>
								</button>
							</div>
						</section>

						<div class="media-event-line">
							<span
								class={{ 'live-dot': true, 'live-dot--playing': isPlaying }}
								aria-hidden="true"
							></span>
							<span data-testid="media-event">{lastMediaEvent}</span>
							<span
								class="media-event-line__activity"
								role="status"
								data-testid="activity-status"
							>{activity}</span>
						</div>

						<section class="video-meta">
							<div class="video-meta__heading">
								<p class="eyebrow">{video.category}</p>
								<h1>{video.title}</h1>
								<p>{`${video.views} · ${video.published}`}</p>
							</div>
							<div class="video-actions">
								<button
									class={{ 'action-button': true, 'action-button--active': liked }}
									type="button"
									onClick={() => {
										setLikedVideoIds((current) => {
											const next = new Set(current);
											if (liked) next.delete(video.id);
											else next.add(video.id);
											return next;
										});
										commitAction(liked ? 'Like removed' : 'Video liked');
									}}
									aria-pressed={liked}
								>
									<span aria-hidden="true">♡</span>
									<span>
										{liked ? 'Liked' : 'Like'}
									</span>
								</button>
								<button
									class={{ 'action-button': true, 'action-button--active': saved }}
									type="button"
									onClick={() => {
										setSavedVideoIds((current) => {
											const next = new Set(current);
											if (saved) next.delete(video.id);
											else next.add(video.id);
											return next;
										});
										commitAction(saved ? 'Removed from library' : 'Saved to library');
									}}
									aria-pressed={saved}
								>
									<span aria-hidden="true">＋</span>
									<span>
										{saved ? 'Saved' : 'Save'}
									</span>
								</button>
								<button
									class="action-button"
									type="button"
									aria-label="Share video"
									onClick={shareVideo}
								>
									<span aria-hidden="true">↗</span>
									<span>Share</span>
								</button>
							</div>
						</section>

						<section class="creator-strip">
							<div class="avatar avatar--creator">{video.creatorInitials}</div>
							<div>
								<strong>{video.creator}</strong>
								<span>428K thoughtful viewers</span>
							</div>
							<button
								class={{ 'subscribe-button': true, 'subscribe-button--active': subscribed }}
								type="button"
								onClick={() => {
									setFollowedCreators((current) => {
										const next = new Set(current);
										if (subscribed) next.delete(video.creator);
										else next.add(video.creator);
										return next;
									});
									commitAction(
										subscribed ? `Unfollowed ${video.creator}` : `Following ${video.creator}`,
									);
								}}
								aria-pressed={subscribed}
							>
								{subscribed ? 'Following' : 'Follow'}
							</button>
						</section>

						<nav class="watch-tabs" aria-label="Video details">
							@for (const panel of ['overview', 'comments', 'transcript'] as const; key panel) {
								<a
									class={{ 'watch-tab': true, 'watch-tab--active': route.panel === panel }}
									href={watchURL(video.id, panel)}
									aria-current={route.panel === panel ? 'page' : undefined}
									onClick={(event) => {
										event.preventDefault();
										setPanel(panel);
									}}
								>
									{panel[0].toLocaleUpperCase() + panel.slice(1)}
									@if (panel === 'comments') {
										<span>{comments.length}</span>
									}
								</a>
							}
						</nav>

						<div class="watch-panel">
							@if (route.panel === 'overview') {
								<section class="panel-card overview-panel">
									<p>{video.description}</p>
									<div class="chapters">
										<div class="panel-heading">
											<div>
												<p class="eyebrow">Timeline</p>
												<h2>Chapters</h2>
											</div>
											<span>{`${video.chapters.length} moments`}</span>
										</div>
										<div class="chapter-grid">
											@for (const chapter of video.chapters; key chapter.start) {
												<button type="button" onClick={() => seekTo(chapter.start)}>
													<span>{formatTime(chapter.start)}</span>
													<strong>{chapter.title}</strong>
												</button>
											}
										</div>
									</div>
								</section>
							} @else if (route.panel === 'comments') {
								<CommentsPanel comments={comments} onJump={seekTo} />
							} @else {
								<section class="panel-card transcript-panel">
									<div class="panel-heading">
										<div>
											<p class="eyebrow">Read along</p>
											<h2>Interactive transcript</h2>
										</div>
										<span>Jump to any line</span>
									</div>
									<ol>
										@for (const cue of video.transcript; key cue.start) {
											<li>
												<button type="button" onClick={() => seekTo(cue.start)}>
													<span>{formatTime(cue.start)}</span>
													<span>{cue.text}</span>
												</button>
											</li>
										}
									</ol>
								</section>
							}
						</div>
					</section>

					<aside id="recommended" class="recommendations" aria-labelledby="up-next-heading">
						<div class="recommendations__heading">
							<div>
								<p class="eyebrow">Curated next</p>
								<h2 id="up-next-heading">Up next</h2>
							</div>
							<span>Autoplay off</span>
						</div>
						@for (const recommendation of VIDEOS; key recommendation.id) {
							<VideoCard
								video={recommendation}
								active={recommendation.id === video.id}
								onOpen={(videoId) => navigate(videoId)}
							/>
						}
						<div class="playlist-card">
							<span class="playlist-card__art" aria-hidden="true">03</span>
							<div>
								<p class="eyebrow">Playlist</p>
								<strong>Slow cinema for late hours</strong>
								<span>8 films · 42 min</span>
							</div>
							<button
								type="button"
								aria-label="Open Slow cinema for late hours"
								onClick={() => navigate('signal-garden')}
							>→</button>
						</div>
					</aside>
				</div>
			}
		</main>
	</div>
}
