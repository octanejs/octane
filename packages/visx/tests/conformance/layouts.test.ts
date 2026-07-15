import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '../../../octane/tests/_helpers';
import { LayoutFamiliesFixture } from '../_fixtures/layouts.tsrx';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe('@octanejs/visx representative layout families', () => {
	it('renders chord, delaunay, geo, heatmap, hierarchy, legend, network, sankey, stats, threshold, and animated axis output', () => {
		view = mount(LayoutFamiliesFixture);
		expect(Number(view.find('#chord-count').textContent)).toBeGreaterThan(0);
		expect(view.findAll('.visx-legend > div')).toHaveLength(2);
		expect(view.find('path[fill="#ffd43b"]').getAttribute('d')).toBe('M0,0L20,0L10,20Z');
		expect(view.find('.visx-heatmap-rect').getAttribute('width')).toBe('10');
		expect(view.find('#tree-count').textContent).toBe('3');
		expect(view.findAll('.visx-network-link')).toHaveLength(1);
		expect(view.findAll('.visx-network-node')).toHaveLength(2);
		expect(view.findAll('.visx-geo-mercator.geo-fixture')).toHaveLength(1);
		expect(view.findAll('.visx-sankey-links path')).toHaveLength(1);
		expect(view.findAll('.visx-sankey-nodes rect')).toHaveLength(2);
		expect(view.findAll('.visx-boxplot-outlier')).toHaveLength(1);
		expect(view.findAll('.visx-threshold path')).toHaveLength(4);
		expect(view.findAll('.visx-axis-tick').length).toBeGreaterThan(1);
	});
});
