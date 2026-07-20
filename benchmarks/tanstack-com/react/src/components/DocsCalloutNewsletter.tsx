import { NewsletterSignup } from '~/components/NewsletterSignup';

export function DocsCalloutNewsletter(props: React.HTMLProps<HTMLDivElement>) {
	return (
		<div className="space-y-4" {...props}>
			<div className="space-y-1 md:space-y-2">
				<h6 className="text-[.8rem] uppercase font-black opacity-50">TanStack News</h6>
				<p className="text-xs md:text-xs">
					New posts, releases, and ecosystem updates from TanStack.
				</p>
			</div>
			<NewsletterSignup />
		</div>
	);
}
