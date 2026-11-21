import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { createCatalogSession } = await import(pathToFileURL(path.join(root, 'apps/mobile/src/features/catalog/catalog-session.ts')));
const { sampleProducts } = await import(pathToFileURL(path.join(root, 'apps/mobile/src/data/sample-products.ts')));
let resolveRemote;
let aborted = false;
let current;
const session = createCatalogSession({
  samples: sampleProducts,
  read: signal => {
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    // abort를 일부러 무시하는 늦은 서버를 흉내 냅니다. 실제 통신은 하지 않습니다.
    return new Promise(resolve => { resolveRemote = resolve; });
  },
});
const disconnect = session.connect(next => {
  current = next;
  console.log(next.status, next.status === 'ready' ? next.source + ':' + next.products.length : '');
});
try {
  session.useSamples();
  assert.equal(aborted, true);
  assert.equal(current.source, 'sample');
  resolveRemote(sampleProducts.slice(0, 1));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(current.source, 'sample');
  assert.equal(current.products.length, 12);
  console.log('늦은 원격 1개 응답 후에도 sample:12 유지');
} finally {
  disconnect();
}
