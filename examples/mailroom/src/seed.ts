import type { MailroomState } from './types';

export function createSeedState(): MailroomState {
	return {
		messages: [
			{
				id: 'launch-window',
				from: 'Nadia Wells',
				to: ['you@northstar.test'],
				subject: 'The launch window is ours',
				preview: 'The final rehearsal landed cleanly. I saved the room for Thursday…',
				body: [
					'The final rehearsal landed cleanly. I saved the room for Thursday at 09:30.',
					'Bring the revised narrative and the customer notes. We only need one decision: whether the quiet rollout becomes our default.',
					'Proud of this team — Nadia',
				],
				receivedAt: '09:42',
				folder: 'inbox',
				read: false,
				starred: true,
			},
			{
				id: 'field-notes',
				from: 'Arun Patel',
				to: ['you@northstar.test'],
				subject: 'Field notes from the pilot',
				preview: 'People understood the new handoff without a walkthrough…',
				body: [
					'People understood the new handoff without a walkthrough, which is the strongest signal from today.',
					'I attached the three moments worth replaying in Friday’s review. The second one changed how I think about the empty state.',
				],
				receivedAt: 'Yesterday',
				folder: 'inbox',
				read: true,
				starred: false,
			},
			{
				id: 'design-critique',
				from: 'Mira Chen',
				to: ['you@northstar.test'],
				subject: 'A calmer design critique',
				preview: 'I grouped the open questions by confidence instead of by screen…',
				body: [
					'I grouped the open questions by confidence instead of by screen. It made the critique feel like a decision, not a tour.',
					'Could you read the last section before our 14:00? I would value your eye on the language.',
				],
				receivedAt: 'Mon',
				folder: 'inbox',
				read: true,
				starred: false,
			},
			{
				id: 'weekly-signal',
				from: 'Northstar Research',
				to: ['you@northstar.test'],
				subject: 'Weekly signal · 12 July',
				preview: 'Activation held while the support queue fell for a second week…',
				body: [
					'Activation held while the support queue fell for a second week.',
					'The most useful qualitative signal: teams are naming the workflow after their own process rather than ours.',
				],
				receivedAt: '12 Jul',
				folder: 'inbox',
				read: true,
				starred: false,
			},
			{
				id: 'sent-recap',
				from: 'You',
				to: ['studio@northstar.test'],
				subject: 'Recap: decisions from Tuesday',
				preview: 'We will keep the smaller launch group and publish the learning log…',
				body: [
					'We will keep the smaller launch group and publish the learning log after every session.',
					'Thank you for making the trade-offs so clear.',
				],
				receivedAt: 'Tue',
				folder: 'sent',
				read: true,
				starred: false,
			},
		],
		drafts: [
			{
				id: 'partnership-note',
				to: 'partner@atlas.test',
				subject: 'A thoughtful next step',
				body: 'Thanks for the generous workshop. I would like to turn the strongest idea into a small shared pilot.',
				updatedAt: 'Saved yesterday',
			},
		],
		outbox: [],
		nextDraft: 1,
		nextOutbox: 1,
		nextSent: 1,
		mutationVersions: {},
		consumedFaults: [],
	};
}
