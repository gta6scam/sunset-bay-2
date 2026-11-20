// Sunset Bay's hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/ — plain files a desktop browser
// opens offline. This program's one job is to hand it in the way the bounty
// asks: copy game/ and screenshots/ into the output directory (MAKEFUN_OUTPUT_DIR
// locally, /output in the grader) and write dossier.json there with the vendored
// buildDossier, byte for byte the summary the judge reads.
//
// The caps passed to buildDossier are the scorer's own: they shape nothing but
// the text limit, and refuse exactly what the scorer would refuse — an entry
// with too many or too-large screenshots, or a game/ past its file, byte or
// path budgets — so a bad hand-in fails here first, not at the gate.
//
// Run it:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
