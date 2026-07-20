/**
 * TemplatePicker - Preset template selection for common app types
 */

import { twMerge } from 'tailwind-merge';
import { TEMPLATES } from '~/builder/templates';
import { useBuilderStore } from './store';

export function TemplatePicker() {
	const selectedTemplate = useBuilderStore((s) => s.selectedTemplate);
	const setTemplate = useBuilderStore((s) => s.setTemplate);
	const featuresLoaded = useBuilderStore((s) => s.featuresLoaded);

	return (
		<div className="p-4 pb-0">
			<h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">Template</h3>
			<p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
				Start with a preset configuration
			</p>
			<div className="grid grid-cols-2 gap-2">
				{TEMPLATES.map((template) => {
					const Icon = template.icon;
					const isSelected = selectedTemplate === template.id;
					const color = template.color;

					return (
						<button
							key={template.id}
							type="button"
							onClick={() => setTemplate(template.id)}
							disabled={!featuresLoaded}
							className={twMerge(
								'flex items-center gap-2.5 p-2.5 rounded-lg border-2 transition-all text-left',
								isSelected
									? ''
									: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800',
								!featuresLoaded && 'opacity-50 cursor-wait',
							)}
							style={
								isSelected
									? {
											borderColor: color,
											backgroundColor: `${color}15`,
										}
									: undefined
							}
						>
							<div
								className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-white"
								style={{ backgroundColor: color }}
							>
								<Icon className="w-4 h-4" />
							</div>
							<div className="min-w-0 flex-1">
								<div
									className={twMerge(
										'text-sm font-medium truncate',
										!isSelected && 'text-gray-900 dark:text-white',
									)}
									style={isSelected ? { color } : undefined}
								>
									{template.name}
								</div>
								<div className="text-xs text-gray-500 dark:text-gray-400 truncate">
									{template.description}
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
