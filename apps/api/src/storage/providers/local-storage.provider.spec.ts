import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';

import { LocalStorageProvider } from './local-storage.provider';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('bytes')),
  rm: jest.fn().mockResolvedValue(undefined),
}));

const STORAGE_ROOT = resolve(process.cwd(), '.data', 'media');

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalStorageProvider();
  });

  describe('upload', () => {
    it('writes a normal capture under STORAGE_ROOT', async () => {
      const { storagePath } = await provider.upload({
        buffer: Buffer.from('img'),
        mimeType: 'image/jpeg',
        pathHint: 'assessment-1/front.jpg',
      });

      expect(storagePath).toMatch(/-assessment-1\/front\.jpg$/);
      expect(writeFile).toHaveBeenCalledWith(resolve(STORAGE_ROOT, storagePath), expect.any(Buffer));
    });

    it.each(['assessment-1/../../../../tmp/pwned.jpg', 'assessment-1/../../escape.jpg'])(
      'rejects a traversal path hint (%s) without touching the filesystem',
      async (pathHint) => {
        await expect(
          provider.upload({ buffer: Buffer.from('img'), mimeType: 'image/jpeg', pathHint }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(mkdir).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
      },
    );
  });

  describe('getBuffer', () => {
    it('reads a stored path under STORAGE_ROOT', async () => {
      await provider.getBuffer('abc-assessment-1/front.jpg');
      expect(readFile).toHaveBeenCalledWith(resolve(STORAGE_ROOT, 'abc-assessment-1/front.jpg'));
    });

    it('rejects a path that resolves outside STORAGE_ROOT', async () => {
      await expect(provider.getBuffer('../../etc/passwd')).rejects.toBeInstanceOf(BadRequestException);
      expect(readFile).not.toHaveBeenCalled();
    });

    it('rejects an absolute path', async () => {
      await expect(provider.getBuffer('/etc/passwd')).rejects.toBeInstanceOf(BadRequestException);
      expect(readFile).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('rejects a path that resolves outside STORAGE_ROOT', async () => {
      await expect(provider.delete('../../important')).rejects.toBeInstanceOf(BadRequestException);
      expect(rm).not.toHaveBeenCalled();
    });

    it('rejects STORAGE_ROOT itself', async () => {
      await expect(provider.delete('.')).rejects.toBeInstanceOf(BadRequestException);
      expect(rm).not.toHaveBeenCalled();
    });
  });
});
