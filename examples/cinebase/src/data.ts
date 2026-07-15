import type { Editorial, Title } from './types.js';

export const titles: readonly Title[] = [
	{
		__typename: 'Title',
		id: 'aurora-rising',
		name: 'Aurora Rising',
		tagline: 'The night sky remembers everything.',
		year: 2026,
		rating: 8.7,
		runtime: '2h 14m',
		kind: 'Film',
		genres: ['Science fiction', 'Drama'],
		poster: 'aurora',
		overview:
			'A climate cartographer follows an impossible aurora across the Arctic and discovers a signal hidden inside its light.',
		credits: [
			{ name: 'Nia Okafor', role: 'Director' },
			{ name: 'Mara Voss', role: 'Dr. Elian Ward' },
			{ name: 'Kenji Sato', role: 'Tomas Vale' },
		],
	},
	{
		__typename: 'Title',
		id: 'paper-moons',
		name: 'Paper Moons',
		tagline: 'Every lie casts a shadow.',
		year: 2025,
		rating: 8.3,
		runtime: '8 episodes',
		kind: 'Series',
		genres: ['Mystery', 'Drama'],
		poster: 'paper',
		overview:
			'A meticulous archivist finds a collection of fabricated newspapers predicting crimes that have not happened yet.',
		credits: [
			{ name: 'Inez Mora', role: 'Creator' },
			{ name: 'June Park', role: 'Sora Bell' },
			{ name: 'Adrian Cole', role: 'Emmett Pike' },
		],
	},
	{
		__typename: 'Title',
		id: 'harbor-lights',
		name: 'Harbor Lights',
		tagline: 'Home is a horizon you choose.',
		year: 2024,
		rating: 7.9,
		runtime: '1h 48m',
		kind: 'Film',
		genres: ['Romance', 'Drama'],
		poster: 'harbor',
		overview:
			'Two former friends rebuild a storm-damaged cinema and confront the version of their hometown they each left behind.',
		credits: [
			{ name: 'Luca Bell', role: 'Director' },
			{ name: 'Ari Mensah', role: 'Noah' },
			{ name: 'Elena Ruiz', role: 'Mia' },
		],
	},
	{
		__typename: 'Title',
		id: 'wildwood',
		name: 'Wildwood',
		tagline: 'Some paths only appear when you are lost.',
		year: 2026,
		rating: 8.1,
		runtime: '6 episodes',
		kind: 'Series',
		genres: ['Adventure', 'Family'],
		poster: 'wildwood',
		overview:
			'Three siblings inherit a field guide whose hand-drawn trails lead into a forest that changes with every visit.',
		credits: [
			{ name: 'Sana Reid', role: 'Creator' },
			{ name: 'Milo Chen', role: 'Finn' },
			{ name: 'Rhea Patel', role: 'Aya' },
		],
	},
	{
		__typename: 'Title',
		id: 'signal-lost',
		name: 'Signal Lost',
		tagline: 'The outage was only the beginning.',
		year: 2025,
		rating: 7.8,
		runtime: '10 episodes',
		kind: 'Series',
		genres: ['Thriller', 'Science fiction'],
		poster: 'signal',
		overview:
			'After a citywide communications outage, a radio producer receives broadcasts from exactly twenty-four hours in the future.',
		credits: [
			{ name: 'Tessa Bloom', role: 'Creator' },
			{ name: 'Omar Nasser', role: 'Rafi' },
			{ name: 'Mae Laurent', role: 'Celeste' },
		],
	},
	{
		__typename: 'Title',
		id: 'last-service',
		name: 'The Last Service',
		tagline: 'Tonight, every table has a story.',
		year: 2023,
		rating: 7.6,
		runtime: '1h 39m',
		kind: 'Film',
		genres: ['Comedy', 'Drama'],
		poster: 'service',
		overview:
			'On the final night of a beloved restaurant, its staff try to serve one perfect meal while regulars arrive to say goodbye.',
		credits: [
			{ name: 'Dev Anand', role: 'Director' },
			{ name: 'Nora Kim', role: 'Leah' },
			{ name: 'Pavel Orlov', role: 'Maks' },
		],
	},
];

export const editorial: Editorial = {
	kicker: 'Cinebase Journal',
	title: 'Why quiet science fiction is having a loud year',
	copy: 'From magnetic storms to future radio, this season’s most ambitious stories make room for silence.',
	featuredId: 'aurora-rising',
};

export function searchCatalog(search: string, genre: string): Title[] {
	const needle = search.trim().toLocaleLowerCase();
	return titles.filter((title) => {
		const matchesGenre = genre === '' || title.genres.includes(genre);
		const searchable = [title.name, title.tagline, title.overview, ...title.genres]
			.join(' ')
			.toLocaleLowerCase();
		return matchesGenre && (needle === '' || searchable.includes(needle));
	});
}

export function findTitle(id: string): Title | null {
	return titles.find((title) => title.id === id) ?? null;
}
