import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, RotateCcw, Trash2 } from 'lucide-react';
import { Avatar } from '~/components/Avatar';
import { AvatarCropModal } from '~/components/AvatarCropModal';
import { useToast } from '~/components/ToastProvider';
import { Button } from '~/ui';
import { removeProfileImage, revertProfileImage } from '~/utils/users.functions';
import { useUploadThing } from '~/utils/uploadthing.client';
import { currentUserQueryOptions } from '~/hooks/useCurrentUser';
import { AVATAR_IMAGE_MAX_BYTES, validateImageUploadFile } from '~/utils/upload-preflight';

type AccountProfileUser = {
	image?: string | null;
	oauthImage?: string | null;
	name?: string | null;
	email?: string | null;
};

export function AccountProfilePictureSection({ user }: { user: AccountProfileUser | undefined }) {
	const queryClient = useQueryClient();
	const { notify } = useToast();

	const [cropModalOpen, setCropModalOpen] = React.useState(false);
	const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
	const [isUploading, setIsUploading] = React.useState(false);
	const [isReverting, setIsReverting] = React.useState(false);
	const [isRemoving, setIsRemoving] = React.useState(false);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const { startUpload } = useUploadThing('avatarUploader', {
		onClientUploadComplete: () => {
			setIsUploading(false);
			queryClient.invalidateQueries(currentUserQueryOptions);
			notify(
				<div>
					<div className="font-medium">Profile picture updated</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Your new avatar is now live
					</div>
				</div>,
			);
		},
		onUploadError: (error) => {
			setIsUploading(false);
			notify(
				<div>
					<div className="font-medium">Upload failed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">{error.message}</div>
				</div>,
			);
		},
	});

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			const validationError = validateImageUploadFile(file, AVATAR_IMAGE_MAX_BYTES);

			if (validationError) {
				notify(
					<div>
						<div className="font-medium">Upload unavailable</div>
						<div className="text-gray-500 dark:text-gray-400 text-xs">{validationError}</div>
					</div>,
				);
				e.target.value = '';
				return;
			}

			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === 'string') {
					setSelectedImage(reader.result);
					setCropModalOpen(true);
				}
			};
			reader.readAsDataURL(file);
		}
		e.target.value = '';
	};

	const handleCropComplete = async (croppedBlob: Blob) => {
		setIsUploading(true);
		const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
		await startUpload([file]);
	};

	const handleRevertToOAuth = async () => {
		if (!user?.oauthImage) return;

		setIsReverting(true);
		try {
			await revertProfileImage();
			queryClient.invalidateQueries(currentUserQueryOptions);
			notify(
				<div>
					<div className="font-medium">Profile picture reverted</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Using your OAuth provider image
					</div>
				</div>,
			);
		} catch {
			notify(
				<div>
					<div className="font-medium">Error</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Failed to revert profile picture
					</div>
				</div>,
			);
		} finally {
			setIsReverting(false);
		}
	};

	const handleRemovePhoto = async () => {
		setIsRemoving(true);
		try {
			await removeProfileImage();
			queryClient.invalidateQueries(currentUserQueryOptions);
			notify(
				<div>
					<div className="font-medium">Profile picture removed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">Using default avatar</div>
				</div>,
			);
		} catch {
			notify(
				<div>
					<div className="font-medium">Error</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Failed to remove profile picture
					</div>
				</div>,
			);
		} finally {
			setIsRemoving(false);
		}
	};

	const hasCustomImage = user?.image && user.image !== user.oauthImage;
	const canRevert = hasCustomImage && user?.oauthImage;
	const hasAnyImage = user?.image || user?.oauthImage;

	return (
		<>
			<div className="flex items-center gap-4">
				<div className="relative group">
					<Avatar
						image={user?.image}
						oauthImage={user?.oauthImage}
						name={user?.name}
						email={user?.email}
						size="xl"
					/>
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						disabled={isUploading}
						className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
					>
						<Camera className="w-6 h-6 text-white" />
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						onChange={handleFileSelect}
						className="hidden"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Button
						variant="ghost"
						size="xs"
						onClick={() => fileInputRef.current?.click()}
						disabled={isUploading}
					>
						<Camera className="w-3.5 h-3.5" />
						{isUploading ? 'Uploading...' : 'Change photo'}
					</Button>
					{canRevert && (
						<Button variant="ghost" size="xs" onClick={handleRevertToOAuth} disabled={isReverting}>
							<RotateCcw className="w-3.5 h-3.5" />
							{isReverting ? 'Reverting...' : 'Revert to original'}
						</Button>
					)}
					{hasAnyImage && (
						<Button variant="ghost" size="xs" onClick={handleRemovePhoto} disabled={isRemoving}>
							<Trash2 className="w-3.5 h-3.5" />
							{isRemoving ? 'Removing...' : 'Remove photo'}
						</Button>
					)}
				</div>
			</div>

			{selectedImage && (
				<AvatarCropModal
					open={cropModalOpen}
					onOpenChange={(open) => {
						setCropModalOpen(open);
						if (!open) setSelectedImage(null);
					}}
					imageSrc={selectedImage}
					onCropComplete={handleCropComplete}
				/>
			)}
		</>
	);
}
