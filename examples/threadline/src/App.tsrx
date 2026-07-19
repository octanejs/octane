import { useRef, useState } from 'octane';
import { hrefForRoute, people, personForHandle, postsForRoute, useThreadlineStore } from './store';
import type { Notice, Person, Post, Route } from './store';

function openRoute(event: MouseEvent, href: string, navigate: (href: string) => void) {
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
		return;
	}
	event.preventDefault();
	navigate(href);
}

function HomeIcon() {
	return <svg aria-hidden="true" viewBox="0 0 24 24">
		<path d="M3.8 10.8 12 4l8.2 6.8v8.4a1 1 0 0 1-1 1h-4.6v-6.1H9.4v6.1H4.8a1 1 0 0 1-1-1Z" />
	</svg>;
}

function BookmarkIcon() {
	return <svg aria-hidden="true" viewBox="0 0 24 24">
		<path d="M6.3 4.2h11.4a1 1 0 0 1 1 1v15L12 16.4l-6.7 3.8v-15a1 1 0 0 1 1-1Z" />
	</svg>;
}

function PersonIcon() {
	return <svg aria-hidden="true" viewBox="0 0 24 24">
		<circle cx="12" cy="8.2" r="3.8" />
		<path d="M4.7 20c.7-4.1 3.1-6.1 7.3-6.1s6.6 2 7.3 6.1" />
	</svg>;
}

function HeartIcon() {
	return <svg aria-hidden="true" viewBox="0 0 24 24">
		<path
			d="M20.8 5.9c-2.3-2.5-6-1.4-8.8 1.8-2.8-3.2-6.5-4.3-8.8-1.8-2.6 2.8-.8 7.2 2.1 9.8L12 21l6.7-5.3c2.9-2.6 4.7-7 2.1-9.8Z"
		/>
	</svg>;
}

function ReplyIcon() {
	return <svg aria-hidden="true" viewBox="0 0 24 24">
		<path
			d="M20.2 11.5c0 4.1-3.7 7.4-8.2 7.4-1.1 0-2.2-.2-3.2-.5l-4.4 2 1.2-3.9a7 7 0 0 1-1.8-5c0-4.1 3.7-7.4 8.2-7.4s8.2 3.3 8.2 7.4Z"
		/>
	</svg>;
}

function NavItem({
	href,
	label,
	icon,
	active,
	navigate,
}: {
	href: string;
	label: string;
	icon: string;
	active: boolean;
	navigate: (href: string) => void;
}) @{
	<a
		class={{ 'nav-item': true, active }}
		href={href}
		aria-label={label}
		aria-current={active ? 'page' : undefined}
		onClick={(event) => openRoute(event, href, navigate)}
	>
		@if (icon === 'home') {
			<HomeIcon />
		} @else if (icon === 'saved') {
			<BookmarkIcon />
		} @else {
			<PersonIcon />
		}
		<span>
			{label as string}
		</span>
	</a>
}

function Avatar({
	person,
	size = 'medium',
}: {
	person: Person;
	size?: 'small' | 'medium' | 'large';
}) @{
	<span
		class={'avatar avatar-' + size}
		style={{ backgroundColor: person.accent }}
		aria-hidden="true"
	>
		{person.initials as string}
	</span>
}

function NoticeBar({
	notice,
	retryMutation,
	dismissNotice,
}: {
	notice: Notice;
	retryMutation: (noticeId: number) => void;
	dismissNotice: (noticeId: number) => void;
}) @{
	@if (notice.tone === 'error') {
		<div class="notice notice-error" role="alert">
			<div>
				<strong>
					{notice.title as string}
				</strong>
				<p>
					{notice.message as string}
				</p>
			</div>
			<div class="notice-actions">
				@if (notice.retry) {
					<button
						class="small-button primary"
						aria-label={'Retry ' + notice.title}
						onClick={() => retryMutation(notice.id)}
					>Retry</button>
				}
				<button
					class="icon-button"
					aria-label={'Dismiss ' + notice.title}
					onClick={() => dismissNotice(notice.id)}
				>×</button>
			</div>
		</div>
	} @else {
		<div class="notice notice-success" role="status">
			<div>
				<strong>
					{notice.title as string}
				</strong>
				<p>
					{notice.message as string}
				</p>
			</div>
			<button
				class="icon-button"
				aria-label={'Dismiss ' + notice.title}
				onClick={() => dismissNotice(notice.id)}
			>×</button>
		</div>
	}
}

function Composer({
	publishPost,
	receiveLivePost,
}: {
	publishPost: (body: string) => void;
	receiveLivePost: () => void;
}) @{
	const [draft, setDraft] = useState('');
	const editorRef = useRef<HTMLTextAreaElement | null>(null);
	const remaining = 280 - draft.length;
	const submit = () => {
		const body = draft.trim();
		if (!body) return;
		publishPost(body);
		setDraft('');
		queueMicrotask(() => editorRef.current?.focus());
	};

	<form
		class="composer"
		aria-label="Create a post"
		onSubmit={(event) => {
			event.preventDefault();
			submit();
		}}
	>
		<Avatar person={people.avery} />
		<div class="composer-body">
			<label for="composer-input" class="sr-only">What would you like to share?</label>
			<textarea
				id="composer-input"
				ref={editorRef}
				value={draft}
				maxLength={280}
				placeholder="Share what you’re working on…"
				onInput={(event) => setDraft(event.currentTarget.value.slice(0, 280))}
				onKeyDown={(event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
						event.preventDefault();
						submit();
					} else if (event.altKey && event.key.toLowerCase() === 'r') {
						event.preventDefault();
						receiveLivePost();
					}
				}}
			/>
			<div class="composer-footer">
				<p class="shortcut-hint">
					<kbd>Ctrl/⌘</kbd>

					<span>+</span>

					<kbd>Enter</kbd>
					to post ·
					<kbd>Alt</kbd>

					<span>+</span>
					{' '}
					<kbd>R</kbd>
					for a live update
				</p>
				<div class="composer-submit">
					<span class={{ 'character-count': true, warning: remaining < 30 }}>{String(
						remaining,
					)}</span>
					<button class="post-button" type="submit" disabled={draft.trim().length === 0}>
						Post
					</button>
				</div>
			</div>
		</div>
	</form>
}

function PostCard({
	post,
	pending,
	navigate,
	toggleLike,
	toggleSave,
}: {
	post: Post;
	pending: boolean;
	navigate: (href: string) => void;
	toggleLike: (postId: string) => void;
	toggleSave: (postId: string) => void;
}) @{
	const author = personForHandle(post.author);
	const profileHref = '/profile/' + author.handle;
	<article class="post-card" aria-label={'Post by ' + author.name}>
		<Avatar person={author} />
		<div class="post-content">
			<header class="post-meta">
				<a
					class="author-link"
					href={profileHref}
					onClick={(event) => openRoute(event, profileHref, navigate)}
				>
					<strong>
						{author.name as string}
					</strong>
					<span>
						{'@' + author.handle}
					</span>
				</a>
				<span class="meta-separator">·</span>
				<time>
					{post.time as string}
				</time>
				@if (post.status === 'sending') {
					<span class="post-status sending">Sending…</span>
				} @else if (post.status === 'published') {
					<span class="post-status published">Published</span>
				}
			</header>
			<p class="post-copy">
				{post.body as string}
			</p>
			<footer class="post-actions">
				<span class="post-action passive" aria-label={'Replies to post by ' + author.name}>
					<ReplyIcon />
					<span>{String(post.replies)}</span>
				</span>
				<button
					class={{ 'post-action': true, liked: post.liked }}
					aria-label={'Reaction to post by ' + author.name}
					aria-pressed={post.liked ? 'true' : 'false'}
					aria-busy={pending ? 'true' : 'false'}
					onClick={() => toggleLike(post.id)}
				>
					<HeartIcon />
					<span>{String(post.likes)}</span>
					@if (pending) {
						<span class="sr-only">Syncing reaction</span>
					}
				</button>
				<button
					class={{ 'post-action': true, saved: post.saved }}
					aria-label={(post.saved ? 'Remove bookmark from' : 'Bookmark') + ' post by ' +
						author.name}
					aria-pressed={post.saved ? 'true' : 'false'}
					onClick={() => toggleSave(post.id)}
				>
					<BookmarkIcon />
				</button>
			</footer>
		</div>
	</article>
}

function ProfileHeader({
	person,
	isFollowing,
	toggleFollow,
}: {
	person: Person;
	isFollowing: boolean;
	toggleFollow: (handle: string) => void;
}) @{
	<section class="profile-card" aria-labelledby="profile-title">
		<div class="profile-cover" style={{ backgroundColor: person.accent }}></div>
		<div class="profile-details">
			<Avatar person={person} size="large" />
			<div class="profile-name-row">
				<div>
					<h1 id="profile-title">
						{person.name as string}
					</h1>
					<p>
						{'@' + person.handle}
					</p>
				</div>
				@if (person.handle !== 'avery') {
					<button
						class={{ 'small-button': true, following: isFollowing }}
						aria-label={(isFollowing ? 'Unfollow ' : 'Follow ') + person.name}
						aria-pressed={isFollowing ? 'true' : 'false'}
						onClick={() => toggleFollow(person.handle)}
					>
						{isFollowing ? 'Following' : 'Follow'}
					</button>
				}
			</div>
			<p class="profile-bio">
				{person.bio as string}
			</p>
			<p class="profile-counts">
				<strong>
					{person.following as string}
				</strong>
				Following
				<strong>
					{person.followers as string}
				</strong>
				Followers
			</p>
		</div>
	</section>
}

function LoadingTimeline() @{
	<div class="loading-state" role="status" aria-label="Loading timeline">
		<div class="loading-copy">Loading your timeline…</div>
		@for (const row of [1, 2, 3]; key row) {
			<div class="skeleton-card" aria-hidden="true">
				<span></span>
				<div>
					<i></i>
					<i></i>
					<i></i>
				</div>
			</div>
		}
	</div>
}

function EmptyTimeline({ route, profile }: { route: Route; profile: Person }) @{
	<section class="empty-state">
		<div class="empty-illustration" aria-hidden="true">✦</div>
		@if (route.kind === 'saved') {
			<>
				<h2>No saved posts yet</h2>
				<p>Bookmark a useful post and it will wait for you here.</p>
			</>
		} @else if (route.kind === 'profile') {
			<>
				<h2>
					{profile.name + ' has not posted yet'}
				</h2>
				<p>This quiet timeline is ready for their first update.</p>
			</>
		} @else {
			<>
				<h2>Your timeline is clear</h2>
				<p>Follow a few people or publish the first post.</p>
			</>
		}
	</section>
}

function RightRail({
	online,
	setOnline,
	navigate,
}: {
	online: boolean;
	setOnline: (online: boolean) => void;
	navigate: (href: string) => void;
}) @{
	<aside class="right-rail" aria-label="Explore Threadline">
		<section class="side-card connection-card">
			<div class="side-heading">
				<div>
					<p class="eyebrow">Demo network</p>
					<h2>
						{online ? 'Connected' : 'Offline'}
					</h2>
				</div>
				<span class={{ 'connection-dot': true, online }}></span>
			</div>
			<p>
				{online
					? 'Actions sync after a short, deterministic delay.'
					: 'Optimistic actions will roll back and offer a retry.'}
			</p>
			<button class="network-button" onClick={() => setOnline(!online)}>
				{online ? 'Work offline' : 'Reconnect'}
			</button>
		</section>
		<section class="side-card">
			<p class="eyebrow">People to follow</p>
			<h2>Fresh perspectives</h2>
			@for (const handle of ['maya', 'rowan']; key handle) {
				const person = people[handle];
				<a
					class="person-row"
					href={'/profile/' + handle}
					onClick={(event) => openRoute(event, '/profile/' + handle, navigate)}
				>
					<Avatar person={person} size="small" />
					<span>
						<strong>
							{person.name as string}
						</strong>
						<small>
							{'@' + handle}
						</small>
					</span>
					<span class="row-arrow" aria-hidden="true">→</span>
				</a>
			}
		</section>
		<section class="side-card topics-card">
			<p class="eyebrow">Today’s topics</p>
			<a href="#octane">
				<strong>#Octane</strong>
				<span>1,204 posts</span>
			</a>
			<a href="#designsystems">
				<strong>#DesignSystems</strong>
				<span>846 posts</span>
			</a>
			<a href="#webperf">
				<strong>#WebPerf</strong>
				<span>612 posts</span>
			</a>
		</section>
	</aside>
}

export function App() @{
	const route = useThreadlineStore((state) => state.route);
	const loadState = useThreadlineStore((state) => state.loadState);
	const posts = useThreadlineStore((state) => state.posts);
	const online = useThreadlineStore((state) => state.online);
	const notices = useThreadlineStore((state) => state.notices);
	const following = useThreadlineStore((state) => state.following);
	const pendingLikes = useThreadlineStore((state) => state.pendingLikes);
	const navigate = useThreadlineStore((state) => state.navigate);
	const retryLoad = useThreadlineStore((state) => state.retryLoad);
	const setOnline = useThreadlineStore((state) => state.setOnline);
	const publishPost = useThreadlineStore((state) => state.publishPost);
	const toggleLike = useThreadlineStore((state) => state.toggleLike);
	const toggleSave = useThreadlineStore((state) => state.toggleSave);
	const toggleFollow = useThreadlineStore((state) => state.toggleFollow);
	const receiveLivePost = useThreadlineStore((state) => state.receiveLivePost);
	const retryMutation = useThreadlineStore((state) => state.retryMutation);
	const dismissNotice = useThreadlineStore((state) => state.dismissNotice);
	const visiblePosts = postsForRoute(posts, route);
	const profile =
		route.kind === 'profile' ? personForHandle(route.handle) : people.avery;
	const homeActive = route.kind === 'home';
	const savedActive = route.kind === 'saved';
	const profileActive = route.kind === 'profile' && route.handle === 'avery';

	<div class="app-shell">
		<a class="skip-link" href="#main-content">Skip to timeline</a>
		<header class="mobile-header">
			<a class="brand" href="/" onClick={(event) => openRoute(event, '/', navigate)}>
				<span aria-hidden="true">T</span>
				Threadline
			</a>
			<button class={{ 'mobile-connection': true, online }} onClick={() => setOnline(!online)}>
				{online ? 'Work offline' : 'Reconnect'}
			</button>
		</header>
		<aside class="left-rail">
			<a class="brand" href="/" onClick={(event) => openRoute(event, '/', navigate)}>
				<span aria-hidden="true">T</span>
				Threadline
			</a>
			<nav aria-label="Primary navigation">
				<NavItem href="/" label="Home" icon="home" active={homeActive} navigate={navigate} />
				<NavItem
					href="/saved"
					label="Saved"
					icon="saved"
					active={savedActive}
					navigate={navigate}
				/>
				<NavItem
					href="/profile/avery"
					label="Profile"
					icon="profile"
					active={profileActive}
					navigate={navigate}
				/>
			</nav>
			<a
				class="account-chip"
				href="/profile/avery"
				onClick={(event) => openRoute(event, '/profile/avery', navigate)}
			>
				<Avatar person={people.avery} size="small" />
				<span>
					<strong>Avery Stone</strong>
					<small>@avery</small>
				</span>
			</a>
		</aside>

		<main id="main-content" class="timeline-column" tabIndex={-1}>
			<button class={{ 'compact-network': true, online }} onClick={() => setOnline(!online)}>
				<span aria-hidden="true"></span>
				{online ? 'Work offline' : 'Reconnect'}
			</button>
			@if (!online) {
				<div class="offline-banner" role="status">
					<span aria-hidden="true">◌</span>
					<strong>You’re offline.</strong>
					Optimistic changes will be checked, rolled back, and kept retryable.
				</div>
			}
			@for (const notice of notices; key notice.id) {
				<NoticeBar notice={notice} retryMutation={retryMutation} dismissNotice={dismissNotice} />
			}

			@if (route.kind === 'profile') {
				<ProfileHeader
					person={profile}
					isFollowing={following.includes(profile.handle)}
					toggleFollow={toggleFollow}
				/>
			} @else {
				<header class="timeline-header">
					<div>
						<p class="eyebrow">
							{route.kind === 'saved' ? 'Your library' : 'Good morning, Avery'}
						</p>
						<h1>
							{route.kind === 'saved' ? 'Saved posts' : 'Home timeline'}
						</h1>
					</div>
					@if (route.kind === 'home') {
						<button class="refresh-button" onClick={receiveLivePost}>Refresh</button>
					}
				</header>
			}

			@if (route.kind === 'home' && loadState !== 'error') {
				<Composer publishPost={publishPost} receiveLivePost={receiveLivePost} />
			}

			@if ((loadState === 'loading' || loadState === 'idle') && visiblePosts.length === 0) {
				<LoadingTimeline />
			} @else if (loadState === 'error') {
				<section class="load-error" role="alert">
					<span aria-hidden="true">!</span>
					<h2>We couldn’t load the timeline</h2>
					<p>The deterministic demo service paused this request. Your route is safe.</p>
					<button class="small-button primary" onClick={retryLoad}>Try again</button>
				</section>
			} @else if (visiblePosts.length === 0) {
				<EmptyTimeline route={route} profile={profile} />
			} @else {
				<section
					class="feed"
					aria-label={route.kind === 'saved' ? 'Saved posts' : 'Timeline posts'}
				>
					@for (const post of visiblePosts; key post.id) {
						<PostCard
							post={post}
							pending={pendingLikes[post.id] !== undefined}
							navigate={navigate}
							toggleLike={toggleLike}
							toggleSave={toggleSave}
						/>
					}
				</section>
			}
		</main>

		<RightRail online={online} setOnline={setOnline} navigate={navigate} />

		<nav class="mobile-nav" aria-label="Mobile navigation">
			<NavItem href="/" label="Home" icon="home" active={homeActive} navigate={navigate} />
			<NavItem href="/saved" label="Saved" icon="saved" active={savedActive} navigate={navigate} />
			<NavItem
				href="/profile/avery"
				label="Profile"
				icon="profile"
				active={profileActive}
				navigate={navigate}
			/>
		</nav>
	</div>
}
