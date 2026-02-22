import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';

/**
 * SnapshotService manages the storage and retrieval of
 * detection snapshots saved to the persistent volume.
 */
export class SnapshotService {
  private get _snapshotDir(): string {
    const dataDir =
      process.env.DATA_DIR ||
      (process.env.NODE_ENV === 'production' ? '/app/data' : './data');
    return join(dataDir, 'snapshots');
  }

  constructor() {
    if (!existsSync(this._snapshotDir)) {
      mkdirSync(this._snapshotDir, { recursive: true });
    }
  }

  /**
   * List all snapshots with metadata
   */
  listSnapshots(options?: {
    limit?: number;
    offset?: number;
    label?: string;
  }): { snapshots: SnapshotInfo[]; total: number } {
    let files: string[];
    try {
      files = readdirSync(this._snapshotDir)
        .filter(
          (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
        )
        .sort()
        .reverse(); // newest first
    } catch {
      return { snapshots: [], total: 0 };
    }

    // Filter by label if specified
    if (options?.label) {
      files = files.filter((f) =>
        f.toLowerCase().startsWith(options.label!.toLowerCase())
      );
    }

    const total = files.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const paged = files.slice(offset, offset + limit);

    const snapshots: SnapshotInfo[] = paged.map((filename) => {
      const filePath = join(this._snapshotDir, filename);
      const stat = statSync(filePath);

      // Parse label and confidence from filename: label_timestamp_confidence.jpg
      const parts = filename.replace(/\.\w+$/, '').split('_');
      const label = parts[0] || 'unknown';
      const confidence = parseInt(parts[parts.length - 1] || '0', 10) / 100;

      return {
        filename,
        label,
        confidence,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    });

    return { snapshots, total };
  }

  /**
   * Read a snapshot file
   */
  readSnapshot(filename: string): { data: Buffer; mimeType: string } | null {
    const filePath = join(this._snapshotDir, filename);

    // Prevent directory traversal
    if (!filePath.startsWith(this._snapshotDir)) {
      return null;
    }

    try {
      const data = readFileSync(filePath);
      const ext = filename.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      return { data, mimeType };
    } catch {
      return null;
    }
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(filename: string): boolean {
    const filePath = join(this._snapshotDir, filename);

    // Prevent directory traversal
    if (!filePath.startsWith(this._snapshotDir)) {
      return false;
    }

    try {
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up old snapshots, keeping the most recent N
   */
  cleanup(keepCount = 500): number {
    let files: string[];
    try {
      files = readdirSync(this._snapshotDir)
        .filter(
          (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
        )
        .sort()
        .reverse();
    } catch {
      return 0;
    }

    if (files.length <= keepCount) {
      return 0;
    }

    const toDelete = files.slice(keepCount);
    let deleted = 0;

    for (const filename of toDelete) {
      try {
        unlinkSync(join(this._snapshotDir, filename));
        deleted++;
      } catch {
        // ignore individual delete failures
      }
    }

    return deleted;
  }
}

export interface SnapshotInfo {
  filename: string;
  label: string;
  confidence: number;
  size: number;
  createdAt: string;
}
