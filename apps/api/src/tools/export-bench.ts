import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OPTIONS, type ExportOptions } from '../export/export-options.ts';
import { randomFamily, withIndianNames } from '../export/synthetic-tree.ts';
import { ExportLimitError, renderTreePdf } from '../export/tree-render.ts';

// Measures tree export time and peak memory on synthetic families (`npm run bench:export`). Each
// case runs in a fresh Node.js process, so its peak resident memory (maxRSS) is the cost of that
// export alone plus the Node.js baseline, which is measured first. No database or real data is used.
//
//   npm run bench:export                 # default sizes
//   npm run bench:export -- 300 3000     # chosen sizes
//   npm run bench:export -- indic 1000   # Gujarati, Devanagari and Latin names (shaping cost)

const MODES: Array<{ label: string; options: Partial<ExportOptions> }> = [
  { label: 'single A3', options: { mode: 'single', pageSize: 'A3' } },
  { label: 'poster', options: { mode: 'poster' } },
  { label: 'tiled A4 100%', options: { mode: 'tiled', pageSize: 'A4', scalePercent: 100 } },
];

if (process.argv[2] === '--case') {
  const size = Number(process.argv[3]);
  const mode = MODES[Number(process.argv[4])]!;
  const plain = randomFamily(size, 7);
  const tree = process.argv[5] === 'indic' ? withIndianNames(plain, 7) : plain;
  const started = performance.now();
  let out: Record<string, unknown>;
  try {
    const r = renderTreePdf({
      workspaceName: 'Benchmark family',
      members: tree.members,
      relationships: tree.relationships,
      options: { ...DEFAULT_OPTIONS, ...mode.options },
      generatedAt: new Date(),
      maxPages: 100_000,
    });
    out = {
      ms: Math.round(performance.now() - started),
      layoutMs: r.details.layoutMs,
      pages: r.pageCount,
      kb: Math.round(r.pdf.length / 1024),
      labelPt: r.details.effectiveLabelPt,
      pageMm: `${r.details.pageWidthMm}x${r.details.pageHeightMm}`,
      generations: r.details.stats.generations,
      widestRow: r.details.stats.widestRow,
      relationships: tree.relationships.length,
    };
  } catch (err) {
    out = { error: err instanceof ExportLimitError ? err.code : String(err) };
  }
  out.maxRssMb = Math.round(process.resourceUsage().maxRSS / 1024);
  console.log(JSON.stringify(out));
} else if (process.argv[2] === '--baseline') {
  console.log(JSON.stringify({ maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024) }));
} else {
  const indic = process.argv.includes('indic');
  const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
  const self = fileURLToPath(import.meta.url);
  const run = (...args: string[]) => JSON.parse(spawnSync(process.execPath, [self, ...args], { encoding: 'utf8' }).stdout.trim()) as Record<string, unknown>;
  const baseline = run('--baseline').maxRssMb as number;
  console.log(`node ${process.version}, ${process.platform}; baseline process RSS ${baseline} MB; names: ${indic ? 'Gujarati/Devanagari/Latin' : 'Latin (Person N)'}`);
  console.log('members | relationships | mode | time ms (layout) | pages | PDF KB | names pt | page mm | peak RSS MB (above baseline)');
  for (const size of sizes.length ? sizes : [100, 500, 1000, 2000, 5000]) {
    MODES.forEach((mode, i) => {
      const r = run('--case', String(size), String(i), indic ? 'indic' : 'plain');
      const rss = `${r.maxRssMb} (+${(r.maxRssMb as number) - baseline})`;
      console.log(
        r.error
          ? `${size} | - | ${mode.label} | refused: ${r.error} | - | - | - | - | ${rss}`
          : `${size} | ${r.relationships} | ${mode.label} | ${r.ms} (${r.layoutMs}) | ${r.pages} | ${r.kb} | ${r.labelPt} | ${r.pageMm} | ${rss}`,
      );
    });
  }
}
