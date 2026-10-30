jest.mock('react-native-fs', () => ({ __esModule: true, default: { exists: jest.fn(), readDir: jest.fn() } }));

import RNFS from 'react-native-fs';
import { walkFiles, DiscoveredFile } from '../src/services/discovery/fileDiscovery';
import { DEFAULT_SCAN_OPTIONS } from '../src/services/core/scanContext';

type Item = { name: string; path: string; dir: boolean };
const tree: Record<string, Item[]> = {
  '/root': [
    { name: 'a.txt', path: '/root/a.txt', dir: false },
    { name: '.hidden.txt', path: '/root/.hidden.txt', dir: false },
    { name: 'node_modules', path: '/root/node_modules', dir: true },
    { name: 'Android', path: '/root/Android', dir: true },
    { name: 'docs', path: '/root/docs', dir: true },
  ],
  '/root/node_modules': [{ name: 'x.txt', path: '/root/node_modules/x.txt', dir: false }],
  '/root/Android': [{ name: 'data', path: '/root/Android/data', dir: true }],
  '/root/Android/data': [{ name: 'secret.txt', path: '/root/Android/data/secret.txt', dir: false }],
  '/root/docs': [{ name: 'b.txt', path: '/root/docs/b.txt', dir: false }],
};

beforeEach(() => {
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  (RNFS.readDir as jest.Mock).mockImplementation(async (p: string) =>
    (tree[p] ?? []).map((i) => ({
      name: i.name,
      path: i.path,
      size: 10,
      mtime: new Date(0),
      ctime: new Date(0),
      isDirectory: () => i.dir,
      isFile: () => !i.dir,
    })),
  );
});

async function collect(options = DEFAULT_SCAN_OPTIONS): Promise<string[]> {
  const found: string[] = [];
  await walkFiles(['/root'], (f: DiscoveredFile) => {
    found.push(f.path);
  }, options);
  return found.sort();
}

describe('walkFiles', () => {
  it('skips Android/data and excluded folders, keeps the rest', async () => {
    expect(await collect()).toEqual(['/root/.hidden.txt', '/root/a.txt', '/root/docs/b.txt']);
  });
  it('skips hidden files when asked', async () => {
    const r = await collect({ ...DEFAULT_SCAN_OPTIONS, includeHiddenFiles: false });
    expect(r).toEqual(['/root/a.txt', '/root/docs/b.txt']);
  });
  it('does not go into sub-folders when not recursive', async () => {
    const r = await collect({ ...DEFAULT_SCAN_OPTIONS, recursive: false });
    expect(r).toEqual(['/root/.hidden.txt', '/root/a.txt']);
  });
  it('scans excluded folders when the option is off', async () => {
    const r = await collect({ ...DEFAULT_SCAN_OPTIONS, excludeConfiguredPaths: false });
    expect(r).toContain('/root/node_modules/x.txt');
    expect(r).not.toContain('/root/Android/data/secret.txt');
  });
  it('stops when cancelled', async () => {
    const found: string[] = [];
    await walkFiles(['/root'], (f) => { found.push(f.path); }, DEFAULT_SCAN_OPTIONS, () => true);
    expect(found).toEqual([]);
  });
});
