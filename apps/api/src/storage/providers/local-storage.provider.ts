import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';

import { StorageProvider } from '../storage-provider.interface';

const STORAGE_ROOT = resolve(process.cwd(), '.data', 'media');

/**
 * Resolves a storage path to an absolute path, refusing anything that lands
 * outside STORAGE_ROOT (e.g. `../` sequences in a client-supplied label).
 */
function resolveWithinRoot(storagePath: string): string {
  const fullPath = resolve(STORAGE_ROOT, storagePath);
  if (!fullPath.startsWith(STORAGE_ROOT + sep)) {
    throw new BadRequestException('Invalid storage path');
  }
  return fullPath;
}

/**
 * Default provider: stores uploaded media on the local filesystem. Fine for
 * a single-instance dev/demo deployment; swapped for SupabaseStorageProvider
 * once Supabase credentials are configured (see StorageModule's factory) —
 * required for any multi-instance or production deployment.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  async upload({ buffer, pathHint }: { buffer: Buffer; mimeType: string; pathHint: string }) {
    const storagePath = `${randomUUID()}-${pathHint}`;
    const fullPath = resolveWithinRoot(storagePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return { storagePath };
  }

  async getBuffer(storagePath: string): Promise<Buffer> {
    return readFile(resolveWithinRoot(storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    await rm(resolveWithinRoot(storagePath), { force: true });
  }
}
