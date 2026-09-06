import fs from 'node:fs';
import path from 'node:path';
import { adaptRefProps } from './ref-props-adaptation.mjs';

// Upgrade authoring helper, always sourced from the verified immutable tree.
const packageRoot = path.resolve('packages/base-ui');
const sourceRoot = path.join(packageRoot, 'upstream/src');
const previous = path.resolve('.react-port-work/base-ui-1-8-complete/previous/src');
if (!fs.existsSync(previous)) fs.renameSync(path.join(packageRoot, 'src'), previous);
for (const file of fs
	.readdirSync(sourceRoot, { recursive: true })
	.filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.(test|spec)\./.test(file))) {
	let source = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
	source = adaptRefProps(source, file)
		.replaceAll("from 'react'", "from 'octane'")
		.replaceAll("from 'react-dom'", "from 'octane'")
		.replaceAll('@base-ui/utils', '@octanejs/base-ui-utils')
		.replaceAll('@base-ui/react', '@octanejs/base-ui')
		.replaceAll('@floating-ui/react-dom', '@octanejs/floating-ui')
		.replaceAll('React.ReactNode', 'React.OctaneNode')
		.replaceAll('React.ForwardedRef<', 'React.Ref<');
	const output = path.join(packageRoot, 'src', file.replace(/\.tsx$/, '.tsrx'));
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, source);
}
// .ts imports of authored .tsrx use explicit extensions for declaration resolution.
for (const file of fs
	.readdirSync(path.join(packageRoot, 'src'), { recursive: true })
	.filter((file) => /\.(ts|tsrx)$/.test(file))) {
	const absolute = path.join(packageRoot, 'src', file);
	let source = fs
		.readFileSync(absolute, 'utf8')
		.replace(/(from\s+|import\s*)(')(\.[^']+)(')/g, (full, prefix, quote, specifier, end) => {
			return fs.existsSync(path.resolve(path.dirname(absolute), specifier + '.tsrx'))
				? `${prefix}${quote}${specifier}.tsrx${end}`
				: full;
		});
	fs.writeFileSync(absolute, source);
}
