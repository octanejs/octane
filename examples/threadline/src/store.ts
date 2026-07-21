import { create } from '@octanejs/zustand';

export type Route = { kind: 'home' } | { kind: 'saved' } | { kind: 'profile'; handle: string };

export interface Person {
	handle: string;
	name: string;
	initials: string;
	bio: string;
	accent: string;
	followers: string;
	following: string;
}

export interface Post {
	id: string;
	author: string;
	body: string;
	time: string;
	likes: number;
	liked: boolean;
	saved: boolean;
	replies: number;
	status?: 'sending' | 'published';
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type RetryMutation =
	{ kind: 'like'; postId: string; targetLiked: boolean } | { kind: 'post'; body: string };

export interface Notice {
	id: number;
	tone: 'error' | 'success';
	title: string;
	message: string;
	retry?: RetryMutation;
}

interface PendingLike {
	operation: number;
	previousLiked: boolean;
	previousLikes: number;
}

interface ThreadlineState {
	route: Route;
	loadState: LoadState;
	posts: Post[];
	online: boolean;
	notices: Notice[];
	following: string[];
	pendingLikes: Record<string, PendingLike>;
	initialFaultPending: boolean;
	bootstrap: () => void;
	retryLoad: () => void;
	navigate: (href: string) => void;
	syncLocation: () => void;
	setOnline: (online: boolean) => void;
	publishPost: (body: string) => void;
	toggleLike: (postId: string) => void;
	toggleSave: (postId: string) => void;
	toggleFollow: (handle: string) => void;
	receiveLivePost: () => void;
	retryMutation: (noticeId: number) => void;
	dismissNotice: (noticeId: number) => void;
}

export const people: Record<string, Person> = {
	avery: {
		handle: 'avery',
		name: 'Avery Stone',
		initials: 'AS',
		bio: 'Design engineer. Building thoughtful tools in public.',
		accent: '#6757d9',
		followers: '4.8K',
		following: '612',
	},
	maya: {
		handle: 'maya',
		name: 'Maya Chen',
		initials: 'MC',
		bio: 'Frontend systems, tiny details, and ambitious prototypes.',
		accent: '#e26d5a',
		followers: '12.4K',
		following: '391',
	},
	kai: {
		handle: 'kai',
		name: 'Kai Bell',
		initials: 'KB',
		bio: 'Runtime enthusiast. Usually thinking about schedulers.',
		accent: '#238c79',
		followers: '8.1K',
		following: '277',
	},
	noor: {
		handle: 'noor',
		name: 'Noor Patel',
		initials: 'NP',
		bio: 'Product designer making complex software feel calm.',
		accent: '#bd6b22',
		followers: '6.3K',
		following: '488',
	},
	lena: {
		handle: 'lena',
		name: 'Lena Ortiz',
		initials: 'LO',
		bio: 'Open-source maintainer and unapologetic keyboard shortcut fan.',
		accent: '#3d6ec9',
		followers: '9.7K',
		following: '354',
	},
	rowan: {
		handle: 'rowan',
		name: 'Rowan Ellis',
		initials: 'RE',
		bio: 'New here. Learning in public, one small experiment at a time.',
		accent: '#8b5c8e',
		followers: '18',
		following: '42',
	},
};

const seedPosts: readonly Post[] = [
	{
		id: 'maya-release',
		author: 'maya',
		body: 'We shipped the new component inspector today. The best feature might be the tiny focus trail that made three accessibility bugs obvious.',
		time: '18m',
		likes: 84,
		liked: false,
		saved: true,
		replies: 12,
	},
	{
		id: 'kai-scheduler',
		author: 'kai',
		body: 'A good scheduler demo is not a counter. It is a real interaction where three useful things overlap and none of them lose the user’s intent.',
		time: '43m',
		likes: 61,
		liked: false,
		saved: false,
		replies: 8,
	},
	{
		id: 'noor-design',
		author: 'noor',
		body: 'Today’s design review rule: if the empty state only explains what is missing, it is unfinished. Give people a confident next step.',
		time: '1h',
		likes: 107,
		liked: true,
		saved: true,
		replies: 19,
	},
	{
		id: 'maya-prototype',
		author: 'maya',
		body: 'A prototype became a product the moment someone used keyboard navigation in a way we had not anticipated — and it still worked.',
		time: '3h',
		likes: 42,
		liked: false,
		saved: false,
		replies: 6,
	},
];

const livePost: Post = {
	id: 'lena-live',
	author: 'lena',
	body: 'Quick field note: preserving the thing someone is typing matters more than making a refreshing timeline look clever.',
	time: 'now',
	likes: 9,
	liked: false,
	saved: false,
	replies: 2,
};

let postSequence = 0;
let operationSequence = 0;
let noticeSequence = 0;

function cloneSeedPosts(): Post[] {
	return seedPosts.map((post) => ({ ...post }));
}

export function parseRoute(pathname: string): Route {
	const normalized = pathname.replace(/\/+$/, '') || '/';
	if (normalized === '/saved') return { kind: 'saved' };
	const profileMatch = /^\/profile\/([a-z0-9-]+)$/.exec(normalized);
	if (profileMatch) return { kind: 'profile', handle: profileMatch[1] };
	return { kind: 'home' };
}

export function hrefForRoute(route: Route): string {
	if (route.kind === 'saved') return '/saved';
	if (route.kind === 'profile') return `/profile/${route.handle}`;
	return '/';
}

export function postsForRoute(posts: readonly Post[], route: Route): Post[] {
	if (route.kind === 'saved') return posts.filter((post) => post.saved);
	if (route.kind === 'profile') return posts.filter((post) => post.author === route.handle);
	return [...posts];
}

export function personForHandle(handle: string): Person {
	return (
		people[handle] ?? {
			handle,
			name: `@${handle}`,
			initials: '?',
			bio: 'This profile is not available in the local Threadline seed.',
			accent: '#6b7280',
			followers: '0',
			following: '0',
		}
	);
}

function replacePost(posts: readonly Post[], postId: string, update: (post: Post) => Post): Post[] {
	return posts.map((post) => (post.id === postId ? update(post) : post));
}

function removePendingLike(
	pending: Record<string, PendingLike>,
	postId: string,
): Record<string, PendingLike> {
	const next = { ...pending };
	delete next[postId];
	return next;
}

function makeNotice(
	tone: Notice['tone'],
	title: string,
	message: string,
	retry?: RetryMutation,
): Notice {
	return { id: ++noticeSequence, tone, title, message, retry };
}

function postNoticeExcerpt(body: string): string {
	const normalized = body.replace(/\s+/g, ' ').trim();
	const excerpt = normalized.length > 64 ? normalized.slice(0, 63).trimEnd() + '…' : normalized;
	return `“${excerpt}”`;
}

const initialURL = new URL(window.location.href);

export const useThreadlineStore = create<ThreadlineState>((set, get) => {
	const finishLoad = () => {
		window.setTimeout(() => {
			const state = get();
			if (state.initialFaultPending) {
				set({
					loadState: 'error',
					initialFaultPending: false,
				});
				return;
			}
			const seeded = cloneSeedPosts();
			const seededIds = new Set(seeded.map((post) => post.id));
			set((current) => ({
				loadState: 'ready',
				// A composer submit or live event can land while the initial request is
				// pending. Keep those prepends ahead of the server seed instead of
				// treating the response as permission to replace local intent.
				posts: [...current.posts.filter((post) => !seededIds.has(post.id)), ...seeded],
			}));
		}, 600);
	};

	const setLike = (postId: string, targetLiked: boolean) => {
		const current = get().posts.find((post) => post.id === postId);
		if (!current || current.liked === targetLiked) return;
		const authorName = personForHandle(current.author).name;
		const operation = ++operationSequence;
		const firstPending = get().pendingLikes[postId];
		const pending: PendingLike = {
			operation,
			// A newer target supersedes the in-flight request but keeps the first
			// committed snapshot, so a failed burst rolls all the way back.
			previousLiked: firstPending?.previousLiked ?? current.liked,
			previousLikes: firstPending?.previousLikes ?? current.likes,
		};
		const shouldFail = !get().online;
		set((state) => ({
			posts: replacePost(state.posts, postId, (post) => ({
				...post,
				liked: targetLiked,
				likes: post.likes + (targetLiked ? 1 : -1),
			})),
			pendingLikes: { ...state.pendingLikes, [postId]: pending },
			// A fresh explicit reaction supersedes any failed intent for this post.
			// Removing that stale action prevents a later Retry from reversing the
			// newer result.
			notices: state.notices.filter(
				(notice) => notice.retry?.kind !== 'like' || notice.retry.postId !== postId,
			),
		}));
		const delay = postId === 'maya-release' ? 440 : 170;
		window.setTimeout(() => {
			const active = get().pendingLikes[postId];
			if (active?.operation !== operation) return;
			if (shouldFail) {
				set((state) => ({
					posts: replacePost(state.posts, postId, (post) => ({
						...post,
						liked: pending.previousLiked,
						likes: pending.previousLikes,
					})),
					pendingLikes: removePendingLike(state.pendingLikes, postId),
					notices: [
						...state.notices,
						makeNotice(
							'error',
							authorName + ' reaction rolled back',
							'Your reaction could not sync while offline. Reconnect, then retry.',
							{ kind: 'like', postId, targetLiked },
						),
					],
				}));
				return;
			}
			set((state) => ({
				pendingLikes: removePendingLike(state.pendingLikes, postId),
			}));
		}, delay);
	};

	return {
		route: parseRoute(initialURL.pathname),
		loadState: 'idle',
		posts: [],
		online: true,
		notices: [],
		following: [],
		pendingLikes: {},
		initialFaultPending: initialURL.searchParams.get('fault') === 'initial-load',
		bootstrap: () => {
			if (get().loadState !== 'idle') return;
			set({ loadState: 'loading' });
			finishLoad();
		},
		retryLoad: () => {
			set({ loadState: 'loading' });
			finishLoad();
		},
		navigate: (href) => {
			const next = new URL(href, window.location.origin);
			const current = `${window.location.pathname}${window.location.search}`;
			const destination = `${next.pathname}${next.search}`;
			if (current !== destination) window.history.pushState(null, '', destination);
			set({ route: parseRoute(next.pathname) });
		},
		syncLocation: () => set({ route: parseRoute(window.location.pathname) }),
		setOnline: (online) =>
			set((state) => ({
				online,
				notices:
					online && !state.notices.some((notice) => notice.tone === 'error')
						? [
								...state.notices,
								makeNotice(
									'success',
									'Back online',
									'New actions will sync with the local demo service.',
								),
							]
						: state.notices,
			})),
		publishPost: (rawBody) => {
			const body = rawBody.trim();
			if (!body) return;
			const id = `avery-${++postSequence}`;
			const optimistic: Post = {
				id,
				author: 'avery',
				body,
				time: 'now',
				likes: 0,
				liked: false,
				saved: false,
				replies: 0,
				status: 'sending',
			};
			const shouldFail = !get().online;
			set((state) => ({ posts: [optimistic, ...state.posts] }));
			window.setTimeout(() => {
				if (shouldFail) {
					const excerpt = postNoticeExcerpt(body);
					set((state) => ({
						posts: state.posts.filter((post) => post.id !== id),
						notices: [
							...state.notices,
							makeNotice(
								'error',
								`Post rolled back: ${excerpt}`,
								'You were offline, so the optimistic post was removed. Reconnect and retry it.',
								{ kind: 'post', body },
							),
						],
					}));
					return;
				}
				set((state) => ({
					posts: replacePost(state.posts, id, (post) => ({ ...post, status: 'published' })),
				}));
			}, 360);
		},
		toggleLike: (postId) => {
			const current = get().posts.find((post) => post.id === postId);
			if (current) setLike(postId, !current.liked);
		},
		toggleSave: (postId) =>
			set((state) => ({
				posts: replacePost(state.posts, postId, (post) => ({ ...post, saved: !post.saved })),
			})),
		toggleFollow: (handle) =>
			set((state) => ({
				following: state.following.includes(handle)
					? state.following.filter((current) => current !== handle)
					: [...state.following, handle],
			})),
		receiveLivePost: () => {
			if (get().posts.some((post) => post.id === livePost.id)) return;
			set((state) => ({
				posts: [{ ...livePost }, ...state.posts],
				notices: [
					...state.notices,
					makeNotice(
						'success',
						'Timeline refreshed',
						'Lena’s update was added without replacing the posts already on screen.',
					),
				],
			}));
		},
		retryMutation: (noticeId) => {
			const retry = get().notices.find((notice) => notice.id === noticeId)?.retry;
			if (!retry) return;
			set((state) => ({
				notices: state.notices.filter((notice) => notice.id !== noticeId),
			}));
			if (retry.kind === 'post') get().publishPost(retry.body);
			else setLike(retry.postId, retry.targetLiked);
		},
		dismissNotice: (noticeId) =>
			set((state) => ({
				notices: state.notices.filter((notice) => notice.id !== noticeId),
			})),
	};
});
