import { Link } from '@octanejs/tanstack-router';
import { ChevronDown, Settings, Lock, LogOut, Sparkles, Key } from '@octanejs/lucide';
import { Avatar } from '~/components/Avatar.tsrx';
import {
	Dropdown,
	DropdownTrigger,
	DropdownContent,
	DropdownItem,
	DropdownSeparator,
} from '~/components/Dropdown.tsrx';

interface AuthenticatedUserMenuProps {
	user: | {
			image?: string | null;
			oauthImage?: string | null;
			name?: string | null;
			email?: string | null;
	  }
	| null;
	canAdmin: boolean;
	canApiKeys: boolean;
	onSignOut: () => void;
}

export function AuthenticatedUserMenu({
	user,
	canAdmin,
	canApiKeys,
	onSignOut,
}: AuthenticatedUserMenuProps) {
	return <Dropdown>
		<DropdownTrigger>
			<div class="flex items-center gap-1 cursor-pointer h-[26px]">
				<Avatar
					image={user?.image}
					oauthImage={user?.oauthImage}
					name={user?.name}
					email={user?.email}
					size="xs"
					className="w-[26px] h-[26px]"
				/>
				<ChevronDown className="w-3 h-3 opacity-50" />
			</div>
		</DropdownTrigger>
		<DropdownContent align="end">
			<div class="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
				{user?.email}
			</div>
			<DropdownSeparator />
			<DropdownItem asChild>
				<Link to="/account" className="flex items-center gap-2">
					<Settings className="w-4 h-4" />
					<span>Account</span>
				</Link>
			</DropdownItem>
			<DropdownItem asChild>
				<Link to="/account/submissions" className="flex items-center gap-2">
					<Sparkles className="w-4 h-4" />
					<span>My Showcases</span>
				</Link>
			</DropdownItem>
			{canApiKeys &&
				<DropdownItem asChild>
					<Link to="/account/integrations" className="flex items-center gap-2">
						<Key className="w-4 h-4" />
						<span>Integrations</span>
					</Link>
				</DropdownItem>}
			{canAdmin &&
				<DropdownItem asChild>
					<Link to="/admin" className="flex items-center gap-2">
						<Lock className="w-4 h-4" />
						<span>Admin</span>
					</Link>
				</DropdownItem>}
			<DropdownSeparator />
			<DropdownItem onSelect={onSignOut}>
				<LogOut className="w-4 h-4" />
				<span>Sign out</span>
			</DropdownItem>
		</DropdownContent>
	</Dropdown>;
}
