import { useState } from 'octane';

export interface Member {
	id: string;
	name: string;
	bio: string;
}

const members: Member[] = [
	{ id: 'ada', name: 'Ada', bio: 'Designs accessible systems' },
	{ id: 'grace', name: 'Grace', bio: 'Operates cloud services' },
];

export function MemberCard(props: {
	member: Member;
	applause: number;
	onApplaud: (id: string) => void;
}) @{
	const [detailsOpen, setDetailsOpen] = useState(false);

	<article data-member-id={props.member.id}>
		<h2>
			{props.member.name as string}
		</h2>
		<output aria-label={'Applause ' + props.member.name}>
			{props.applause as string}
		</output>
		<button
			aria-label={(detailsOpen ? 'Hide details ' : 'Show details ') + props.member.name}
			onClick={() => setDetailsOpen((open) => !open)}
		>
			{detailsOpen ? 'Hide details' : 'Show details'}
		</button>
		<button
			aria-label={'Applaud twice ' + props.member.name}
			onClick={() => {
				props.onApplaud(props.member.id);
				props.onApplaud(props.member.id);
			}}
		>
			Applaud twice
		</button>
		@if (detailsOpen) {
			<p>
				{props.member.bio as string}
			</p>
		}
	</article>
}

export function TeamSummary(props: { total: number }) @{
	<output aria-label="Total applause">
		{props.total as string}
	</output>
}

export function App() @{
	const [applause, setApplause] = useState<Record<string, number>>({ ada: 0, grace: 0 });
	const [reversed, setReversed] = useState(false);
	const orderedMembers =
		reversed ? [...members].reverse() : members;
	const total = Object.values(applause).reduce((sum, count) => sum + count, 0);
	const applaud = (id: string) => {
		setApplause(
			(current) => ({
				...current,
				[id]: (current[id] ?? 0) + 1,
			}),
		);
	};

	<main>
		<h1>Team board</h1>
		<button onClick={() => setReversed((value) => !value)}>Reverse team</button>
		<TeamSummary total={total} />
		<section aria-label="Team members">
			@for (const member of orderedMembers; key member.id) {
				<MemberCard member={member} applause={applause[member.id] ?? 0} onApplaud={applaud} />
			}
		</section>
	</main>
}
