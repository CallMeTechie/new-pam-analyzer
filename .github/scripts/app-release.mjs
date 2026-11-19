// Helpers for .github/workflows/app.yml (Node, no dependencies).
//   node app-release.mjs version <tag>        -> sets apps/client/package.json, prints the version
//   node app-release.mjs version-code <ver>   -> Android versionCode (stable above its betas)
//   node app-release.mjs notes <version> <file>
//   node app-release.mjs channel <version> <notes-file> <out.json> <platform>=<url>|<sig-file> ...
import { readFileSync, writeFileSync } from 'node:fs';

const [cmd, ...args] = process.argv.slice(2);
const pkgPath = 'apps/client/package.json';
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[A-Za-z]+\.?(\d+))?$/;

if (cmd === 'version') {
  const tag = args[0] ?? '';
  const version = tag.replace(/^app-v/, '');
  if (!VERSION.test(version)) {
    console.error(`Tag ${tag} is not app-v<major>.<minor>.<patch>[-beta.N]`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(version);
} else if (cmd === 'version-code') {
  // 0.3.0-beta.2 -> 30002, 0.3.0 -> 30099: every beta and the final version get rising codes.
  const m = VERSION.exec(args[0] ?? '');
  if (!m) process.exit(1);
  const [, major, minor, patch, pre] = m.map((x) => Number(x ?? 0));
  const build = m[4] === undefined ? 99 : Math.min(pre, 98);
  console.log(major * 10_000_000 + minor * 100_000 + patch * 1_000 + build);
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
  const [version, notesFile, out, ...entries] = args;
  const platforms = {};
  for (const entry of entries) {
    const [names, rest] = entry.split('=');
    const [url, sigFile] = rest.split('|');
    const asset = { signature: readFileSync(sigFile, 'utf8').trim(), url };
    for (const name of names.split(',')) platforms[name] = asset;
  }
  const manifest = {
    version,
    notes: readFileSync(notesFile, 'utf8'),
    pub_date: new Date().toISOString(),
    platforms,
  };
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
} else {
  console.error('usage: version | version-code | notes | channel');
  process.exit(1);
}
