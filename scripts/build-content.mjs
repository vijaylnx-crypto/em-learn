#!/usr/bin/env node
// Converts the awesome-engineering-management README into data/content.json.
//
//   node scripts/build-content.mjs                 # fetch latest README from GitHub
//   node scripts/build-content.mjs ./README.md     # use a local copy
//
// Heading levels: "#" = track, "##" = area, "###" = topic.
// An "##" with no "###" children (e.g. Learning > Books) becomes a topic itself.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE_URL =
  'https://raw.githubusercontent.com/engineering-management/awesome-engineering-management/master/README.md';
const REPO_URL = 'https://github.com/engineering-management/awesome-engineering-management';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'content.json');

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/;
const URL_RE = /https?:\/\/[^\s|)]+/;

const slug = (s) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const stripMd = (s) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();

// Small, stable hash so a link keeps its id (and your "read" state) across content updates.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function kindOf(url, group) {
  const g = (group || '').toLowerCase();
  if (g.startsWith('book')) return 'book';
  if (g.startsWith('paper')) return 'paper';
  if (/amazon\.|goodreads\./.test(url)) return 'book';
  if (/wikipedia\.org/.test(url)) return 'wiki';
  if (/scholar\.google|dl\.acm|doi\.org|\.pdf($|\?)|tandfonline|academia\.edu|computer\.org/.test(url))
    return 'paper';
  if (/youtube\.com|youtu\.be/.test(url)) return 'video';
  if (/github\.com/.test(url)) return 'repo';
  return 'article';
}

export function parse(md) {
  const lines = md.split(/\r?\n/);
  const tracks = [];
  let track = null;
  let area = null;
  let topic = null;
  let group = null;
  let tableHeader = null;

  const start = lines.findIndex((l) => /^# /.test(l)); // skip banner + table of contents
  const newTopic = (title, url) => ({
    id: slug([track?.title, area?.title, title].filter(Boolean).join(' ')),
    title,
    links: url ? [{ id: hash(url), title, url, desc: '', group: null, kind: kindOf(url) }] : [],
  });

  for (const raw of lines.slice(start)) {
    const line = raw.replace(/\s+$/, '');
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const headingLink = LINK_RE.exec(h[2]);
      const title = stripMd(h[2]);
      group = null;
      tableHeader = null;
      if (level === 1) {
        track = { id: slug(title), title, areas: [] };
        tracks.push(track);
        area = { id: slug(title + ' overview'), title, topics: [] };
        track.areas.push(area);
        topic = newTopic(title, headingLink?.[2]);
        area.topics.push(topic);
      } else if (level === 2) {
        area = { id: slug(track.title + ' ' + title), title, topics: [] };
        track.areas.push(area);
        topic = newTopic(title);
        topic.areaLevel = true; // removed later if ### topics follow
        area.topics.push(topic);
      } else {
        if (topic?.areaLevel && topic.links.length === 0) area.topics.pop();
        topic = newTopic(title);
        area.topics.push(topic);
      }
      continue;
    }
    if (!topic) continue;

    // Tables
    if (line.startsWith('|')) {
      const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue; // separator row
      if (!tableHeader) {
        tableHeader = cells;
        continue;
      }
      let title = null;
      let url = null;
      const rest = [];
      cells.forEach((c) => {
        const m = LINK_RE.exec(c);
        const u = !m && URL_RE.exec(c);
        if (m && !url) [title, url] = [stripMd(m[1]), m[2]];
        else if (u && !url) url = u[0];
        else if (c) rest.push(stripMd(c));
      });
      if (!url) continue;
      if (!title) title = rest.shift() || url;
      topic.links.push({ id: hash(url), title, url, desc: rest.join(' — '), group: null, kind: kindOf(url) });
      continue;
    }
    tableHeader = null;

    // Bullets
    const b = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (!b) continue;
    const indent = b[1].length;
    const body = b[2];
    const m = LINK_RE.exec(body);
    if (!m) {
      group = stripMd(body).replace(/:$/, ''); // "Books", "Papers", ...
      continue;
    }
    if (indent === 0) group = null;
    const url = m[2];
    const desc = stripMd(body.slice(m.index + m[0].length).replace(/^\s*[-–—:]\s*/, ''));
    topic.links.push({ id: hash(url), title: stripMd(m[1]), url, desc, group, kind: kindOf(url, group) });
  }

  // Clean up: drop empty topics/areas, drop the empty "overview" areas.
  for (const t of tracks) {
    for (const a of t.areas) {
      a.topics = a.topics.filter((tp) => tp.links.length);
      a.topics.forEach((tp) => delete tp.areaLevel);
    }
    t.areas = t.areas.filter((a) => a.topics.length);
  }
  // Learning > Books / Courses / Podcasts: tag the links by the list they're in.
  const byTitle = { books: 'book', courses: 'course', podcasts: 'podcast' };
  for (const tp of tracks.flatMap((t) => t.areas.flatMap((a) => a.topics))) {
    const k = byTitle[tp.title.toLowerCase()];
    if (k) tp.links.forEach((l) => (l.kind = k));
  }
  return tracks.filter((t) => t.areas.length);
}

async function main() {
  const local = process.argv[2];
  const md = local ? await readFile(local, 'utf8') : await (await fetch(SOURCE_URL)).text();
  const tracks = parse(md);
  const topics = tracks.flatMap((t) => t.areas.flatMap((a) => a.topics));
  const content = {
    source: REPO_URL,
    license: 'CC0-1.0',
    generatedAt: new Date().toISOString(),
    stats: { topics: topics.length, links: topics.reduce((n, t) => n + t.links.length, 0) },
    tracks,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(content, null, 1));
  console.log(`Wrote ${OUT}: ${content.stats.topics} topics, ${content.stats.links} links`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
