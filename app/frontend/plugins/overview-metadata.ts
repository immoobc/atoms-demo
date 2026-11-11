import type { Plugin } from 'vite';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/%/g, '&#37;');
}

export function overviewHtmlPlaceholders(): Plugin {
  return {
    name: 'overview-html-placeholders',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // Generated/custom index files also support these existing Vite placeholders.
        // Use them in HTML text/attributes only; script/style raw text does not
        // decode entities. JavaScript should read import.meta.env instead.
        // Keep JS env raw and encode % to prevent a second interpolation by Vite.
        return html.replace(/%VITE_APP_(TITLE|DESCRIPTION|LOGO_URL)%/g, (_, key) =>
          escapeHtml(process.env[`VITE_APP_${key}`] ?? ''),
        );
      },
    },
  };
}

const fields = new Set(['title', 'description', 'og:title', 'og:description', 'og:image',
  'twitter:title', 'twitter:description', 'twitter:image', 'og:site_name', 'og:image:alt']);
const repeatable = new Set(['og:image', 'twitter:image']);
const marker = 'data-mgx-overview';

// Match Python str.strip(), including NEL/control separators and excluding BOM.
function hasValue(value: string): boolean {
  return /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u.test(value);
}

export function finalizeHeadMetadata(html: string): string {
  const duplicates: number[] = [];
  const document = parse(html, { sourceCodeLocationInfo: true, onParseError(error) {
    if (error.code === 'duplicate-attribute') duplicates.push(error.startOffset);
  } });
  const isElement = (node: DefaultTreeAdapterMap['node']): node is DefaultTreeAdapterMap['element'] => 'tagName' in node;
  const root = document.childNodes.find((node) => isElement(node) && node.tagName === 'html');
  const head = root && isElement(root) ? root.childNodes.find((node) => isElement(node) && node.tagName === 'head') : undefined;
  if (!head || !isElement(head) || !head.sourceCodeLocation?.endTag) return html;
  const headStart = head.sourceCodeLocation.startOffset;
  const headEnd = head.sourceCodeLocation.endTag.startOffset;
  const groups = new Map<string, { start: number; end: number; managed: boolean;
    value: string; prefix: boolean }[]>();
  let ambiguous = false;
  for (const element of head.childNodes.filter(isElement)) {
    if (!['title', 'meta'].includes(element.tagName)) continue;
    const location = element.sourceCodeLocation;
    if (!location || location.startOffset < headStart || location.endOffset > headEnd) return html;
    const attrs = new Map(element.attrs.map(({ name, value }) => [name, value]));
    const isTitle = element.tagName === 'title';
    const identities = ['name', 'property'].filter((name) => attrs.has(name));
    if ((!isTitle && identities.length > 1) || duplicates.some((offset) =>
      offset >= location.startOffset && offset < (location.startTag?.endOffset ?? location.endOffset))) {
      ambiguous = true;
      continue; // Shared/duplicate attributes must retain all their source data.
    }
    const key = isTitle ? 'title' : (attrs.get(identities[0]) ?? '').toLowerCase();
    // A meta named "title" is independent of the document's title element.
    if (!fields.has(key) || (!isTitle && key === 'title')) continue;
    const nodes = groups.get(key) ?? [];
    nodes.push({ start: location.startOffset, end: location.endOffset,
      managed: (attrs.get(marker) ?? '').toLowerCase() === key,
      value: isTitle ? element.childNodes.map((node) => 'value' in node ? node.value : '').join('')
        : attrs.get('content') ?? '', prefix: attrs.has(marker + '-prefix') });
    groups.set(key, nodes);
  }
  const removals: { start: number; end: number }[] = [];
  for (const [key, nodes] of groups) {
    const page = nodes.filter((node) => !node.managed && hasValue(node.value));
    if (ambiguous) {
      if (page.length) removals.push(...nodes.filter((node) => node.managed));
      continue;
    }
    const managed = nodes.filter((node) => node.managed);
    const defaults = managed.filter((node) => hasValue(node.value));
    // An explicitly formatted default emitted by the renderer supersedes the base.
    // Keep one empty managed node when no value exists, retaining its source marker.
    const fallback = defaults.find((node) => node.prefix) ?? defaults[0]
      ?? managed.find((node) => node.prefix) ?? managed[0];
    const keep = page.length ? (repeatable.has(key) ? page : page.slice(0, 1))
      : fallback ? [fallback] : nodes.filter((node) => !node.managed);
    removals.push(...nodes.filter((node) => !keep.includes(node)));
  }
  // Edit original head spans. HTML5 parsing never serializes or modifies the body.
  for (const { start, end } of removals.sort((a, b) => b.start - a.start)) {
    html = html.slice(0, start) + html.slice(end);
  }
  return html;
}

export function pageMetadata(): Plugin {
  return {
    name: 'page-metadata',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (fileName.endsWith('.html') && asset.type === 'asset' && typeof asset.source === 'string') {
          asset.source = finalizeHeadMetadata(asset.source);
        }
      }
    },
  };
}
