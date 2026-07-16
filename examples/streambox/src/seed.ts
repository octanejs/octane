import type { CommentRecord, VideoRecord } from './types';

export const VIDEOS: readonly VideoRecord[] = [
	{
		id: 'neon-tides',
		title: 'Neon tides: a night swim in the city',
		creator: 'Northstar Studio',
		creatorInitials: 'NS',
		category: 'Short film',
		description:
			'A quiet visual essay about finding open water between the lights, concrete, and midnight trains of a sleepless city.',
		views: '184K views',
		published: 'Premiered 3 days ago',
		durationLabel: '0:06',
		accent: '#ff5b8d',
		poster: '/posters/neon-tides.svg',
		chapters: [
			{ title: 'Streetlight', start: 0 },
			{ title: 'The crossing', start: 2 },
			{ title: 'Open water', start: 4 },
		],
		transcript: [
			{ start: 0, text: 'The city keeps its own kind of tide.' },
			{ start: 2, text: 'We follow the reflections until the streets fall away.' },
			{ start: 4, text: 'For six quiet seconds, the horizon belongs to everyone.' },
		],
	},
	{
		id: 'quiet-current',
		title: 'The quiet current beneath the pines',
		creator: 'Field Notes',
		creatorInitials: 'FN',
		category: 'Field journal',
		description:
			'A pocket field journal following meltwater from a high forest into the first broad river bend of spring.',
		views: '92K views',
		published: 'Published last week',
		durationLabel: '0:06',
		accent: '#79d6b1',
		poster: '/posters/quiet-current.svg',
		chapters: [
			{ title: 'Headwater', start: 0 },
			{ title: 'Understory', start: 2 },
			{ title: 'River bend', start: 4 },
		],
		transcript: [
			{ start: 0, text: 'Every river begins as a sound you almost miss.' },
			{ start: 2, text: 'Below the pines, the snow remembers how to move.' },
			{ start: 4, text: 'By the bend, a whisper has become a current.' },
		],
	},
	{
		id: 'signal-garden',
		title: 'Growing a garden from radio signals',
		creator: 'Good Frequency',
		creatorInitials: 'GF',
		category: 'Design',
		description:
			'An experimental garden turns a day of community radio into shape, color, and movement.',
		views: '61K views',
		published: 'Published 2 weeks ago',
		durationLabel: '0:06',
		accent: '#c5a1ff',
		poster: '/posters/signal-garden.svg',
		chapters: [
			{ title: 'Tune in', start: 0 },
			{ title: 'Pattern language', start: 2 },
			{ title: 'In bloom', start: 4 },
		],
		transcript: [
			{ start: 0, text: 'What if a broadcast could leave something growing behind?' },
			{ start: 2, text: 'Every voice bends the garden in a different direction.' },
			{ start: 4, text: 'At sunset, the whole frequency comes into bloom.' },
		],
	},
];

const AUTHORS = [
	['Mara Vale', 'MV'],
	['Eli Park', 'EP'],
	['Jon Bell', 'JB'],
	['Nia Rivers', 'NR'],
	['Sam Lumen', 'SL'],
	['Priya Moss', 'PM'],
	['Theo Wynn', 'TW'],
	['Inez Cole', 'IC'],
] as const;

const THOUGHTS = [
	'The color shift here is so restrained and beautiful.',
	'I came back for the sound design and noticed a completely new detail.',
	'This feels like a whole evening folded into a few seconds.',
	'The transition at the midpoint is quietly perfect.',
	'Would love a longer field note about how this sequence was made.',
	'That final frame has been living in my head all week.',
	'The pacing gives every texture enough room to breathe.',
	'Watching this with headphones made the whole scene open up.',
] as const;

export function createComments(videoId: string): CommentRecord[] {
	return Array.from({ length: 180 }, (_, index) => {
		const author = AUTHORS[(index * 3 + videoId.length) % AUTHORS.length];
		const thought = THOUGHTS[(index * 5 + videoId.length) % THOUGHTS.length];
		return {
			id: `${videoId}-comment-${index + 1}`,
			index,
			author: author[0],
			initials: author[1],
			when: index === 0 ? 'Pinned · 2 hours ago' : `${(index % 23) + 1} hours ago`,
			body:
				index === 0
					? 'Creator note: look for the reflection just after the second chapter.'
					: thought,
			likes: 4 + ((index * 17 + videoId.length) % 240),
			timecode: index % 3 === 0 ? 2 : 4,
			creatorLiked: index % 11 === 0,
		};
	});
}

export function findVideo(videoId: string): VideoRecord {
	return VIDEOS.find((video) => video.id === videoId) ?? VIDEOS[0];
}
