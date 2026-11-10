import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../services/api';
import {
    __clearWorkshopPreviewCacheForTests,
    fetchWorkshopPreview,
    getCachedWorkshopPreview,
    normalizeWorkshopId,
} from '../workshopPreviewCache';

vi.mock('../../services/api', () => ({
    getWorkshopPreview: vi.fn(),
}));

describe('workshopPreviewCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        __clearWorkshopPreviewCacheForTests();
    });

    it('normalizes ids', () => {
        expect(normalizeWorkshopId(' 2358556636 ')).toBe('2358556636');
        expect(normalizeWorkshopId(2358556636)).toBe('2358556636');
        expect(normalizeWorkshopId('12ab')).toBeNull();
        expect(normalizeWorkshopId('')).toBeNull();
        expect(normalizeWorkshopId(null)).toBeNull();
    });

    it('maps the API response to a preview and caches it', async () => {
        api.getWorkshopPreview.mockResolvedValueOnce({
            workshop_id: '2358556636',
            found: true,
            preview_url: 'https://images.steamusercontent.com/ugc/x.jpg',
            title: 'Campgrounds Redux',
            description: 'A map',
        });

        const preview = await fetchWorkshopPreview('2358556636');

        expect(preview).toEqual({
            found: true,
            error: false,
            previewUrl: 'https://images.steamusercontent.com/ugc/x.jpg',
            title: 'Campgrounds Redux',
            description: 'A map',
        });
        expect(getCachedWorkshopPreview('2358556636')).toEqual(preview);
        await fetchWorkshopPreview('2358556636');
        expect(api.getWorkshopPreview).toHaveBeenCalledTimes(1);
    });

    it('reports not found items', async () => {
        api.getWorkshopPreview.mockResolvedValueOnce({
            workshop_id: '1', found: false, preview_url: null, title: null, description: null,
        });

        const preview = await fetchWorkshopPreview('1');

        expect(preview.found).toBe(false);
        expect(preview.error).toBe(false);
    });

    it('infers found from preview_url when the response has no found flag', async () => {
        api.getWorkshopPreview.mockResolvedValueOnce({ preview_url: 'https://x/y.jpg' });

        const preview = await fetchWorkshopPreview('5');

        expect(preview.found).toBe(true);
        expect(preview.previewUrl).toBe('https://x/y.jpg');
    });

    it('resolves with error=true instead of rejecting on failure', async () => {
        api.getWorkshopPreview.mockRejectedValueOnce(new Error('network'));

        const preview = await fetchWorkshopPreview('2358556636');

        expect(preview).toEqual({
            found: false, error: true, previewUrl: null, title: null, description: null,
        });
    });

    it('dedupes concurrent requests for the same id', async () => {
        api.getWorkshopPreview.mockResolvedValueOnce({ found: true, title: 'T' });

        const [a, b] = await Promise.all([
            fetchWorkshopPreview('7'),
            fetchWorkshopPreview('7'),
        ]);

        expect(a).toEqual(b);
        expect(api.getWorkshopPreview).toHaveBeenCalledTimes(1);
    });

    it('expires error entries after five minutes', async () => {
        vi.useFakeTimers();
        api.getWorkshopPreview.mockRejectedValueOnce(new Error('network'));
        await fetchWorkshopPreview('8');
        expect(getCachedWorkshopPreview('8')).not.toBeNull();

        vi.advanceTimersByTime(5 * 60 * 1000 + 1);

        expect(getCachedWorkshopPreview('8')).toBeNull();
    });

    it('does not call the API for invalid ids', async () => {
        const preview = await fetchWorkshopPreview('abc');

        expect(preview.found).toBe(false);
        expect(api.getWorkshopPreview).not.toHaveBeenCalled();
    });
});
