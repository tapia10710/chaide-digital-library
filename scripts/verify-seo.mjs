import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => fs.readFile(new URL(file, root), 'utf8');
const [html, robots, sitemap, configText] = await Promise.all([
  read('dist/index.html'), read('dist/robots.txt'), read('dist/sitemap.xml'), read('firebase.json'),
]);
const config = JSON.parse(configText);
assert.match(html, /<meta name="description" content="[^"]+"/);
assert.match(html, /<script type="application\/ld\+json">/);
assert.match(robots, /^Sitemap: https:\/\/biblioteca-catalogos-chaide\.web\.app\/sitemap\.xml$/m);
assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
assert.match(sitemap, /<loc>https:\/\/biblioteca-catalogos-chaide\.web\.app\/</);
assert.doesNotMatch(sitemap, /\/admin|\/login|\/buscar|\/viewer|\/credito|\/distribuidores/);
for (const source of ['/admin', '/login', '/buscar', '/viewer/**', '/categoria/credito', '/categoria/catalogo-de-distribuidores']) {
  const rule = config.hosting.headers.find(item => item.source === source);
  assert.ok(rule?.headers.some(header => header.key === 'X-Robots-Tag' && header.value.includes('noindex')), `${source} must not be indexed`);
}
console.log('PASS: SEO metadata, public sitemap, crawler discovery and protected-route exclusions.');
