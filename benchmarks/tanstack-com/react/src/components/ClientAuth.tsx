import { ErrorComponent } from '@tanstack/react-router';
import React from 'react';
import { Spinner } from '~/components/Spinner';
import { SignInForm } from '~/routes/login';
import { useCurrentUserQuery } from '~/hooks/useCurrentUser';
import { hasCapability } from '~/db/types';

const baseClasses = 'p-4 flex flex-col items-center justify-center gap-4';

type UserQueryResult = ReturnType<typeof useCurrentUserQuery>;

export function ClientAuth({
	children,
}: {
	children: React.ReactNode | ((userQuery: UserQueryResult) => React.ReactNode);
}) {
	const userQuery = useCurrentUserQuery();

	if (userQuery.isLoading) {
		return (
			<div className={baseClasses}>
				<Spinner />
			</div>
		);
	}

	if (userQuery.isError) {
		return (
			<div className={baseClasses}>
				<ErrorComponent error={userQuery.error} />
			</div>
		);
	}

	if (!userQuery.data) {
		return (
			<div className={baseClasses}>
				You are not authorized to access this page.
				<SignInForm />
			</div>
		);
	}

	return typeof children === 'function' ? children(userQuery) : children;
}

export function ClientAdminAuth({ children }: { children: React.ReactNode }) {
	const userQuery = useCurrentUserQuery();

	if (userQuery.isLoading) {
		return (
			<div className={baseClasses}>
				<Spinner />
			</div>
		);
	}

	if (userQuery.isError) {
		return (
			<div className={baseClasses}>
				<ErrorComponent error={userQuery.error} />
			</div>
		);
	}

	const capabilities = userQuery.data?.capabilities || [];
	const canAdmin = hasCapability(capabilities, 'admin');

	if (!canAdmin) {
		return (
			<div className={baseClasses}>You do not have sufficient permissions to access this page.</div>
		);
	}

	return <>{children}</>;
}
