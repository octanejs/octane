import { createFileRoute } from '@octanejs/tanstack-router';
import { Footer } from '~/components/Footer.tsrx';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/privacy')({
	component: RouteComp,
	head: () => ({
		meta: seo({
			title: 'Privacy Policy',
			description: 'Privacy Policy',
		}),
	}),
});

function RouteComp() {
	return <div class="flex flex-col max-w-full min-h-screen gap-12 p-4 md:p-8 pb-0">
		<div class="flex-1 space-y-12 w-full max-w-3xl mx-auto">
			<header class="">
				<h1 class="text-4xl font-bold">Privacy Policy</h1>
				<p class="">Effective Date: January 18, 2025</p>
			</header>

			<section class="">
				<p class="text-lg">
					At
					<strong>TanStack.com</strong>
					(the "Site"), your privacy is important to us. This Privacy Policy explains how we
					collect, use, and protect your information when you access or use our website, products,
					and services. By using the Site, you agree to the practices described in this Privacy
					Policy. If you do not agree, please do not use the Site.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">1. Information We Collect</h2>
				<p>
					We collect information to provide and improve our services. The types of information we
					may collect include:
				</p>
				<ul class="list-disc pl-8">
					<li>
						<strong>Personal Information:</strong>
						Includes your name, email address, phone number, or other information you provide when
						you register for an account or interact with the Site.
					</li>
					<li>
						<strong>Usage Data:</strong>
						Information about how you access and use the Site, including your IP address, browser
						type, pages visited, and other diagnostic data.
					</li>
					<li>
						<strong>Cookies and Tracking Technologies:</strong>
						See the "Cookies and Tracking" section below for more details.
					</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">2. How We Use Your Information</h2>
				<p>We use the information we collect for the following purposes:</p>
				<ul class="list-disc pl-8">
					<li>To provide, operate, and maintain the Site and our services.</li>
					<li>To improve the user experience and optimize performance.</li>
					<li>To communicate with you, including responding to inquiries and sending updates.</li>
					<li>To comply with legal obligations or enforce our Terms of Service.</li>
					<li>To prevent fraudulent, harmful, or unauthorized activities.</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">3. Cookies and Tracking</h2>
				<p>
					The Site uses cookies and similar tracking technologies to analyze trends, track user
					behavior, and gather demographic information. Cookies are small files stored on your
					device.
				</p>
				<p>
					<strong>You can control cookies:</strong>
				</p>
				<ul class="list-disc pl-8">
					<li>Most browsers allow you to block or delete cookies through settings.</li>
					<li>Disabling cookies may affect the functionality of the Site.</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">4. How We Share Your Information</h2>
				<p>
					We do not sell or rent your personal information. However, we may share information in the
					following circumstances:
				</p>
				<ul class="list-disc pl-8">
					<li>
						<strong>Service Providers:</strong>
						With third parties who help us operate the Site, such as hosting or analytics providers.
					</li>
					<li>
						<strong>Legal Compliance:</strong>
						If required by law or to respond to legal requests.
					</li>
					<li>
						<strong>Business Transfers:</strong>
						In connection with a merger, acquisition, or sale of assets.
					</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">5. Data Security</h2>
				<p>
					We take reasonable measures to protect your information from unauthorized access, use, or
					disclosure. However, no security measures are completely foolproof, and we cannot
					guarantee the absolute security of your data.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">6. Your Rights</h2>
				<p>
					Depending on your location, you may have the following rights regarding your personal
					information:
				</p>
				<ul class="list-disc pl-8">
					<li>
						<strong>Access:</strong>
						Request access to the personal information we hold about you.
					</li>
					<li>
						<strong>Correction:</strong>
						Request correction of inaccurate or incomplete data.
					</li>
					<li>
						<strong>Deletion:</strong>
						Request deletion of your personal information.
					</li>
					<li>
						<strong>Data Portability:</strong>
						Receive a copy of your data in a structured, machine-readable format.
					</li>
				</ul>
				<p>
					To exercise these rights, contact us at
					{' '}
					<a href="mailto:support@tanstack.com" class="text-blue-600 underline">
						support@tanstack.com
					</a>
					.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">7. Third-Party Services</h2>
				<p>
					The Site may contain links to third-party services or websites. We are not responsible for
					the privacy practices of those third parties. Please review their privacy policies for
					more information.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">8. Children's Privacy</h2>
				<p>
					The Site is not intended for children under the age of 13, and we do not knowingly collect
					personal information from children. If we learn that we have collected information from a
					child, we will delete it promptly.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">9. Changes to This Privacy Policy</h2>
				<p>
					We may update this Privacy Policy from time to time. Any changes will be posted on this
					page with an updated "Effective Date." Your continued use of the Site after changes are
					posted constitutes acceptance of the revised Privacy Policy.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold">10. Contact Us</h2>
				<p>
					If you have questions about this Privacy Policy or how we handle your information, please
					contact us:
				</p>
				<address>
					<p>
						<strong>TanStack</strong>
					</p>
					<p>
						Email:
						{' '}
						<a href="mailto:support@tanstack.com" class="text-blue-600 underline">
							support@tanstack.com
						</a>
					</p>
				</address>
			</section>
		</div>
		<Footer />
	</div>;
}
