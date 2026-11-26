export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  upload(params: { buffer: Buffer; mimeType: string; pathHint: string }): Promise<{ storagePath: string }>;
  getBuffer(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}
