// Run from frontend: node --test prerender/blog.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import { parse } from 'node-html-parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const siteTitle = 'A & <site> "quoted" \'apostrophe\' literal &amp; </title><script id="site-probe">throw 1</script>';
const expectedIndexTitle = 'Blog | A & <site> "quoted" \'apostrophe\' literal &amp; </title><script id="site-probe">throw 1</script>';
const expectedIndexDescription =
  'This is a flexible blog starter that can be filled with Markdown content and prerendered into indexable pages.';
const escapedSiteTitle = 'A &amp; &lt;site&gt; &quot;quoted&quot; &#39;apostrophe&#39; literal &amp;amp; &lt;/title&gt;&lt;script id=&quot;site-probe&quot;&gt;throw 1&lt;/script&gt;';

function assertOpenGraph(head, title, description) {
  for (const [property, content] of [
    ['og:title', title],
    ['og:description', description],
  ]) {
    const tags = [...head.elements].filter(
      (element) => element.type === 'meta' && element.props.property === property,
    );
    assert.equal(tags.length, 1, `Expected one ${property} tag`);
    assert.equal(tags[0].props.content, content);
  }
}

test('real app entry leaves static blog metadata untouched and mounts ordinary SPA pages', async () => {
  const previousDocument = globalThis.document;
  const previousProbe = globalThis.__mgxBlogEntryProbe;
  const probe = { configLoads: 0, roots: 0, renders: 0 };
  let staticBlog = true;
  let server;
  const modules = {
    'react-dom/client': `export function createRoot() {
      globalThis.__mgxBlogEntryProbe.roots++;
      return { render() { globalThis.__mgxBlogEntryProbe.renders++; } };
    }`,
    './App.tsx': 'export default function App() { return null; }',
    './index.css': '',
    './lib/config.ts': `export async function loadRuntimeConfig() {
      globalThis.__mgxBlogEntryProbe.configLoads++;
    }`,
  };
  try {
    globalThis.__mgxBlogEntryProbe = probe;
    globalThis.document = {
      title: 'Current runtime site',
      querySelector: () => staticBlog ? { getAttribute: () => 'blog' } : null,
      getElementById: () => ({}),
    };
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'error',
      appType: 'custom',
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      esbuild: { jsx: 'automatic' },
      ssr: { noExternal: ['react-dom'] },
      plugins: [{
        name: 'blog-entry-boundary-test',
        enforce: 'pre',
        resolveId(id, importer) {
          if (importer?.split('?')[0].endsWith('/src/main.tsx') && id in modules) {
            return '\0blog-entry-test:' + id;
          }
        },
        load(id) {
          if (id.startsWith('\0blog-entry-test:')) {
            return modules[id.slice('\0blog-entry-test:'.length)];
          }
        },
      }],
    });
    // Execute the real entry with only framework/config boundaries replaced.
    await server.ssrLoadModule('/src/main.tsx?static-blog');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(probe, { configLoads: 0, roots: 0, renders: 0 });
    assert.equal(document.title, 'Current runtime site');

    // Positive control: absence of the static marker reaches the actual mount.
    staticBlog = false;
    await server.ssrLoadModule('/src/main.tsx?ordinary-spa');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(probe, { configLoads: 1, roots: 1, renders: 1 });
  } finally {
    try {
      await server?.close();
    } finally {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      if (previousProbe === undefined) delete globalThis.__mgxBlogEntryProbe;
      else globalThis.__mgxBlogEntryProbe = previousProbe;
    }
  }
});

test('real blog prerender emits page Open Graph text', async (t) => {
  const originalEnv = Object.fromEntries(
    ['VITE_APP_TITLE', 'VITE_APP_DESCRIPTION', 'VITE_APP_LOGO_URL', 'NODE_ENV'].map(
      (key) => [key, process.env[key]],
    ),
  );
  let server;
  let blogPosts;
  let originalPosts;
  try {
    process.env.VITE_APP_TITLE = siteTitle;
    process.env.VITE_APP_DESCRIPTION = siteTitle;
    process.env.VITE_APP_LOGO_URL = '/logo.svg?x="<probe>&y=%VITE_APP_TITLE%';
    server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      logLevel: 'error',
      appType: 'custom',
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
    });
    assert.equal(process.env.VITE_APP_TITLE, siteTitle);
    assert.equal(process.env.VITE_APP_DESCRIPTION, siteTitle);
    const blog = await server.ssrLoadModule('/src/lib/blog.ts');
    const { prerender } = await server.ssrLoadModule('/prerender/blog.js');
    blogPosts = blog.blogPosts;
    originalPosts = [...blogPosts];
    const cases = [
      {
        post: {
          slug: 'og-default',
          title: 'Article title',
          description: 'Article description',
          frontmatter: {},
        },
        expectedTitle: 'Article title | Blog',
        expectedDescription: 'Article description',
      },
      {
        post: {
          slug: 'og-custom',
          title: 'Article title',
          description: 'Article description',
          frontmatter: {
            og_title: 'Custom title',
            og_description: 'Custom description',
          },
        },
        expectedTitle: 'Custom title',
        expectedDescription: 'Custom description',
      },
      {
        post: {
          slug: 'og-special',
          title: 'Special article',
          description: 'Article description',
          frontmatter: {
            og_title: '中文 & <title> "quoted"',
            og_description: 'Details & <text> with "quotes" and apostrophe\'s',
          },
        },
        expectedTitle: '中文 & <title> "quoted"',
        expectedDescription: 'Details & <text> with "quotes" and apostrophe\'s',
      },
      // Frontmatter strings are normalized before becoming BlogPost values.
      {
        post: {
          slug: 'og-empty',
          title: 'Fallback article',
          description: 'Fallback description',
          frontmatter: { og_title: '', og_description: '' },
        },
        expectedTitle: 'Fallback article | Blog',
        expectedDescription: 'Fallback description',
      },
      {
        post: {
          slug: 'og-empty-description',
          title: 'Empty article',
          description: '',
          frontmatter: { og_title: '', og_description: '' },
        },
        expectedTitle: 'Empty article | Blog',
        expectedDescription: 'Empty article | Blog',
      },
    ];
    blogPosts.splice(
      0,
      blogPosts.length,
      ...cases.map(({ post }) => ({ markdown: '', ...post })),
    );

    await t.test('index uses its own title and description', async () => {
      const { head } = await prerender({ url: '/blog/' });
      assert.equal(head.title, expectedIndexTitle);
      assertOpenGraph(head, expectedIndexTitle, expectedIndexDescription);
      const html = await server.transformIndexHtml(
        '/',
        '<!doctype html><html><head><title>%VITE_APP_TITLE%</title>' +
          '<meta name="title-probe" content="%VITE_APP_TITLE%">' +
          '<meta name="description-probe" content="%VITE_APP_DESCRIPTION%"></head><body></body></html>',
      );
      assert.ok(html.includes(`<title>${escapedSiteTitle}</title>`));
      assert.ok(html.includes(`content="${escapedSiteTitle}"`));
      assert.ok(!html.includes('<script id="site-probe">'));
    });

    await t.test('nested env placeholders remain literal HTML text', async () => {
      const previousTitle = process.env.VITE_APP_TITLE;
      const previousDescription = process.env.VITE_APP_DESCRIPTION;
      try {
        process.env.VITE_APP_TITLE = '%VITE_APP_DESCRIPTION%';
        process.env.VITE_APP_DESCRIPTION = '</title><script id="nested-env-probe">throw 1</script><title>';
        const html = await server.transformIndexHtml('/', '<html><head><title>%VITE_APP_TITLE%</title></head><body></body></html>');
        const document = parse(html);
        assert.equal(document.querySelector('title').text, '%VITE_APP_DESCRIPTION%');
        assert.equal(document.querySelector('#nested-env-probe'), null);
      } finally {
        process.env.VITE_APP_TITLE = previousTitle;
        process.env.VITE_APP_DESCRIPTION = previousDescription;
      }
    });

    await t.test('logo HTML placeholders escape the URL without polluting JS env', async () => {
      const html = await server.transformIndexHtml('/', '<html><head><link rel="icon" href="%VITE_APP_LOGO_URL%"></head><body></body></html>');
      assert.equal(parse(html).querySelector('link').getAttribute('href'), process.env.VITE_APP_LOGO_URL);
      assert.equal(parse(html).querySelector('probe'), null);
    });

    await t.test('prerender adapter preserves page title ownership and escapes title children', async () => {
      const { preserveTitleSource } = await server.ssrLoadModule('/prerender/index.js');
      const original = { html: 'BODY', statusCode: 404, links: new Set(['/docs/']),
        head: { title: 'DOC & <title>', lang: 'en', elements: new Set() } };
      const result = preserveTitleSource(original);
      assert.equal(result.statusCode, 404);
      assert.equal(result.head.title, undefined);
      const title = [...result.head.elements].find((node) => node.type === 'title');
      assert.deepEqual(title.props, {});
      assert.equal(title.children, 'DOC &amp; &lt;title&gt;');
      assert.equal(original.head.title, 'DOC & <title>');
    });

    for (const { post, expectedTitle, expectedDescription } of cases) {
      await t.test(post.slug, async () => {
        const result = await prerender({ url: `/blog/${post.slug}/` });
        assert.equal(result.statusCode, undefined);
        assertOpenGraph(result.head, expectedTitle, expectedDescription);
      });
    }

    await t.test('unknown article keeps its 404 and fallback metadata', async () => {
      const result = await prerender({ url: '/blog/og-not-found/' });
      assert.equal(result.statusCode, 404);
      assert.equal(result.head.title, expectedIndexTitle);
      assertOpenGraph(result.head, expectedIndexTitle, expectedIndexDescription);
    });
  } finally {
    if (originalPosts) {
      blogPosts.splice(0, blogPosts.length, ...originalPosts);
    }
    try {
      await server?.close();
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }
});


test('real Markdown blank Twitter text falls back without changing other SEO overrides', async (t) => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-markdown-seo-'));
  const frontend = path.join(workDir, 'frontend');
  const originalTitle = process.env.VITE_APP_TITLE;
  let server;
  const fallback = {
    title: 'Article Title | Blog', description: 'Article Description',
    ogTitle: 'Article Title | Blog', ogDescription: 'Article Description',
    ogImage: '/hero.png', twitterTitle: 'Article Title | Blog',
    twitterDescription: 'Article Description', twitterImage: '/hero.png',
  };
  const cases = [
    { name: 'omitted', metadata: '', normalizedTitle: undefined },
    { name: 'null', metadata: 'twitter_title:\ntwitter_description:\nog_title:\nog_description:\nog_image:\ntwitter_image:', normalizedTitle: undefined },
    { name: 'empty', metadata: "twitter_title: ''\ntwitter_description: ''\nog_title: ''\nog_description: ''\nog_image: ''\ntwitter_image: ''", normalizedTitle: '',
      expected: { ogTitle: '', ogDescription: '', ogImage: '', twitterImage: '' } },
    { name: 'whitespace', metadata: 'twitter_title: "   "\ntwitter_description: "   "\nog_title: "   "\nog_description: "   "\nog_image: "   "\ntwitter_image: "   "', normalizedTitle: '',
      expected: { ogTitle: '', ogDescription: '', ogImage: '', twitterImage: '' } },
    {
      name: 'custom',
      metadata: 'twitter_title: "  Custom Twitter Title  "\ntwitter_description: Custom Twitter Description\nog_title: Custom OG Title\nog_description: Custom OG Description\nog_image: /custom-og.png\ntwitter_image: /custom-twitter.png',
      normalizedTitle: 'Custom Twitter Title',
      expected: { ogTitle: 'Custom OG Title', ogDescription: 'Custom OG Description',
        ogImage: '/custom-og.png', twitterTitle: 'Custom Twitter Title',
        twitterDescription: 'Custom Twitter Description', twitterImage: '/custom-twitter.png' },
    },
    {
      name: 'body-summary', description: '',
      metadata: "twitter_title: ''\ntwitter_description: ''",
      normalizedTitle: '', expected: {
        description: 'Body Generated body summary.',
        ogDescription: 'Body Generated body summary.',
        twitterDescription: 'Body Generated body summary.',
      },
    },
    {
      name: 'empty-twitter-image-stays-suppressed',
      metadata: "og_image: /article-og.png\ntwitter_image: ''", normalizedTitle: undefined,
      expected: { ogImage: '/article-og.png', twitterImage: '' },
    },
    {
      name: 'no-image', hero: '', metadata: "og_image: ''\ntwitter_image: ''",
      normalizedTitle: undefined, expected: { ogImage: '', twitterImage: '' },
    },
    {
      name: 'other-empty-overrides-stay-empty', normalizedTitle: undefined,
      metadata: "twitter_site: ''\ntwitter_creator: ''\nog_url: ''\nog_type: ''\nlang: ''",
      expected: { twitterSite: '', twitterCreator: '', url: '', ogType: '', lang: '' },
    },
  ];
  try {
    process.env.VITE_APP_TITLE = 'Platform Site for Markdown regression';
    await fs.mkdir(frontend, { recursive: true });
    await fs.cp(path.join(root, 'src'), path.join(frontend, 'src'), { recursive: true });
    await fs.mkdir(path.join(frontend, 'prerender'), { recursive: true });
    for (const name of ['blog.js', 'index.js']) {
      await fs.copyFile(path.join(root, 'prerender', name), path.join(frontend, 'prerender', name));
    }
    await fs.writeFile(path.join(frontend, 'package.json'), '{"type":"module"}');
    await fs.symlink(path.join(root, 'node_modules'), path.join(frontend, 'node_modules'), 'dir');
    const contentDir = path.join(frontend, 'seo/content');
    await fs.mkdir(contentDir, { recursive: true });
    for (const fixture of cases) {
      const description = fixture.description ?? 'description: Article Description\n';
      const hero = fixture.hero ?? 'hero_image: /hero.png\n';
      await fs.writeFile(path.join(contentDir, `${fixture.name}.md`),
        `---\ntitle: Article Title\n${description}${hero}${fixture.metadata}\n---\n\n# Body\n\nGenerated body summary.\n`);
    }
    server = await createServer({
      root: frontend, configFile: false, logLevel: 'error', appType: 'custom',
      server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true },
      resolve: { alias: { '@': path.join(frontend, 'src') } },
      esbuild: { jsx: 'automatic' },
    });
    const { getBlogPost, getPostSeoMeta } = await server.ssrLoadModule('/src/lib/blog.ts');
    const { prerender } = await server.ssrLoadModule('/prerender/index.js');
    for (const fixture of cases) {
      await t.test(fixture.name, async () => {
        // These posts come from the real Markdown glob, YAML parser and normalizer.
        const post = getBlogPost(fixture.name);
        assert.ok(post);
        assert.equal(post.frontmatter.twitter_title, fixture.normalizedTitle);
        const expected = { ...fallback, ...fixture.expected };
        const seo = getPostSeoMeta(post);
        for (const [key, value] of Object.entries(expected)) assert.equal(seo[key], value, key);
        assert.equal(post.description, expected.description);
        const result = await prerender({ url: `/blog/${fixture.name}/` });
        assert.equal(result.statusCode, undefined);
        const elements = [...result.head.elements];
        for (const [identity, field] of [
          ['og:title', 'ogTitle'], ['og:description', 'ogDescription'], ['og:image', 'ogImage'],
          ['twitter:title', 'twitterTitle'], ['twitter:description', 'twitterDescription'],
          ['twitter:image', 'twitterImage'],
        ]) {
          const meta = elements.find((element) => element.type === 'meta'
            && (element.props.name ?? element.props.property) === identity);
          const expectedContent = identity === 'og:title' ? (expected.ogTitle || expected.title)
            : identity === 'og:description' ? (expected.ogDescription || expected.description || expected.title)
            : identity.endsWith(':image') ? (expected[field] || undefined) : expected[field];
          assert.equal(meta?.props.content, expectedContent, identity);
        }
        if (fixture.name === 'other-empty-overrides-stay-empty') {
          for (const identity of ['twitter:site', 'twitter:creator', 'og:url']) {
            assert.ok(!elements.some((element) => (element.props.name ?? element.props.property) === identity));
          }
        }
      });
    }
  } finally {
    try {
      await server?.close();
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
      if (originalTitle === undefined) delete process.env.VITE_APP_TITLE;
      else process.env.VITE_APP_TITLE = originalTitle;
    }
  }
});


test('production build finalizes metadata before static hosting', async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-metadata-build-'));
  const frontend = path.join(workDir, 'frontend');
  const outDir = path.join(frontend, 'dist');
  const originalEnv = { ...process.env };
  try {
    process.env.VITE_APP_TITLE = '%VITE_APP_DESCRIPTION%';
    process.env.VITE_APP_DESCRIPTION = '</title><script id="nested-env-probe">throw 1</script><title>';
    const expectedDescription = process.env.VITE_APP_DESCRIPTION;
    await fs.cp(root, frontend, { recursive: true,
      filter: (source) => !['node_modules', 'dist'].includes(path.basename(source)) });
    await fs.symlink(path.join(root, 'node_modules'), path.join(frontend, 'node_modules'), 'dir');
    const indexPath = path.join(frontend, 'index.html');
    const indexSource = await fs.readFile(indexPath, 'utf8');
    await fs.writeFile(indexPath, indexSource.replace('Atoms Generated Project', '%VITE_APP_TITLE%'));
    await fs.mkdir(path.join(frontend, 'seo/content'), { recursive: true });
    await fs.writeFile(path.join(frontend, 'seo/content/no-description.md'), '---\ntitle: No Description\n---\n');
    const routesPath = path.join(frontend, 'prerender/blog-routes.js');
    await fs.writeFile(routesPath, (await fs.readFile(routesPath, 'utf8'))
      .replace("new Set(['/blog/'])", "new Set(['/blog/', '/docs/x/', '/docs/same/'])"));
    const rendererPath = path.join(frontend, 'prerender/blog.js');
    await fs.writeFile(rendererPath, (await fs.readFile(rendererPath, 'utf8'))
      .replace('export async function prerender({ url }) {', `export async function prerender({ url }) {
        if (url.startsWith('/docs/')) return { html: '<main>DOCS BODY</main>', head: {
          title: url.includes('/same/') ? import.meta.env.VITE_APP_TITLE : 'Docs & <Reference>',
          elements: new Set([{ type: 'meta', props: { name: 'description', content: 'Docs description' } }]),
        } };
      `));
    await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'],
      { cwd: frontend, env: process.env, maxBuffer: 10 * 1024 * 1024 });
    const files = await fs.readdir(path.join(outDir, 'blog'), { recursive: true });
    const pages = files.filter((name) => name.endsWith('index.html'));
    assert.ok(pages.length > 0);
    for (const name of pages) {
      const document = parse(await fs.readFile(path.join(outDir, 'blog', name), 'utf8'));
      const head = document.querySelector('head');
      assert.equal(head.querySelectorAll('title').length, 1);
      assert.equal(head.querySelector('title').getAttribute('data-mgx-overview'), name === 'index.html' ? 'title' : undefined);
      for (const selector of ['[property="og:title"]', '[property="og:description"]',
        '[name="description"]', '[name="twitter:title"]', '[name="twitter:description"]']) {
        const metas = head.querySelectorAll(`meta${selector}`);
        assert.equal(metas.length, 1, `${name}: ${selector}`);
        const derivedTitle = name === 'index.html' && ['[property="og:title"]', '[name="twitter:title"]'].includes(selector);
        const emptyArticle = name === 'no-description/index.html'
          && ['[name="description"]', '[name="twitter:description"]'].includes(selector);
        const key = selector.includes('twitter:description') ? 'twitter:description' : 'description';
        assert.equal(metas[0].getAttribute('data-mgx-overview'), emptyArticle ? key
          : derivedTitle ? (selector.includes('og:title') ? 'og:title' : 'twitter:title') : undefined);
        if (emptyArticle) assert.equal(metas[0].getAttribute('content'), 'Atoms Generated Project');
      }
      assert.equal(document.querySelector('#site-probe'), null);
      assert.equal(document.querySelector('#nested-env-probe'), null);
    }
    for (const [name, expected] of [['x', 'Docs & <Reference>'], ['same', '%VITE_APP_DESCRIPTION%']]) {
      const page = parse(await fs.readFile(path.join(outDir, 'docs', name, 'index.html'), 'utf8'));
      assert.equal(page.querySelector('title').text, expected);
      assert.equal(page.querySelector('title').getAttribute('data-mgx-overview'), undefined);
      assert.equal(page.querySelectorAll('title').length, 1);
      assert.equal(page.querySelector('meta[name="description"]').getAttribute('content'), 'Docs description');
      assert.equal(page.querySelector('#nested-env-probe'), null);
    }
    const home = parse(await fs.readFile(path.join(outDir, 'index.html'), 'utf8'));
    assert.equal(home.querySelector('title[data-mgx-overview="title"]').text, '%VITE_APP_DESCRIPTION%');
    assert.equal(home.querySelector('#nested-env-probe'), null);
    assert.equal(process.env.VITE_APP_TITLE, '%VITE_APP_DESCRIPTION%');
    assert.equal(process.env.VITE_APP_DESCRIPTION, expectedDescription);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});
