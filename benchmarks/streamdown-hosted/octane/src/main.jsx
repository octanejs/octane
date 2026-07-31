import { createCodePlugin } from '@octanejs/streamdown/code';
import { createMathPlugin } from '@octanejs/streamdown/math';
import { Streamdown } from '@octanejs/streamdown';
import { OctaneCompat } from 'octane/react';
import { mountBenchmark } from '../../shared/app.jsx';
import '@octanejs/streamdown/styles.css';
import 'katex/dist/katex.min.css';
import '../../shared/style.css';

const plugins = {
	code: createCodePlugin(),
	math: createMathPlugin({ singleDollarTextMath: true }),
};

function OctaneStreamdown({ content, mode }) {
	return (
		<OctaneCompat
			component={Streamdown}
			props={{
				animated: false,
				className: 'bench-streamdown',
				controls: false,
				children: content,
				isAnimating: false,
				lineNumbers: false,
				mode,
				parseIncompleteMarkdown: mode === 'streaming',
				plugins,
			}}
		/>
	);
}

mountBenchmark(OctaneStreamdown);
