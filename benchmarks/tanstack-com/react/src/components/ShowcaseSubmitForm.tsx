import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { submitShowcase, updateShowcase } from '~/utils/showcase.functions';
import { libraries } from '~/libraries';
import { SHOWCASE_USE_CASES_UI, type Showcase, type ShowcaseUseCase } from '~/db/types';
import { getAutoIncludedLibraries, USE_CASE_LABELS } from '~/utils/showcase.shared';
import { useToast } from './ToastProvider';
import { Check, AlertCircle } from 'lucide-react';
import { Button, FormInput } from '~/ui';
import { ImageUpload } from './ImageUpload';
import { FormEvent, useMemo, useState } from 'react';

// Filter to only show libraries with proper configuration
const selectableLibraries = libraries.filter(
	(lib) => lib.name && lib.id !== 'react-charts' && lib.id !== 'create-tsrouter-app',
);

interface ShowcaseSubmitFormProps {
	showcase?: Showcase;
}

export function ShowcaseSubmitForm({ showcase }: ShowcaseSubmitFormProps) {
	const navigate = useNavigate();
	const { notify } = useToast();
	const isEditMode = !!showcase;

	const [name, setName] = useState(showcase?.name ?? '');
	const [tagline, setTagline] = useState(showcase?.tagline ?? '');
	const [description, setDescription] = useState(showcase?.description ?? '');
	const [url, setUrl] = useState(showcase?.url ?? '');
	const [logoUrl, setLogoUrl] = useState<string | undefined>(showcase?.logoUrl ?? undefined);
	const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(
		showcase?.screenshotUrl ?? undefined,
	);
	const [selectedLibraries, setSelectedLibraries] = useState<string[]>(showcase?.libraries ?? []);
	const [selectedUseCases, setSelectedUseCases] = useState<ShowcaseUseCase[]>(
		showcase?.useCases ?? [],
	);
	const [isOpenSource, setIsOpenSource] = useState(!!showcase?.sourceUrl);
	const [sourceUrl, setSourceUrl] = useState(showcase?.sourceUrl ?? '');

	// Get auto-included libraries based on selection
	const autoIncluded = useMemo(
		() => getAutoIncludedLibraries(selectedLibraries),
		[selectedLibraries],
	);

	const onSuccess = () => {
		notify(
			<div>
				<div className="font-medium">
					{isEditMode ? 'Showcase updated!' : 'Showcase submitted!'}
				</div>
				<div className="text-gray-500 dark:text-gray-400 text-xs">
					{isEditMode
						? 'Your changes are pending review. Votes have been preserved.'
						: "Your project is pending review. We'll notify you when it's approved."}
				</div>
			</div>,
		);
		navigate({ to: '/account/submissions' });
	};

	const onError = (error: Error) => {
		notify(
			<div>
				<div className="font-medium">{isEditMode ? 'Update failed' : 'Submission failed'}</div>
				<div className="text-gray-500 dark:text-gray-400 text-xs">{error.message}</div>
			</div>,
		);
	};

	const createMutation = useMutation({
		mutationFn: submitShowcase,
		onSuccess,
		onError,
	});

	const editMutation = useMutation({
		mutationFn: updateShowcase,
		onSuccess,
		onError,
	});

	const isPending = createMutation.isPending || editMutation.isPending;

	const toggleLibrary = (libraryId: string) => {
		// Can't toggle auto-included libraries
		if (autoIncluded[libraryId]) return;

		setSelectedLibraries((prev) =>
			prev.includes(libraryId) ? prev.filter((id) => id !== libraryId) : [...prev, libraryId],
		);
	};

	const toggleUseCase = (useCase: ShowcaseUseCase) => {
		setSelectedUseCases((prev) =>
			prev.includes(useCase) ? prev.filter((c) => c !== useCase) : [...prev, useCase],
		);
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();

		if (selectedLibraries.length === 0) {
			notify(
				<div>
					<div className="font-medium">Select at least one library</div>
				</div>,
			);
			return;
		}

		if (!screenshotUrl) {
			notify(
				<div>
					<div className="font-medium">Screenshot is required</div>
				</div>,
			);
			return;
		}

		// Validate source URL is provided when open source is checked
		if (isOpenSource && !sourceUrl) {
			notify(
				<div>
					<div className="font-medium">Source code URL is required</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Please provide a link to your source code repository.
					</div>
				</div>,
			);
			return;
		}

		// Warn user if editing an approved showcase
		if (isEditMode && showcase.status === 'approved') {
			const confirmed = confirm(
				'Saving changes will reset your showcase to pending review until re-approved. Your votes will be preserved. Continue?',
			);
			if (!confirmed) {
				return;
			}
		}

		const formData = {
			name,
			tagline,
			description: description || undefined,
			url,
			logoUrl,
			screenshotUrl,
			sourceUrl: isOpenSource ? sourceUrl : undefined,
			libraries: selectedLibraries,
			useCases: selectedUseCases,
		};

		if (isEditMode) {
			editMutation.mutate({
				data: { ...formData, showcaseId: showcase.id },
			});
		} else {
			createMutation.mutate({ data: formData });
		}
	};

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-gray-950">
			<div className="max-w-2xl mx-auto px-4 py-12">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
					{isEditMode ? 'Edit Your Project' : 'Submit Your Project'}
				</h1>
				<p className="mt-2 text-gray-600 dark:text-gray-400">
					{isEditMode
						? 'Update your showcase submission. Changes will require re-approval but votes will be preserved.'
						: "Share what you've built with TanStack libraries. Your submission will be reviewed before appearing in the showcase."}
				</p>

				<form onSubmit={handleSubmit} className="mt-8 space-y-6">
					{/* Project Name */}
					<div>
						<label
							htmlFor="name"
							className="block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Project Name *
						</label>
						<FormInput
							type="text"
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							maxLength={255}
							className="mt-1 px-4 py-3"
							placeholder="My Awesome App"
						/>
					</div>

					{/* Project URL */}
					<div>
						<label
							htmlFor="url"
							className="block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Project URL *
						</label>
						<FormInput
							type="url"
							id="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							required
							className="mt-1 px-4 py-3"
							placeholder="https://your-project.com"
						/>
					</div>

					{/* Tagline */}
					<div>
						<label
							htmlFor="tagline"
							className="block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Tagline *
						</label>
						<FormInput
							type="text"
							id="tagline"
							value={tagline}
							onChange={(e) => setTagline(e.target.value)}
							required
							maxLength={500}
							className="mt-1 px-4 py-3"
							placeholder="A brief description of your project"
						/>
						<p className="mt-1 text-xs text-gray-500">{tagline.length}/500 characters</p>
					</div>

					{/* Description */}
					<div>
						<label
							htmlFor="description"
							className="block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Description
						</label>
						<textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={4}
							className="mt-1 block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
							placeholder="Tell us more about your project..."
						/>
					</div>

					{/* Screenshot */}
					<ImageUpload
						value={screenshotUrl}
						onChange={setScreenshotUrl}
						label="Screenshot"
						hint="16:9 aspect ratio recommended"
						required
						aspectRatio="video"
					/>

					{/* Logo */}
					<ImageUpload
						value={logoUrl}
						onChange={setLogoUrl}
						label="Logo"
						hint="Optional: Square logo for your project"
						aspectRatio="square"
					/>

					{/* Open Source */}
					<div className="space-y-3">
						<label className="flex items-center gap-3 cursor-pointer">
							<input
								type="checkbox"
								checked={isOpenSource}
								onChange={(e) => {
									setIsOpenSource(e.target.checked);
									if (!e.target.checked) setSourceUrl('');
								}}
								className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
							/>
							<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
								This project is open source
							</span>
						</label>

						{isOpenSource && (
							<div>
								<label
									htmlFor="sourceUrl"
									className="block text-sm font-medium text-gray-700 dark:text-gray-300"
								>
									Source Code URL *
								</label>
								<FormInput
									type="url"
									id="sourceUrl"
									value={sourceUrl}
									onChange={(e) => setSourceUrl(e.target.value)}
									required
									className="mt-1 px-4 py-3"
									placeholder="https://github.com/username/repo"
								/>
								<p className="mt-1 text-xs text-gray-500">
									Link to GitHub, GitLab, or other repository
								</p>
							</div>
						)}
					</div>

					{/* Libraries */}
					<div>
						{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
							TanStack Libraries Used *
						</label>
						<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
							{selectableLibraries.map((lib) => {
								const isSelected = selectedLibraries.includes(lib.id);
								const isAutoIncluded = !!autoIncluded[lib.id];

								return (
									<button
										key={lib.id}
										type="button"
										onClick={() => toggleLibrary(lib.id)}
										disabled={isAutoIncluded}
										className={`relative flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors text-left ${
											isSelected || isAutoIncluded
												? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
												: 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
										} ${isAutoIncluded ? 'opacity-60 cursor-not-allowed' : ''}`}
									>
										{(isSelected || isAutoIncluded) && <Check className="w-4 h-4 text-blue-600" />}
										<span className="text-sm font-medium text-gray-900 dark:text-white">
											{lib.name?.replace('TanStack ', '')}
										</span>
										{isAutoIncluded && (
											<span className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded-full">
												auto
											</span>
										)}
									</button>
								);
							})}
						</div>
						{selectedLibraries.length === 0 && (
							<p className="mt-2 text-sm text-red-500 flex items-center gap-1">
								<AlertCircle className="w-4 h-4" />
								Select at least one library
							</p>
						)}
					</div>

					{/* Use Cases */}
					<div>
						{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
							Use Cases
						</label>
						<div className="flex flex-wrap gap-2">
							{SHOWCASE_USE_CASES_UI.map((useCase) => {
								const isSelected = selectedUseCases.includes(useCase);

								return (
									<button
										key={useCase}
										type="button"
										onClick={() => toggleUseCase(useCase)}
										className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
											isSelected
												? 'bg-blue-600 text-white'
												: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
										}`}
									>
										{USE_CASE_LABELS[useCase]}
									</button>
								);
							})}
						</div>
						<p className="mt-2 text-xs text-gray-500">
							Optional: Help others discover your project by category
						</p>
					</div>

					{/* Submit Button */}
					<div className="pt-4 flex gap-3">
						{isEditMode && (
							<Button
								type="button"
								onClick={() => navigate({ to: '/account/submissions' })}
								className="flex-1 justify-center px-6 py-3 font-medium rounded-lg"
							>
								Cancel
							</Button>
						)}
						<Button
							type="submit"
							disabled={isPending || selectedLibraries.length === 0 || !screenshotUrl}
							className={`${isEditMode ? 'flex-1' : 'w-full'} justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg border-none`}
						>
							{isPending
								? isEditMode
									? 'Saving...'
									: 'Submitting...'
								: isEditMode
									? 'Save Changes'
									: 'Submit for Review'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
