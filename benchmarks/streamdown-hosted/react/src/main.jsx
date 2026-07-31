import { createCodePlugin } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { Streamdown } from 'streamdown';
import { mountBenchmark } from '../../shared/app.jsx';
import 'katex/dist/katex.min.css';
import 'streamdown/styles.css';
import '../../shared/style.css';

const plugins = {
	code: createCodePlugin(),
	math: createMathPlugin({ singleDollarTextMath: true }),
};

function ReactStreamdown({ content, mode }) {
	return (
		<Streamdown
			animated={false}
			className="bench-streamdown"
			controls={false}
			isAnimating={false}
			lineNumbers={false}
			mode={mode}
			parseIncompleteMarkdown={mode === 'streaming'}
			plugins={plugins}
		>
			{content}
		</Streamdown>
	);
}

mountBenchmark(ReactStreamdown);
