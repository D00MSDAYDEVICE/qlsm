import { getWorkshopPreview } from '../services/api';

// Shared Steam Workshop preview cache, used by the useWorkshopPreview hook
// and by the workshop.txt hover tooltip in the config editor.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const ERROR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const previewCache = new Map();
const inflight = new Map();

const EMPTY_PREVIEW = Object.freeze({
    found: false,
    error: false,
    previewUrl: null,
    title: null,
    description: null,
});

const cleanString = (value) => (
    typeof value === 'string' && value.trim() ? value.trim() : null
);

export const normalizeWorkshopId = (workshopItemId) => {
    if (workshopItemId === null || workshopItemId === undefined) return null;
    const value = String(workshopItemId).trim();
    return /^\d+$/.test(value) ? value : null;
};

export const __clearWorkshopPreviewCacheForTests = () => {
    previewCache.clear();
    inflight.clear();
};

export const getCachedWorkshopPreview = (workshopItemId) => {
    const id = normalizeWorkshopId(workshopItemId);
    if (!id) return null;
    const cached = previewCache.get(id);
    if (!cached || cached.expiresAt <= Date.now()) return null;
    return cached.preview;
};

const toPreview = (result) => {
    const previewUrl = cleanString(result?.preview_url);
    const title = cleanString(result?.title);
    return {
        found: typeof result?.found === 'boolean' ? result.found : Boolean(previewUrl || title),
        error: false,
        previewUrl,
        title,
        description: cleanString(result?.description),
    };
};

const remember = (id, preview, ttlMs) => {
    previewCache.set(id, { preview, expiresAt: Date.now() + ttlMs });
    return preview;
};

export const fetchWorkshopPreview = (workshopItemId) => {
    const id = normalizeWorkshopId(workshopItemId);
    if (!id) return Promise.resolve({ ...EMPTY_PREVIEW });

    const cached = getCachedWorkshopPreview(id);
    if (cached) return Promise.resolve(cached);
    if (inflight.has(id)) return inflight.get(id);

    const request = getWorkshopPreview(id)
        .then((result) => remember(id, toPreview(result), CACHE_TTL_MS))
        .catch(() => remember(id, { ...EMPTY_PREVIEW, error: true }, ERROR_CACHE_TTL_MS))
        .finally(() => inflight.delete(id));
    inflight.set(id, request);
    return request;
};
