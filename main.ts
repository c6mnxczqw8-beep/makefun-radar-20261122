// Token launch radar: reads the sealed DefiLlama snapshot, ranks every
// protocol that records no token by an implied launch value derived from the
// snapshot's own launched protocols, and writes the board, the dashboard and
// its data, the screenshots and the dossier into the output directory.
//
//   node main.ts [--input <snapshot.json>]
//   MAKEFUN_OUTPUT_DIR=<dir>   where to write (default /output)
//   RADAR_SKIP_DOSSIER=1       local test seam: skip the dossier step
//
// Node 22 standard library only. Deterministic: the same snapshot always
// writes the same bytes.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard, type Snapshot } from "./lib/model.ts";

const here = dirname(fileURLToPath(import.meta.url));

function inputPath(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--input");
  if (i >= 0 && args[i + 1]) return args[i + 1]!;
  return "/input/snapshot.json";
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const snap = JSON.parse(readFileSync(inputPath(), "utf8")) as Snapshot;
const { rows, launched, peers } = buildBoard(snap);

mkdirSync(outDir, { recursive: true });

// The ranked board.
writeFileSync(
  join(outDir, "board.json"),
  JSON.stringify({ as_of: snap.as_of, source: snap.source, floor_usd: snap.floor_usd, rows }, null, 2) + "\n",
);

// The dashboard and the screenshots, copied from the repository.
for (const dir of ["dashboard", "screenshots"]) {
  rmSync(join(outDir, dir), { recursive: true, force: true });
  cpSync(join(here, dir), join(outDir, dir), { recursive: true });
}

// The dashboard's data, written beside the page: the board with the model's
// workings for the detail view, and the launched set kept separate.
const data = {
  as_of: snap.as_of,
  floor_usd: snap.floor_usd,
  watchlist_count: snap.watchlist.length,
  protocol_count: snap.protocols.length,
  global_median_ratio: Math.round(peers.globalMedian * 10000) / 10000,
  launched_peer_count: peers.launchedCount,
  rows,
  launched,
};
writeFileSync(join(outDir, "dashboard", "rows.js"), `window.RADAR_DATA = ${JSON.stringify(data)};\n`);

// The dossier, built by the kit's library exactly as the bounty prescribes.
if (process.env.RADAR_SKIP_DOSSIER !== "1") {
  const { buildDossier } = await import("./vendor/makefun-board.ts");
  writeFileSync(join(outDir, "dossier.json"), buildDossier(outDir, { text_max_bytes: 65536 }));
}

console.log(`radar: ${rows.length} pre-token rows, ${launched.length} launched, board + dashboard written to ${outDir}`);
