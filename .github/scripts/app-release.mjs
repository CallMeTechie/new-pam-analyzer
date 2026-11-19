// Helpers for .github/workflows/app.yml (Node, no dependencies).
//   node app-release.mjs version <tag>                 -> sets apps/client/package.json, prints the version
//   node app-release.mjs notes <version> <file>        -> writes the changelog section of the version
//   node app-release.mjs channel <version> <url> <sig> <notes> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [cmd, ...args] = process.argv.slice(2);
const pkgPath = 'apps/client/package.json';

if (cmd === 'version') {
  const tag = args[0] ?? '';
  const version = tag.replace(/^app-v/, '');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`Tag ${tag} is not app-v<major>.<minor>.<patch>[-beta.N]`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(version);
} else if (cmd === 'notes') {
  const [version, out] = args;
  const text = readFileSync('apps/client/CHANGELOG.md', 'utf8');
  const sections = text.split(/^## /m).slice(1);
  // Exact version first; a beta without its own section uses the section of its base version.
  const base = version.replace(/-.*$/, '');
  const pick =
    sections.find((s) => s.split('\n')[0].trim().split(/\s/)[0] === version) ??
    sections.find((s) => s.split('\n')[0].trim().split(/\s/)[0] === base);
  writeFileSync(out, pick ? pick.split('\n').slice(1).join('\n').trim() : '');
} else if (cmd === 'channel') {
  const [version, url, sigFile, notesFile, out] = args;
  const signature = readFileSync(sigFile, 'utf8').trim();
  const platform = { signature, url };
  const manifest = {
    version,
    notes: readFileSync(notesFile, 'utf8'),
    pub_date: new Date().toISOString(),
    platforms: { 'windows-x86_64-nsis': platform, 'windows-x86_64': platform },
  };
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
} else {
  console.error('usage: version | notes | channel');
  process.exit(1);
}
