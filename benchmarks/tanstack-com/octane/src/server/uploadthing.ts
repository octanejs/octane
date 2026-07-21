import { createUploadthing, UploadThingError } from 'uploadthing/server';
import type { FileRouter } from 'uploadthing/server';
import { getAuthService } from '~/auth/index.server';
import { getUserRepository } from '~/auth/index.server';

const f = createUploadthing();

export const uploadRouter = {
	avatarUploader: f({
		image: {
			maxFileSize: '2MB',
			maxFileCount: 1,
		},
	})
		.middleware(async ({ req }) => {
			const authService = getAuthService();
			const user = await authService.getCurrentUser(req);

			if (!user) {
				throw new UploadThingError('Unauthorized');
			}

			return { userId: user.userId };
		})
		.onUploadComplete(async ({ metadata, file }) => {
			const userRepository = getUserRepository();

			await userRepository.update(metadata.userId, {
				image: file.ufsUrl,
			});

			return { url: file.ufsUrl };
		}),

	showcaseUploader: f(
		{
			image: {
				maxFileSize: '4MB',
				maxFileCount: 1,
			},
		},
		{ awaitServerData: false },
	)
		.middleware(async ({ req }) => {
			const authService = getAuthService();
			const user = await authService.getCurrentUser(req);

			if (!user) {
				throw new UploadThingError('Unauthorized');
			}

			return { userId: user.userId };
		})
		.onUploadComplete(async ({ metadata }) => {
			return { uploadedBy: metadata.userId };
		}),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
