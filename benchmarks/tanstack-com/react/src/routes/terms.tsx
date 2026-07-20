import { createFileRoute } from '@tanstack/react-router';
import { Footer } from '~/components/Footer';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/terms')({
	component: RouteComp,
	head: () => ({
		meta: seo({
			title: 'Terms of Service',
			description: 'Terms of Service',
		}),
	}),
});

function RouteComp() {
	return (
		<div className="flex flex-col max-w-full min-h-screen gap-12 p-4 md:p-8 pb-0">
			<div className="flex-1 space-y-12 w-full max-w-3xl mx-auto">
				<header className="">
					<h1 className="text-4xl font-bold">Terms of Service</h1>
					<p className="">Effective Date: January 18, 2025</p>
				</header>

				<section className="">
					<p className="text-lg">
						Welcome to <strong>TanStack.com</strong> (the "Site"). These Terms of Service ("Terms")
						govern your use of our website, products, services, and any content made available on or
						through the Site. By accessing or using TanStack.com, you agree to these Terms. If you
						do not agree, you must not use the Site.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
					<p>
						By accessing, browsing, or using TanStack.com, you acknowledge that you have read,
						understood, and agree to be bound by these Terms and our Privacy Policy.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">2. Changes to Terms</h2>
					<p>
						We may modify these Terms at any time without prior notice. Changes will be effective
						upon posting to the Site. Your continued use of TanStack.com after changes are posted
						constitutes acceptance of the revised Terms.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">3. Eligibility</h2>
					<p>Anyone can use the Site. By using the Site, you agree to comply with these Terms.</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">4. Use of the Site</h2>
					<p>
						You agree to use the Site only for lawful purposes and in accordance with these Terms.
						Specifically, you agree not to:
					</p>
					<ul className="list-disc pl-8">
						<li>Violate any applicable laws or regulations.</li>
						<li>Engage in unauthorized access or use of TanStack's systems or servers.</li>
						<li>Upload or transmit viruses, malware, or harmful code.</li>
						<li>Reverse engineer, decompile, or attempt to derive source code from the Site.</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">5. Account Registration</h2>
					<ul className="list-disc pl-8">
						<li>
							Some features of the Site may require you to register for an account. You must provide
							accurate, complete, and current information.
						</li>
						<li>
							You are responsible for maintaining the confidentiality of your account credentials
							and for all activities under your account.
						</li>
						<li>
							Notify us immediately of any unauthorized use of your account or security breach.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">6. Intellectual Property</h2>
					<p>
						All content, features, and functionality on the Site—including software, code, text,
						images, videos, and trademarks—are owned by TanStack or its licensors and are protected
						by applicable intellectual property laws.
					</p>
					<p>
						<strong>You may not:</strong>
					</p>
					<ul className="list-disc pl-8">
						<li>
							Reproduce, modify, distribute, or publicly display content from the Site without prior
							written permission.
						</li>
						<li>Use any of our trademarks without prior written consent.</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">7. User Content</h2>
					<p>
						If you submit or post any content (e.g., feedback, comments, or code contributions), you
						grant TanStack a non-exclusive, worldwide, royalty-free license to use, reproduce, and
						display such content.
					</p>
					<p>
						<strong>You represent and warrant that:</strong>
					</p>
					<ul className="list-disc pl-8">
						<li>You own or have the necessary rights to post the content.</li>
						<li>Your content does not violate any third-party rights or applicable laws.</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">8. Disclaimer of Warranties</h2>
					<p>
						The site and its content are provided "as is" and "as available" without any warranties
						of any kind, whether express or implied. TanStack disclaims all warranties, including
						implied warranties of merchantability, fitness for a particular purpose, and
						non-infringement.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">9. Limitation of Liability</h2>
					<p>
						To the maximum extent permitted by law, TanStack shall not be liable for any indirect,
						incidental, special, consequential, or punitive damages arising from your use of the
						Site or Services.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">10. Third-Party Links</h2>
					<p>
						The Site may contain links to third-party websites. We are not responsible for the
						content or practices of any linked third-party sites. Such links do not imply
						endorsement.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">11. Termination</h2>
					<p>
						We reserve the right to terminate or suspend your access to the Site, without prior
						notice or liability, for any reason, including breach of these Terms.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">12. Governing Law</h2>
					<p>
						These Terms shall be governed by and construed in accordance with the laws of Utah,
						without regard to its conflict of law provisions.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">13. Dispute Resolution</h2>
					<p>
						Any dispute arising from these Terms shall be resolved through binding arbitration in
						accordance with the Standard Arbitration Rules for Utah. The arbitration shall take
						place in Utah.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">14. Severability</h2>
					<p>
						If any provision of these Terms is found to be unenforceable or invalid, that provision
						shall be limited or eliminated to the minimum extent necessary while preserving the
						remaining provisions.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">15. Entire Agreement</h2>
					<p>
						These Terms constitute the entire agreement between you and TanStack regarding the use
						of the Site, superseding any prior agreements.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold">16. Contact Us</h2>
					<p>If you have questions about these Terms, please contact us at:</p>
					<address>
						<p>
							<strong>TanStack</strong>
						</p>
						<p>
							Email:{' '}
							<a href="mailto:support@tanstack.com" className="text-blue-600 underline">
								support@tanstack.com
							</a>
						</p>
					</address>
				</section>
			</div>
			<Footer />
		</div>
	);
}
