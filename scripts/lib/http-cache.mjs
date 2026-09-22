/**
 * Disk cache for GDP fetch HTTP GETs/POSTs. Data changes infrequently;
 * stale after CACHE_TTL_MS (default ~6 months). Set GDP_CACHE_BUST=1 to ignore.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache");
/** ~6 months */
export const CACHE_TTL_MS = 182 * 24 * 60 * 60 * 1000;

function cacheKey(url, init) {
  const method = String(init?.method ?? "GET").toUpperCase();
  const body = init?.body != null ? String(init.body) : "";
  return createHash("sha256")
    .update(`${method}\n${url}\n${body}`)
    .digest("hex")
    .slice(0, 32);
}

function cachePath(url, init) {
  return join(CACHE_DIR, `${cacheKey(url, init)}.json`);
}

function readCache(url, init) {
  const bust = process.env.GDP_CACHE_BUST === "1";
  const file = cachePath(url, init);
  if (bust || !existsSync(file)) return null;
  try {
    const entry = JSON.parse(readFileSync(file, "utf8"));
    if (
      entry?.url === url &&
      typeof entry.savedAt === "string" &&
      entry.data != null &&
      Date.now() - new Date(entry.savedAt).getTime() < CACHE_TTL_MS
    ) {
      return entry.data;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function writeCache(url, init, data) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      cachePath(url, init),
      JSON.stringify({ url, savedAt: new Date().toISOString(), data }),
      "utf8",
    );
  } catch {
    /* cache write is best-effort */
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
export async function cachedFetchJson(url, init) {
  const hit = readCache(url, init);
  if (hit != null) return hit;

  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  writeCache(url, init, data);
  return data;
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<string>}
 */
export async function cachedFetchText(url, init) {
  const hit = readCache(url, init);
  if (typeof hit === "string") return hit;

  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  writeCache(url, init, text);
  return text;
}
