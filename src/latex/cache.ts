/**
 * Cache management for rendered LaTeX equations
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface CacheStats {
  entryCount: number;
  totalBytes: number;
}

/**
 * Manages PNG cache for rendered LaTeX equations.
 *
 * Cache key: SHA256 of version, color, mode, width and trimmed source
 * Cache file: {cacheDir}/{hash}.png
 */
export class CacheManager {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /**
   * Ensure cache directory exists.
   */
  async ensureDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Generate cache key from LaTeX source.
   */
  getKey(latex: string, displayMode: boolean, targetCells: number = 60, color = "#000000"): string {
    const normalized = `latex-v6:${color.toLowerCase()}:${displayMode ? "display" : "inline"}:${targetCells}\n${latex.trim()}`;
    return createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Get path to cached PNG file.
   * Returns null if not cached.
   */
  async getCachedPath(key: string): Promise<string | null> {
    const path = join(this.cacheDir, `${key}.png`);

    try {
      await stat(path);
      return path;
    } catch {
      return null;
    }
  }

  /**
   * Read cached PNG as buffer.
   * Returns null if not cached.
   */
  async readCached(key: string): Promise<Buffer | null> {
    const path = await this.getCachedPath(key);

    if (!path) {
      return null;
    }

    try {
      return await readFile(path);
    } catch {
      return null;
    }
  }

  /**
   * Write PNG to cache.
   */
  async write(key: string, pngBuffer: Buffer): Promise<string> {
    const path = join(this.cacheDir, `${key}.png`);
    await writeFile(path, pngBuffer);
    return path;
  }

  /**
   * Clear all cached entries.
   */
  async clear(): Promise<void> {
    try {
      const entries = await readdir(this.cacheDir);

      for (const entry of entries) {
        if (entry.endsWith(".png")) {
          await unlink(join(this.cacheDir, entry));
        }
      }
    } catch {
      // Ignore errors (cache dir may not exist)
    }
  }

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    try {
      const entries = await readdir(this.cacheDir);
      let totalBytes = 0;
      let entryCount = 0;

      for (const entry of entries) {
        if (entry.endsWith(".png")) {
          const path = join(this.cacheDir, entry);
          const stats = await stat(path);
          totalBytes += stats.size;
          entryCount++;
        }
      }

      return { entryCount, totalBytes };
    } catch {
      return { entryCount: 0, totalBytes: 0 };
    }
  }

  /**
   * Evict cache entries older than maxAgeDays.
   */
  async evictOldEntries(maxAgeDays: number): Promise<number> {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let evictedCount = 0;

    try {
      const entries = await readdir(this.cacheDir);

      for (const entry of entries) {
        if (entry.endsWith(".png")) {
          const path = join(this.cacheDir, entry);
          const stats = await stat(path);
          const ageMs = now - stats.mtime.getTime();

          if (ageMs > maxAgeMs) {
            await unlink(path);
            evictedCount++;
          }
        }
      }
    } catch {
      // Ignore errors (cache dir may not exist)
    }

    return evictedCount;
  }
}
