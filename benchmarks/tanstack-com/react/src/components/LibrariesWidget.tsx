import { Link } from '@tanstack/react-router';
import { publicLibraries } from '~/libraries';

const featuredLibraries = publicLibraries.slice(0, 8).map((library) => ({
	id: library.id,
	name: library.name,
}));

export function LibrariesWidget() {
	return (
		<div className="p-4">
			<div className="mb-3">
				<Link to="/" hash="libraries" className="font-semibold text-sm">
					Libraries
				</Link>
			</div>
			<div className="grid grid-cols-2 gap-2">
				{featuredLibraries.map((library) => (
					<Link
						key={library.id}
						to="/$libraryId"
						params={{ libraryId: library.id }}
						className="text-xs opacity-70 hover:opacity-100 hover:underline"
					>
						{library.name.replace('TanStack ', '')}
					</Link>
				))}
			</div>
		</div>
	);
}
