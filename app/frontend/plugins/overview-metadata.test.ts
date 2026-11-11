import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'node-html-parser';
import { finalizeHeadMetadata } from './overview-metadata.ts';

const source = '<html><head><title data-mgx-overview="title">DEFAULT</title><title>Page &amp; title</title>' +
  '<meta data-mgx-overview="og:title" property="og:title" content="OLD">' +
  '<meta data-mgx-overview="og:description" property="og:description" content="OLD">' +
  '<meta data-mgx-overview="og:image" property="og:image" content="/default.png">' +
  '<link data-mgx-overview="icon" rel="icon" href="/icon.png">' +
  '<meta name="prerender-static-page" content="blog">' +
  '<meta property="og:title" content="PAGE">' +
  '<meta property="og:description" content="PAGE DESCRIPTION">' +
  '</head><body><!-- unchanged --><p>A &amp; B</p></body></html>';

test('prerendered page title and OG values have no platform duplicates', () => {
  const result = finalizeHeadMetadata(source);
  const page = parse(result);
  assert.equal(page.querySelector('title')?.getAttribute('data-mgx-overview'), undefined);
  assert.equal(page.querySelector('title')?.text, 'Page & title');
  assert.deepEqual(page.querySelectorAll('meta[property="og:title"]').map(m => m.getAttribute('content')), ['PAGE']);
  assert.deepEqual(page.querySelectorAll('meta[property="og:description"]').map(m => m.getAttribute('content')), ['PAGE DESCRIPTION']);
  assert.ok(result.includes('<meta data-mgx-overview="og:image" property="og:image" content="/default.png">'));
  assert.ok(result.includes('<link data-mgx-overview="icon" rel="icon" href="/icon.png">'));
  assert.ok(result.endsWith('<body><!-- unchanged --><p>A &amp; B</p></body></html>'));
  assert.equal(finalizeHeadMetadata(result), result);
});

test('non-blog page values also finalize without a blog marker', () => {
  const html = source.replace('<meta name="prerender-static-page" content="blog">', '');
  assert.equal(finalizeHeadMetadata(html), finalizeHeadMetadata(source).replace('<meta name="prerender-static-page" content="blog">', ''));
});

test('page image replaces platform image and retains multiple authored values', () => {
  const html = source.replace('</head>', '<meta property="og:image" content="/page-a.png"><meta property="og:image" content="/page-b.png"></head>');
  const result = parse(finalizeHeadMetadata(html));
  assert.deepEqual(result.querySelectorAll('meta[property="og:image"]').map(m => m.getAttribute('content')), ['/page-a.png', '/page-b.png']);
});


test('shared meta identity keeps its unrelated value during finalization', () => {
  const shared = '<meta data-mgx-overview="description" name="description" property="custom:summary" content="SHARED" data-extra="keep">';
  const html = source.replace('</head>', shared + '<meta name="description" content="PAGE"></head>');
  const result = finalizeHeadMetadata(html);
  assert.ok(result.includes(shared));
  assert.equal(parse(result).querySelector('meta[property="custom:summary"]').getAttribute('content'), 'SHARED');
});

for (const empty of ['', ' ', '&nbsp;']) {
  test(`empty description (${JSON.stringify(empty)}) keeps its valid build default`, () => {
    const html = '<html><head><meta data-mgx-overview="description" name="description" content="DEFAULT">'
      + `<meta name="description" content="${empty}"></head><body><p>x<p>y<svg><path d="M0 0" /></svg></body></html>`;
    const result = finalizeHeadMetadata(html);
    assert.ok(result.includes('content="DEFAULT"'));
    assert.deepEqual(parse(result).querySelectorAll('meta[name="description"]').map(m => m.getAttribute('content')), ['DEFAULT']);
    assert.equal(result.slice(result.indexOf('<body>')), html.slice(html.indexOf('<body>')));
  });
}

test('empty managed defaults keep one source marker until an authored value replaces them', () => {
  const empty = '<meta data-mgx-overview="og:image" property="og:image" content="">';
  const html = '<html><head>' + empty + empty + '</head><body>BODY</body></html>';
  const result = finalizeHeadMetadata(html);
  assert.equal(result, '<html><head>' + empty + '</head><body>BODY</body></html>');
  const authored = '<meta property="og:image" content="/page.png">';
  assert.equal(finalizeHeadMetadata(html.replace('</head>', authored + '</head>')),
    '<html><head>' + authored + '</head><body>BODY</body></html>');
});

test('HTML5 raw/inert content and SVG body keep their original source', () => {
  const inert = '<template><noscript></template><title data-mgx-overview="title">INERT</title></noscript></template>';
  const body = '<body><p>x<p>y<input><svg><path d="M0 0" /></svg><!-- keep --></body>';
  const html = '<html><head>' + inert + '<title data-mgx-overview="title">DEFAULT</title><title>PAGE</title></head>' + body + '</html>';
  const result = finalizeHeadMetadata(html);
  assert.ok(result.includes(inert));
  assert.ok(result.endsWith(body + '</html>'));
  assert.ok(result.includes('<title>PAGE</title>'));
  assert.ok(!result.includes('<title data-mgx-overview="title">DEFAULT</title>'));
});

// One contract table exercises the same value/identity policy in Python and TS.
const { readFileSync } = await import('node:fs');
const { parse: parseHtml } = await import('parse5');
const cases = JSON.parse(readFileSync(new URL('../prerender/metadata-cases.json', import.meta.url), 'utf8'));
for (const fixture of cases.cases.filter((item) => !item.runtimeOnly)) {
  test(`build metadata contract: ${fixture.name}`, () => {
    const html = '<!doctype html><html><head>' + fixture.head + '</head>' + cases.body;
    const result = finalizeHeadMetadata(html);
    const document = parseHtml(result);
    const root = document.childNodes.find((node) => node.tagName === 'html');
    const head = root.childNodes.find((node) => node.tagName === 'head');
    const values = {};
    for (const node of head.childNodes.filter((item) => ['title', 'meta'].includes(item.tagName))) {
      const attrs = Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value]));
      const key = node.tagName === 'title' ? 'title' : (attrs.name ?? attrs.property ?? '').toLowerCase();
      if (node.tagName === 'meta' && key === 'title') continue;
      (values[key] ??= []).push(node.tagName === 'title' ? node.childNodes.map((item) => item.value ?? '').join('') : attrs.content ?? '');
    }
    for (const [key, expected] of Object.entries(fixture.expectedBuildFields)) {
      assert.deepEqual(values[key] ?? [], expected, key);
    }
    assert.equal(result.slice(result.indexOf('<body data-probe=')), cases.body);
    if (fixture.buildUnchanged) assert.equal(result, html);
    for (const source of fixture.expectedKeepHtml ?? []) assert.ok(result.includes(source));
    for (const source of fixture.expectedBuildKeepHtml ?? []) assert.ok(result.includes(source));
    assert.equal(finalizeHeadMetadata(result), result);
  });
}
