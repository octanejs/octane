import { Card } from '~/components/Card.tsrx';
import { NewsletterSignup } from '~/components/NewsletterSignup.tsrx';
import { Footer } from '~/components/Footer.tsrx';

export function HomeNewsletterSection() {
	return <>
		<div class="px-4 mx-auto max-w-(--breakpoint-lg) relative">
			<Card className="rounded-md p-8 md:p-14">
				<div>
					<div class="relative inline-block max-w-full">
						<h3 id="newsletter" class="text-3xl font-bold scroll-mt-24">
							<a
								href="#newsletter"
								class="hover:underline decoration-gray-400 dark:decoration-gray-600"
							>
								Subscribe to TanStack News
							</a>
						</h3>
					</div>

					<p class="text-lg mt-1">
						New posts, releases, and ecosystem updates from TanStack.
					</p>
				</div>
				<NewsletterSignup
					className="mt-4 max-w-sm"
					noteClassName="text-sm opacity-50 font-semibold italic"
				/>
			</Card>
		</div>
		<div class="h-20" />
		<Footer />
	</>;
}
