import { useEffect, useState } from 'react';
import {
    fetchWorkshopPreview,
    getCachedWorkshopPreview,
    normalizeWorkshopId,
} from '../utils/workshopPreviewCache';

export { __clearWorkshopPreviewCacheForTests } from '../utils/workshopPreviewCache';

export function useWorkshopPreview(workshopItemId, enabled = true) {
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const normalizedId = normalizeWorkshopId(workshopItemId);
        if (!enabled || !normalizedId) {
            setPreviewUrl(null);
            setLoading(false);
            return;
        }

        const cached = getCachedWorkshopPreview(normalizedId);
        if (cached) {
            setPreviewUrl(cached.previewUrl);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        fetchWorkshopPreview(normalizedId).then((preview) => {
            if (cancelled) return;
            setPreviewUrl(preview.previewUrl);
            setLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [workshopItemId, enabled]);

    return { previewUrl, loading };
}
