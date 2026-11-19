// Token Radar (radar-2): the entrypoint make.fun runs.
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// rankable pre-token protocol with the model in lib/model.ts, and writes the entry's outputs:
//
//   /output/board.json    the ranked board (rows with implied values and farm plans)
//   /output/data.js       the same board, compact, for the dashboard to read
//   /output/dashboard/    a copy of this repository's dashboard/ (the static page)
//   /output/screenshots/  a copy of this repository's screenshots/ (board, detail, filtered)
//   /output/dossier.json  the judge's dossier, built by vendor/makefun-board.ts
//
// Node 22, standard library only. No network, no wall clock, no randomness: two runs on the same
// snapshot write byte-identical outputs. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands
// in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/**
 * Re-read the board this run just wrote and check it against the gate's own rules:
 * ranks exactly 1..N, implied values non-rising, every watchlist slug present, and every
 * row's farm steps within 3..12 strings of 20..600 characters. The model already ran
 * boardIssue before writing, so this is a second, independent pass over the bytes on
 * disk: it catches a bad write, a truncated file, or a row the in-memory check never saw.
 * Returns a one-line summary; throws on the first failure so the run exits non-zero.
 */
function verifyWrittenBoard(outDir: string, watchlist: string[]): string {
  const raw = readFileSync(join(outDir, 'board.json'), 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('self-check: board.json is not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { rows?: unknown }).rows)) {
    throw new Error('self-check: board.json has no rows array');
  }
  const rows = (parsed as { rows: Array<Record<string, unknown>> }).rows;
  if (rows.length < 100 || rows.length > 4000) {
    throw new Error(`self-check: board holds ${rows.length} rows, the gate wants 100..4000`);
  }
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.rank !== i + 1) throw new Error(`self-check: row ${i + 1} carries rank ${String(row.rank)}`);
    if (typeof row.slug !== 'string' || seen.has(row.slug)) {
      throw new Error(`self-check: row ${i + 1} has a missing or duplicate slug`);
    }
    seen.add(row.slug);
    const value = row.implied_value_usd;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`self-check: row ${row.slug} has implied value ${String(value)}`);
    }
    if (value > previous) throw new Error(`self-check: row ${i + 1} outranks row ${i} on implied value`);
    previous = value;
    const steps = row.farm_steps;
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) {
      throw new Error(`self-check: row ${row.slug} has ${Array.isArray(steps) ? steps.length : 'no'} farm steps`);
    }
    for (const step of steps) {
      if (typeof step !== 'string' || step.length < 20 || step.length > 600) {
        throw new Error(`self-check: row ${row.slug} has a farm step of ${typeof step === 'string' ? step.length : 'unknown'} characters`);
      }
    }
  }
  const missing = watchlist.filter((slug) => !seen.has(slug));
  if (missing.length > 0) {
    throw new Error(`self-check: the written board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`);
  }
  const first = rows[0]!.implied_value_usd as number;
  const last = rows[rows.length - 1]!.implied_value_usd as number;
  return `self-check passed: ${rows.length} rows, ranks 1..${rows.length}, implied $${first.toLocaleString('en-US')}..$${last.toLocaleString('en-US')}, watchlist ${watchlist.length}/${watchlist.length}, farm steps ok`;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// Self-check: re-read the board from disk and verify it against the gate's rules.
// A failure here means the bytes on disk are not what the model scored, so the run
// stops instead of handing in a board the scorer would refuse.
let selfCheck: string;
try {
  selfCheck = verifyWrittenBoard(out, snapshot.watchlist);
} catch (error) {
  process.stderr.write(`token radar: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

// The head of the board, for the run log: the three rows the judge meets first.
const top3 = board
  .slice(0, 3)
  .map((row) => `#${row.rank} ${row.slug} $${row.implied_value_usd.toLocaleString('en-US')}`)
  .join(', ');

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.set_aside_size} products set aside, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n` +
    `token radar: ${selfCheck}\n` +
    `token radar: top 3: ${top3}\n`,
);
