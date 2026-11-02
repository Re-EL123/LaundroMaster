// SEO helpers for dynamically rendered pages.
//
// Static pages declare their metadata in HTML. Pages whose content is fetched
// at runtime (e.g. a laundromat detail page) use these helpers to keep the
// document title, description, canonical link and structured data in sync with
// what is actually rendered, so crawlers see meaningful metadata.

export const SITE_URL = 'https://laundromaster.re-el.co.za';

export function absoluteUrl(pathOrUrl = '') {
  try {
    return new URL(pathOrUrl, SITE_URL).href;
  } catch {
    return pathOrUrl;
  }
}

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

export function setMeta({ title, description, canonical, image, type, robots } = {}) {
  if (title) {
    document.title = title;
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
  }
  if (description) {
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
  }
  if (canonical) {
    const href = absoluteUrl(canonical);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: href });
  }
  if (image) {
    const url = absoluteUrl(image);
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: url });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: url });
  }
  if (type) upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
  if (robots) upsertMeta('meta[name="robots"]', { name: 'robots', content: robots });
}

// Replace (or create) a JSON-LD block so the page never emits duplicates.
export function setJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function breadcrumb(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

// Strip undefined keys so optional business fields never emit empty nodes.
export function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value != null && value !== ''));
}
