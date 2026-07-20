export interface Member {
	id: string;
	name: string;
	bio: string;
}

export function MemberCard(props: {
	member: Member;
	applause: number;
	onApplaud: (id: string) => void;
}) @{
	<article data-member-id={props.member.id}>
		<h2>
			{props.member.name as string}
		</h2>
		<output aria-label={'Applause ' + props.member.name}>
			{props.applause as string}
		</output>
		<button>{'Show details ' + props.member.name}</button>
		<button>{'Applaud twice ' + props.member.name}</button>
	</article>
}

export function TeamSummary(props: { total: number }) @{
	<output aria-label="Total applause">
		{props.total as string}
	</output>
}

export function App() @{
	<main>
		<h1>Team board</h1>
		<button>Reverse team</button>
		<TeamSummary total={0} />
	</main>
}
