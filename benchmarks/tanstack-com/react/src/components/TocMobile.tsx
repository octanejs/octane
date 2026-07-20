import React from 'react';
import { Link } from '@tanstack/react-router';
import type { MarkdownHeading } from '~/utils/markdown';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TocMobileProps {
	headings: Array<MarkdownHeading>;
}

export function TocMobile({ headings }: TocMobileProps) {
	const [isOpen, setIsOpen] = React.useState(false);

	const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
		setIsOpen(event.currentTarget.open);
	};

	if (headings.length === 0) {
		return null;
	}

	return (
		<div className="lg:hidden flex bg-white/50 dark:bg-black/30 backdrop-blur-lg rounded-b-xl">
			<details className="flex-1" onToggle={handleToggle}>
				<summary
					className="py-3 text-sm font-medium w-full flex content-start items-center gap-2
          rounded-b-xl"
					aria-expanded={isOpen}
				>
					<span>{isOpen ? <ChevronDown /> : <ChevronRight />}</span>
					<span>On this page</span>
				</summary>
				<div className="py-2">
					<ul className="list-none grid gap-2">
						{headings.map((heading) => (
							<li
								key={`mobile-toc-${heading.id}`}
								style={{
									paddingLeft: `${(heading.level - 1) * 0.7}rem`,
								}}
							>
								<Link
									to="."
									className="text-sm transition-colors duration-200"
									hash={heading.id}
									dangerouslySetInnerHTML={{ __html: heading.text }}
									aria-label={heading.text.replace(/<\/?[^>]+(>|$)/g, '')}
								/>
							</li>
						))}
					</ul>
				</div>
			</details>
		</div>
	);
}
