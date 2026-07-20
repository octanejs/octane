import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchRecentPosts, type RecentPost } from '~/utils/blog.functions';
import { formatPublishedDate } from '~/utils/blog-format';

type RecentPostsWidgetProps = {
	posts?: ReadonlyArray<RecentPost>;
	/** Set to false to skip the client fetch when the widget is rendered but not visible (e.g. hidden below a CSS breakpoint). Ignored when `posts` is provided. */
	enabled?: boolean;
};

function RecentPostsList({ posts }: { posts: ReadonlyArray<RecentPost> }) {
	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between border-b border-gray-500/20 px-3 py-2">
				<Link to="/blog" className="font-medium opacity-60 hover:opacity-100 text-xs">
					Latest Posts
				</Link>
			</div>
			<div className="flex flex-col divide-y divide-gray-500/10">
				{posts.map((post) => (
					<Link
						key={post.slug}
						to="/blog/$"
						params={{ _splat: post.slug } as never}
						className="flex flex-col gap-0.5 px-3 py-2.5
              hover:bg-gray-500/5 transition-colors duration-150"
					>
						<span className="text-xs font-medium leading-snug line-clamp-2">{post.title}</span>
						<span className="text-[10px] text-gray-500 dark:text-gray-500">
							{formatPublishedDate(post.published)}
						</span>
					</Link>
				))}
			</div>
		</div>
	);
}

function RecentPostsSkeleton() {
	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between border-b border-gray-500/20 px-3 py-2">
				<Link to="/blog" className="font-medium opacity-60 hover:opacity-100 text-xs">
					Latest Posts
				</Link>
			</div>
			<div className="flex flex-col divide-y divide-gray-500/10">
				{Array.from({ length: 3 }).map((_, index) => (
					<div key={`recent-post-skeleton-${index}`} className="px-3 py-2.5">
						<div className="h-3.5 w-full rounded bg-gray-200/70 dark:bg-gray-800/70" />
						<div className="mt-2 h-2.5 w-20 rounded bg-gray-100 dark:bg-gray-900" />
					</div>
				))}
			</div>
		</div>
	);
}

export function RecentPostsWidget({ posts, enabled = true }: RecentPostsWidgetProps) {
	const recentPostsQuery = useQuery({
		queryKey: ['recentPosts'],
		queryFn: () => fetchRecentPosts(),
		enabled: posts === undefined && enabled,
		staleTime: 1000 * 60 * 5,
	});

	const visiblePosts = posts ?? recentPostsQuery.data;

	if (!visiblePosts) {
		return <RecentPostsSkeleton />;
	}

	return <RecentPostsList posts={visiblePosts} />;
}
