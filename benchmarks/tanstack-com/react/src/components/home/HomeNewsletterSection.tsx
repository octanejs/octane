import { Card } from '~/components/Card';
import { NewsletterSignup } from '~/components/NewsletterSignup';
import { Footer } from '~/components/Footer';

export function HomeNewsletterSection() {
	return (
		<>
			<div className="px-4 mx-auto max-w-(--breakpoint-lg) relative">
				<Card className="rounded-md p-8 md:p-14">
					<div>
						<div className="relative inline-block max-w-full">
							<h3 id="newsletter" className="text-3xl font-bold scroll-mt-24">
								<a
									href="#newsletter"
									className="hover:underline decoration-gray-400 dark:decoration-gray-600"
								>
									Subscribe to TanStack News
								</a>
							</h3>
						</div>

						<p className="text-lg mt-1">
							New posts, releases, and ecosystem updates from TanStack.
						</p>
					</div>
					<NewsletterSignup
						className="mt-4 max-w-sm"
						noteClassName="text-sm opacity-50 font-semibold italic"
					/>
				</Card>
			</div>
			<div className="h-20" />
			<Footer />
		</>
	);
}
