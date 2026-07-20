import { Link } from '@tanstack/react-router';
import { Card } from './Card';

const footerLinks = [
	{ label: 'Blog', to: '/blog' },
	{ label: '@Tan_Stack on X.com', to: 'https://x.com/tan_stack' },
	{
		label: '@TannerLinsley on X.com',
		to: 'https://x.com/tannerlinsley',
	},
	{ label: 'GitHub', to: 'https://github.com/tanstack' },
	{
		label: 'YouTube',
		to: 'https://youtube.com/@tan_stack',
	},
	{
		label: 'Nozzle.io - Keyword Rank Tracker',
		to: 'https://nozzle.io',
	},
	{
		label: 'Ethos',
		to: '/ethos',
	},
	{
		label: 'Tenets',
		to: '/tenets',
	},
	{
		label: 'Privacy Policy',
		to: '/privacy',
	},
	{
		label: 'Terms of Service',
		to: '/terms',
	},
];

export function Footer() {
	return (
		<Card
			className={`relative flex flex-col items-start justify-center gap-4 p-8
      max-w-(--breakpoint-lg) mx-auto text-sm`}
		>
			<div className={`grid gap-1 sm:grid-cols-2 md:grid-cols-3`}>
				{footerLinks.map((item) => (
					<div key={item.to}>
						{item.to.startsWith('http') ? (
							<a href={item.to} target="_blank" rel="noreferrer">
								{item.label}
							</a>
						) : (
							<Link to={item.to}>{item.label}</Link>
						)}
					</div>
				))}
			</div>
			<div className={`text-center opacity-60`}>&copy; {new Date().getFullYear()} TanStack LLC</div>
		</Card>
	);
}
