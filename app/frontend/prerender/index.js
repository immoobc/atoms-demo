import { prerender as renderPage } from './blog.js';

export function preserveTitleSource(result) {
  if (!result?.head?.title) return result;
  const { title, overviewTitlePrefix, ...head } = result.head;
  const elements = new Set(head.elements ?? []);
  // Upstream serializes element children verbatim; title text must be escaped.
  elements.add({
    type: 'title',
    props: overviewTitlePrefix === undefined ? {} : {
      'data-mgx-overview': 'title',
      'data-mgx-overview-prefix': overviewTitlePrefix,
    },
    children: title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  });
  return { ...result, head: { ...head, elements } };
}

export async function prerender(args) {
  return preserveTitleSource(await renderPage(args));
}
