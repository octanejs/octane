import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { Button } from '~/ui';

export function AdminAccessDenied() {
	return (
		<div className="min-h-screen flex items-center justify-center">
			<div className="text-center">
				<Lock className="w-12 h-12 text-red-500 mx-auto mb-4" />
				<h1 className="text-2xl font-bold mb-2">Access Denied</h1>
				<p className="text-gray-600 dark:text-gray-400 mb-4">
					You don't have permission to access the admin area.
				</p>
				<Link to="/">
					<Button>Back to Home</Button>
				</Link>
			</div>
		</div>
	);
}
