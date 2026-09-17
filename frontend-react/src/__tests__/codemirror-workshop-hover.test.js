import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';

import * as cache from '../utils/workshopPreviewCache';
import {
    IMAGE_WAIT_MS,
    findWorkshopIdAt,
    renderWorkshopPreview,
    workshopHoverSource,
} from '../codemirror-workshop-hover';

vi.mock('../utils/workshopPreviewCache', () => ({
    fetchWorkshopPreview: vi.fn(),
    getCachedWorkshopPreview: vi.fn(),
}));

const found = {
    found: true,
    error: false,
    previewUrl: 'https://images.steamusercontent.com/ugc/x.jpg',
    title: 'Campgrounds Redux',
    description: 'A classic map',
};

describe('findWorkshopIdAt', () => {
    it('finds the digit run under the cursor', () => {
        expect(findWorkshopIdAt('2358556636', 0)).toEqual({ id: '2358556636', from: 0, to: 10 });
        expect(findWorkshopIdAt('2358556636', 5)).toEqual({ id: '2358556636', from: 0, to: 10 });
        expect(findWorkshopIdAt('2358556636', 10)).toEqual({ id: '2358556636', from: 0, to: 10 });
    });

    it('handles leading spaces and trailing comments', () => {
        expect(findWorkshopIdAt('  123456789 // cool map', 4)).toEqual({ id: '123456789', from: 2, to: 11 });
    });

    it('ignores digits inside comments', () => {
        expect(findWorkshopIdAt('// 123456789', 5)).toBeNull();
        expect(findWorkshopIdAt('111 // 123456789', 10)).toBeNull();
    });

    it('returns null when not on a number', () => {
        expect(findWorkshopIdAt('abc', 1)).toBeNull();
        expect(findWorkshopIdAt('', 0)).toBeNull();
        expect(findWorkshopIdAt('123 456', 3)).toEqual({ id: '123', from: 0, to: 3 });
    });
});

describe('renderWorkshopPreview', () => {
    const link = (dom) => dom.querySelector('a.cm-workshop-preview-link');

    it('shows loading state with a Steam link', () => {
        const dom = document.createElement('div');
        renderWorkshopPreview(dom, '42', null);
        expect(dom.textContent).toContain('Loading');
        expect(link(dom).href).toBe('https://steamcommunity.com/sharedfiles/filedetails/?id=42');
        expect(link(dom).target).toBe('_blank');
        expect(link(dom).rel).toBe('noopener noreferrer');
    });

    it('shows thumbnail, title and description', () => {
        const dom = document.createElement('div');
        renderWorkshopPreview(dom, '42', found);
        expect(dom.querySelector('img').getAttribute('src')).toBe(found.previewUrl);
        expect(dom.querySelector('.cm-workshop-preview-title').textContent).toBe('Campgrounds Redux');
        expect(dom.querySelector('.cm-workshop-preview-description').textContent).toBe('A classic map');
        expect(dom.textContent).not.toContain('Loading');
    });

    it('renders Steam text as text, never HTML', () => {
        const dom = document.createElement('div');
        renderWorkshopPreview(dom, '42', { ...found, title: '<img src=x onerror=alert(1)>' });
        expect(dom.querySelectorAll('img')).toHaveLength(1);
        expect(dom.querySelector('.cm-workshop-preview-title').textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('shows not found and error states', () => {
        const dom = document.createElement('div');
        renderWorkshopPreview(dom, '42', { ...found, found: false, title: null, previewUrl: null, description: null });
        expect(dom.textContent).toContain('Workshop item not found');
        renderWorkshopPreview(dom, '42', { ...found, found: false, error: true });
        expect(dom.textContent).toContain('Preview unavailable');
        expect(dom.textContent).not.toContain('Workshop item not found');
    });
});

describe('workshopHoverSource', () => {
    let images;
    let urlCounter = 0;
    // Each test gets its own thumbnail URL: loaded URLs are remembered module-wide.
    const withFreshUrl = () => ({ ...found, previewUrl: `https://img.test/${urlCounter++}.jpg` });

    beforeEach(() => {
        vi.clearAllMocks();
        images = [];
        vi.stubGlobal('Image', class {
            constructor() { images.push(this); }
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    const viewFor = (doc) => ({ state: EditorState.create({ doc }) });

    it('returns null away from ids', () => {
        expect(workshopHoverSource(viewFor('// comment\n'), 3)).toBeNull();
    });

    it('covers the id range on the hovered line and fills in after fetch', async () => {
        cache.getCachedWorkshopPreview.mockReturnValue(null);
        cache.fetchWorkshopPreview.mockResolvedValue({ ...found, previewUrl: null });
        const view = viewFor('// maps\n2358556636 // cg\n');

        const tooltip = workshopHoverSource(view, 12);

        expect(tooltip.pos).toBe(8);
        expect(tooltip.end).toBe(18);
        const { dom } = tooltip.create();
        expect(dom.textContent).toContain('Loading');
        expect(cache.fetchWorkshopPreview).toHaveBeenCalledWith('2358556636');
        await vi.waitFor(() => expect(dom.textContent).toContain('Campgrounds Redux'));
    });

    it('keeps showing Loading until the thumbnail has loaded', async () => {
        const preview = withFreshUrl();
        cache.getCachedWorkshopPreview.mockReturnValue(null);
        cache.fetchWorkshopPreview.mockResolvedValue(preview);

        const { dom } = workshopHoverSource(viewFor('2358556636'), 2).create();
        await vi.waitFor(() => expect(images).toHaveLength(1));
        expect(images[0].src).toBe(preview.previewUrl);
        expect(dom.textContent).toContain('Loading');

        images[0].onload();
        await vi.waitFor(() => expect(dom.textContent).toContain('Campgrounds Redux'));
        expect(dom.querySelector('img').getAttribute('src')).toBe(preview.previewUrl);
    });

    it('renders anyway if the thumbnail fails or is slow', async () => {
        cache.getCachedWorkshopPreview.mockReturnValue(null);
        cache.fetchWorkshopPreview.mockResolvedValue(withFreshUrl());
        const failed = workshopHoverSource(viewFor('1'), 0).create();
        await vi.waitFor(() => expect(images).toHaveLength(1));
        images[0].onerror();
        await vi.waitFor(() => expect(failed.dom.textContent).toContain('Campgrounds Redux'));

        vi.useFakeTimers();
        cache.fetchWorkshopPreview.mockResolvedValue(withFreshUrl());
        const slow = workshopHoverSource(viewFor('2'), 0).create();
        await vi.waitFor(() => expect(images).toHaveLength(2));
        expect(slow.dom.textContent).toContain('Loading');
        await vi.advanceTimersByTimeAsync(IMAGE_WAIT_MS);
        expect(slow.dom.textContent).toContain('Campgrounds Redux');
    });

    it('waits for the thumbnail of a cached preview whose image never loaded', async () => {
        const preview = withFreshUrl();
        cache.getCachedWorkshopPreview.mockReturnValue(preview);

        const { dom } = workshopHoverSource(viewFor('2358556636'), 2).create();
        expect(dom.textContent).toContain('Loading');
        expect(cache.fetchWorkshopPreview).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(images).toHaveLength(1));
        images[0].onload();
        await vi.waitFor(() => expect(dom.textContent).toContain('Campgrounds Redux'));

        // Second hover: the image is in the browser cache, so render at once.
        const again = workshopHoverSource(viewFor('2358556636'), 2).create();
        expect(again.dom.textContent).toContain('Campgrounds Redux');
    });

    it('renders cached previews immediately without fetching', () => {
        cache.getCachedWorkshopPreview.mockReturnValue({ ...found, previewUrl: null });

        const { dom } = workshopHoverSource(viewFor('2358556636'), 2).create();

        expect(dom.textContent).toContain('Campgrounds Redux');
        expect(cache.fetchWorkshopPreview).not.toHaveBeenCalled();
    });

    it('does not touch the DOM after the tooltip is destroyed', async () => {
        cache.getCachedWorkshopPreview.mockReturnValue(null);
        let resolve;
        cache.fetchWorkshopPreview.mockReturnValue(new Promise((r) => { resolve = r; }));

        const tooltipView = workshopHoverSource(viewFor('2358556636'), 2).create();
        tooltipView.destroy();
        resolve(found);
        await Promise.resolve();

        expect(tooltipView.dom.textContent).toContain('Loading');
    });
});
