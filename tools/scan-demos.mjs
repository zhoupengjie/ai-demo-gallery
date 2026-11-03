#!/usr/bin/env node
// Scans demos/<slug>/demo.json and writes demos/manifest.json.
// Zero dependencies. Run: node tools/scan-demos.mjs
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DEMO_DIR = "demos";
const MANIFEST = path.join(DEMO_DIR, "manifest.json");
const STATUSES = new Set(["stable", "wip", "broken"]);
const EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];
const EFFORT_SET = new Set(EFFORTS);
const REQUIRED = ["title", "summary", "agent", "effort"];
const META_KEYS = ["slug", "title", "summary", "tags", "status", "agent", "effort", "prompt", "notes", "createdAt", "poster", "interactive"];

const fileSize = async (p) => (await stat(p)).size;

async function listDemos() {
  if (!existsSync(DEMO_DIR)) return [];
  const entries = await readdir(DEMO_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readMeta(slug) {
  const dir = path.join(DEMO_DIR, slug);
  const metaPath = path.join(dir, "demo.json");
  if (!existsSync(metaPath)) return { slug, skip: "no demo.json" };

  let meta;
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8"));
  } catch (err) {
    return { slug, skip: `invalid JSON: ${err.message}` };
  }

  const problems = [];
  for (const key of REQUIRED) {
    if (typeof meta[key] !== "string" || !meta[key].trim()) problems.push(`missing "${key}"`);
  }
  const entry = ["index.html", "index.htm"].find((f) => existsSync(path.join(dir, f)));
  if (!entry) problems.push("missing index.html");

  const status = meta.status ?? "stable";
  if (!STATUSES.has(status)) problems.push(`unknown status "${status}" (use stable|wip|broken)`);

  const effort = typeof meta.effort === "string" ? meta.effort.trim() : "";
  if (effort && !EFFORT_SET.has(effort)) {
    problems.push(`invalid effort "${effort}" (use ${EFFORTS.join("|")})`);
  }

  const unknown = Object.keys(meta).filter((k) => !META_KEYS.includes(k));
  if (unknown.length) problems.push(`unknown keys: ${unknown.join(", ")}`);

  if (problems.some((p) => !p.startsWith("unknown"))) {
    return { slug, skip: problems.join("; ") };
  }
  if (problems.length) {
    console.warn(`warn  ${slug}: ${problems.join("; ")}`);
  }

  const tags = Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === "string" && t.trim()) : [];
  const createdAt = meta.createdAt ?? (await stat(metaPath)).mtime.toISOString().slice(0, 10);
  const poster = meta.poster && existsSync(path.join(dir, meta.poster)) ? meta.poster : null;

  return {
    slug,
    title: meta.title.trim(),
    summary: meta.summary.trim(),
    tags,
    status,
    agent: meta.agent.trim(),
    effort,
    prompt: meta.prompt ?? null,
    notes: meta.notes ?? null,
    interactive: meta.interactive !== false,
    createdAt,
    poster,
    entry: `${DEMO_DIR}/${slug}/${entry}`,
    files: (await readdir(dir)).filter((f) => !f.startsWith(".")).sort(),
    bytes: await fileSize(path.join(dir, entry)),
  };
}

const slugs = await listDemos();
const demos = [];
const skipped = [];
for (const slug of slugs) {
  const demo = await readMeta(slug);
  if (demo.skip) skipped.push(demo);
  else demos.push(demo);
}

demos.sort((a, b) => (a.createdAt === b.createdAt ? a.title.localeCompare(b.title) : a.createdAt < b.createdAt ? 1 : -1));

const manifest = { generatedAt: new Date().toISOString(), demos };
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

for (const s of skipped) console.error(`skip  ${s.slug}: ${s.skip}`);
console.log(`${demos.length} demo(s) -> ${MANIFEST}`);
if (skipped.length) process.exitCode = 1;
