import { useEffect } from 'react';

// Per-page title and description for search results and link previews. The
// apps are single-page apps sharing one index.html, so without this every
// page shows the homepage's title. The previous values come back on unmount,
// so navigating away leaves the next page's defaults intact.
export interface PageMeta {
  title: string;
  description?: string;
  image?: string;
}

const SITE_NAME = 'ReKindle BC';

const META_TARGETS: Array<[selector: string, attr: string, key: 'title' | 'description' | 'image']> = [
  ['meta[name="description"]', 'content', 'description'],
  ['meta[property="og:title"]', 'content', 'title'],
  ['meta[property="og:description"]', 'content', 'description'],
  ['meta[property="og:image"]', 'content', 'image'],
  ['meta[name="twitter:title"]', 'content', 'title'],
  ['meta[name="twitter:description"]', 'content', 'description'],
  ['meta[name="twitter:image"]', 'content', 'image'],
];

export function usePageMeta(meta: PageMeta | null) {
  const title = meta?.title;
  const description = meta?.description;
  const image = meta?.image;
  useEffect(() => {
    if (!title) return;
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const values = { title: fullTitle, description, image };
    const previousTitle = document.title;
    const previous: Array<[Element, string | null]> = [];
    document.title = fullTitle;
    for (const [selector, attr, key] of META_TARGETS) {
      const value = values[key];
      const el = document.querySelector(selector);
      if (!el || !value) continue;
      previous.push([el, el.getAttribute(attr)]);
      el.setAttribute(attr, value);
    }
    return () => {
      document.title = previousTitle;
      for (const [el, value] of previous) {
        if (value === null) el.removeAttribute('content');
        else el.setAttribute('content', value);
      }
    };
  }, [title, description, image]);
}
