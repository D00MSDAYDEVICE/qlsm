import { EditorView, hoverTooltip } from '@codemirror/view';
import { fetchWorkshopPreview, getCachedWorkshopPreview } from './utils/workshopPreviewCache';

// Hover tooltip for workshop.txt: shows the Steam Workshop item's thumbnail,
// title and description for the ID under the mouse.

export const STEAM_WORKSHOP_ITEM_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=';

const isDigit = (ch) => ch >= '0' && ch <= '9';

export function findWorkshopIdAt(lineText, offset) {
    const commentStart = lineText.indexOf('//');
    const limit = commentStart === -1 ? lineText.length : commentStart;
    if (offset < 0 || offset > limit) return null;

    let from = offset;
    let to = offset;
    while (from > 0 && isDigit(lineText[from - 1])) from -= 1;
    while (to < limit && isDigit(lineText[to])) to += 1;
    if (from === to) return null;
    return { id: lineText.slice(from, to), from, to };
}

const textElement = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
};

export function renderWorkshopPreview(dom, id, preview) {
    dom.replaceChildren();

    if (!preview) {
        dom.append(textElement('div', 'cm-workshop-preview-status', 'Loading…'));
    } else if (preview.error) {
        dom.append(textElement('div', 'cm-workshop-preview-status', 'Preview unavailable'));
    } else if (!preview.found) {
        dom.append(textElement('div', 'cm-workshop-preview-status', 'Workshop item not found'));
    } else {
        if (preview.previewUrl) {
            const img = document.createElement('img');
            img.className = 'cm-workshop-preview-image';
            img.src = preview.previewUrl;
            img.alt = '';
            dom.append(img);
        }
        if (preview.title) {
            dom.append(textElement('div', 'cm-workshop-preview-title', preview.title));
        }
        if (preview.description) {
            dom.append(textElement('div', 'cm-workshop-preview-description', preview.description));
        }
    }

    const link = textElement('a', 'cm-workshop-preview-link', 'Open in Steam ↗');
    link.href = `${STEAM_WORKSHOP_ITEM_URL}${id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    dom.append(link);
}

export function workshopHoverSource(view, pos) {
    const line = view.state.doc.lineAt(pos);
    const match = findWorkshopIdAt(line.text, pos - line.from);
    if (!match) return null;

    return {
        pos: line.from + match.from,
        end: line.from + match.to,
        above: true,
        create() {
            const dom = document.createElement('div');
            dom.className = 'cm-workshop-preview';
            let active = true;

            const cached = getCachedWorkshopPreview(match.id);
            renderWorkshopPreview(dom, match.id, cached);
            if (!cached) {
                fetchWorkshopPreview(match.id).then((preview) => {
                    if (active) renderWorkshopPreview(dom, match.id, preview);
                });
            }

            return {
                dom,
                destroy() {
                    active = false;
                },
            };
        },
    };
}

const workshopPreviewTheme = EditorView.baseTheme({
    '.cm-workshop-preview': {
        width: '280px',
        padding: '8px',
        fontSize: '12px',
        lineHeight: '1.4',
    },
    '.cm-workshop-preview-image': {
        display: 'block',
        width: '100%',
        maxHeight: '158px',
        objectFit: 'cover',
        borderRadius: '4px',
        marginBottom: '6px',
    },
    '.cm-workshop-preview-title': {
        fontWeight: '600',
        fontSize: '13px',
        marginBottom: '4px',
    },
    '.cm-workshop-preview-description': {
        opacity: '0.8',
        marginBottom: '6px',
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
    },
    '.cm-workshop-preview-status': {
        opacity: '0.8',
        marginBottom: '6px',
    },
    '.cm-workshop-preview-link': {
        textDecoration: 'none',
        fontWeight: '500',
    },
    '.cm-workshop-preview-link:hover': {
        textDecoration: 'underline',
    },
    '&light .cm-workshop-preview-link': { color: '#0550ae' },
    '&dark .cm-workshop-preview-link': { color: '#61afef' },
});

export const workshopHoverTooltip = [
    hoverTooltip(workshopHoverSource, { hoverTime: 300 }),
    workshopPreviewTheme,
];
