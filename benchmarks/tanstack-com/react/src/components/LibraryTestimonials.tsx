import { Star } from 'lucide-react';
import type { Testimonial } from '~/libraries/types';
import { Card } from './Card';

export function LibraryTestimonials({ testimonials }: { testimonials?: Testimonial[] }) {
	if (!testimonials || testimonials.length === 0) return null;

	// Speed: roughly 25px per second
	const duration = (testimonials.length * 288 + testimonials.length * 24) / 25;

	return (
		<div className="w-full overflow-hidden py-8">
			<div className="mb-8 px-4">
				<h3 className="text-3xl font-bold">Loved by Developers</h3>
				<p className="text-sm text-gray-500 dark:text-gray-400 mt-2">See what teams are saying</p>
			</div>
			<div className="relative w-full">
				<div
					className="flex gap-6 items-stretch w-max animate-marquee"
					style={{
						animationDuration: `${duration}s`,
					}}
				>
					{[...testimonials, ...testimonials].map((testimonial, i) => (
						<TestimonialCard key={i} testimonial={testimonial} />
					))}
				</div>
			</div>
			<style
				dangerouslySetInnerHTML={{
					__html: `
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .animate-marquee {
              animation: marquee linear infinite;
            }
          `,
				}}
			/>
		</div>
	);
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
	return (
		<Card className="shrink-0 w-72 md:w-80 p-5">
			<div className="flex items-start gap-1 mb-3">
				{[...Array(5)].map((_, j) => (
					<Star key={j} className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
				))}
			</div>
			<p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
				"{testimonial.quote}"
			</p>
			<div className="text-xs text-gray-500 dark:text-gray-400">
				<div className="font-semibold text-gray-600 dark:text-gray-400">{testimonial.author}</div>
				<div>
					{testimonial.role} · {testimonial.company}
				</div>
			</div>
		</Card>
	);
}
