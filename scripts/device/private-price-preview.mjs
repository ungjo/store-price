import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const PREVIEW_PORT = 8092;
export const PREVIEW_FLAG = 'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW';
export const PREVIEW_TOKEN = 'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN';
const states = new WeakMap();
const sessions = new WeakMap();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const day = 86_400_000;
const rowKeys = ['id', 'name', 'unit_label', 'is_sample', 'is_active', 'price_observation_id',
  'source_kind', 'source_product_id', 'source_url', 'sales_channel', 'store_id',
  'source_price_krw', 'play_price_krw', 'play_price_rule', 'observed_at', 'display_until',
  'valid_from', 'valid_until', 'promotion_type', 'promotion_conditions', 'availability',
  'rights_status', 'publication_state'];

function invalid() { return new Error('비공개 가격 미리보기 자료의 형식·출처·조회 시각을 확인해 주세요.'); }
function plain(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function text(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && value.trim() === value && value.isWellFormed() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}
function iso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw invalid();
  return value;
}

export function parsePrivateSnapshot(input, expectedProjectRef, now = Date.now()) {
  if (!plain(input, ['schemaVersion', 'projectRef', 'fetchedAt', 'rows']) || input.schemaVersion !== 1
    || !/^[a-z0-9-]{1,100}$/u.test(expectedProjectRef) || input.projectRef !== expectedProjectRef
    || !Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 20) throw invalid();
  const fetchedAt = iso(input.fetchedAt);
  if (!Number.isFinite(now) || Date.parse(fetchedAt) > now || now - Date.parse(fetchedAt) >= day) throw invalid();
  const ids = new Set();
  const observationIds = new Set();
  const products = input.rows.map((row) => {
    if (!plain(row, rowKeys) || !text(row.name, 120) || !text(row.unit_label, 120)
      || typeof row.source_product_id !== 'string' || !/^\d{13}$/u.test(row.source_product_id)
      || row.id !== 'ssg-emart-' + row.source_product_id || ids.has(row.id)
      || typeof row.price_observation_id !== 'string'
      || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(row.price_observation_id)
      || observationIds.has(row.price_observation_id.toLowerCase())
      || row.is_sample !== false || row.is_active !== false
      || row.source_kind !== 'manual_observation' || row.sales_channel !== 'ssg_emart_online'
      || row.rights_status !== 'unknown' || row.publication_state !== 'draft'
      || row.store_id !== null || row.valid_from !== null || row.valid_until !== null
      || row.promotion_conditions !== null || !['none', 'unknown'].includes(row.promotion_type)
      || !['available', 'out_of_stock', 'unknown'].includes(row.availability)
      || !Number.isInteger(row.source_price_krw) || row.source_price_krw < 1 || row.source_price_krw > 2147483647
      || row.play_price_krw !== row.source_price_krw || row.play_price_rule !== 'exact') throw invalid();
    const observedAt = iso(row.observed_at);
    const displayUntil = iso(row.display_until);
    if (observedAt > fetchedAt || Date.parse(displayUntil) <= Date.parse(observedAt)) throw invalid();
    if (!text(row.source_url, 1000) || !row.source_url.startsWith('https://emart.ssg.com/item/itemView.ssg?')) throw invalid();
    const url = new URL(row.source_url);
    const keys = [...url.searchParams.keys()];
    if (url.origin !== 'https://emart.ssg.com' || url.pathname !== '/item/itemView.ssg'
      || row.source_url.includes('#') || url.username || url.password || url.port || new Set(keys).size !== keys.length
      || keys.some((key) => !['itemId', 'siteNo', 'salestrNo'].includes(key))
      || url.searchParams.get('itemId') !== row.source_product_id || url.searchParams.get('siteNo') !== '6001'
      || (url.searchParams.has('salestrNo') && !/^\d{1,12}$/u.test(url.searchParams.get('salestrNo')))) throw invalid();
    ids.add(row.id); observationIds.add(row.price_observation_id.toLowerCase());
    // 승인 메모나 관리 상태를 통째로 전달하지 않고 화면에 필요한 사실만 새 객체로 만듭니다.
    return Object.freeze({ id: row.id, name: row.name, unit: row.unit_label, priceKrw: row.source_price_krw,
      sourceUrl: row.source_url, observedAt, displayUntil, availability: row.availability,
      isSample: false, sourceKind: 'manual_observation', salesChannel: 'ssg_emart_online' });
  }).sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({ fetchedAt, products: Object.freeze(products) });
}

function snapshotFile(repoRoot, inputPath) {
  const root = fs.realpathSync(repoRoot);
  const area = path.join(root, '.artifacts', 'catalog');
  const file = path.resolve(root, inputPath);
  const relative = path.relative(area, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw invalid();
  // 원본 파일뿐 아니라 부모 링크도 따라가지 않아 다른 개인 파일을 읽지 않습니다.
  let current = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw invalid();
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 131_072) throw invalid();
  return { root, file, bytes: fs.readFileSync(file) };
}

export function capturePrivatePreview(repoRoot, file, expectedProjectRef, now = Date.now()) {
  try {
    const input = snapshotFile(repoRoot, file);
    const parsed = parsePrivateSnapshot(JSON.parse(input.bytes.toString('utf8')), expectedProjectRef, now);
    const state = Object.freeze({ fingerprint: hash(input.bytes), productCount: parsed.products.length,
      fetchedAt: parsed.fetchedAt, projectRef: expectedProjectRef });
    states.set(state, { ...input, parsed, expectedProjectRef });
    return state;
  } catch { throw invalid(); }
}

export function assertPrivatePreviewUnchanged(state) {
  const captured = states.get(state);
  if (!captured) throw invalid();
  const now = capturePrivatePreview(captured.root, captured.file, captured.expectedProjectRef);
  if (now.fingerprint !== state.fingerprint) throw new Error('검사 중 비공개 가격 원본이 바뀌었습니다. 다시 검사해야 합니다.');
}

export function previewEnvironment(base, session) {
  const result = { ...base };
  delete result[PREVIEW_FLAG]; delete result[PREVIEW_TOKEN];
  if (session) {
    if (!sessions.has(session)) throw invalid();
    result[PREVIEW_FLAG] = '1'; result[PREVIEW_TOKEN] = session.token;
  }
  return result;
}

export function privatePreviewData(session) {
  const value = sessions.get(session);
  if (!value) throw invalid();
  return value.dto;
}

export async function startPrivatePreviewServer(state, { sessionId, port = PREVIEW_PORT } = {}) {
  const source = states.get(state);
  if (!source || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(sessionId)) throw invalid();
  assertPrivatePreviewUnchanged(state);
  const token = randomBytes(32).toString('hex');
  const dto = Object.freeze({ schemaVersion: 1, sessionId, fetchedAt: source.parsed.fetchedAt,
    products: source.parsed.products });
  const body = JSON.stringify(dto);
  let actualPort;
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const auth = request.headers.authorization;
    const expected = 'Bearer ' + token;
    // 브라우저 출처·DNS 재바인딩·무인증 요청은 받지 않습니다. 이 서버는 USB 개발 미리보기 전용입니다.
    const allowed = request.method === 'GET' && request.url === '/preview'
      && request.headers.host === '127.0.0.1:' + actualPort && !Object.hasOwn(request.headers, 'origin')
      && typeof auth === 'string' && Buffer.byteLength(auth) === Buffer.byteLength(expected)
      && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
    response.writeHead(allowed ? 200 : 403, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(allowed ? body : '{"error":"preview_unavailable"}');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => { actualPort = server.address().port; resolve(); });
  });
  const session = Object.freeze({ token, sessionId, port: actualPort, fingerprint: hash(body),
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections(); server.close((error) => error ? reject(error) : resolve());
    }) });
  sessions.set(session, { dto, body, state });
  return session;
}

export async function checkPrivatePreviewHttp(session) {
  const data = sessions.get(session);
  if (!data) throw invalid();
  assertPrivatePreviewUnchanged(data.state);
  try {
    const response = await fetch('http://127.0.0.1:' + session.port + '/preview', {
      headers: { Authorization: 'Bearer ' + session.token }, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    if (response.status !== 200 || response.headers.get('cache-control') !== 'no-store'
      || hash(body) !== session.fingerprint) throw invalid();
    return { productCount: data.dto.products.length, fingerprint: session.fingerprint,
      sourceFingerprint: data.state.fingerprint, fetchedAt: data.state.fetchedAt };
  } catch { throw new Error('USB용 비공개 가격 응답을 확인하지 못했습니다.'); }
}

export function scanReleaseForPrivateData(directory, state, token) {
  const source = states.get(state);
  if (!source || !/^[a-f\d]{64}$/u.test(token)) throw invalid();
  const needles = [token, ...source.parsed.products.flatMap((p) => [p.id, p.id.slice('ssg-emart-'.length), p.name, p.sourceUrl])];
  let count = 0;
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('배포 산출물의 링크를 검사할 수 없습니다.');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        if (fs.statSync(file).size > 134_217_728) throw new Error('배포 산출물이 검사 크기 제한을 넘었습니다.');
        const bytes = fs.readFileSync(file); count++;
        if (needles.some((value) => bytes.includes(Buffer.from(value)) || bytes.includes(Buffer.from(value, 'utf16le')))) {
          throw new Error('배포 산출물에 비공개 상품 또는 임시 연결 값이 포함됐습니다.');
        }
      }
    }
  }
  visit(directory);
  if (!count) throw new Error('검사할 배포 산출물이 없습니다.');
  return { scannedFiles: count, privateValuesAbsent: true };
}

export function writePreviewExpectations(file, session) {
  const dto = session ? privatePreviewData(session) : { products: [], sessionId: '' };
  const escape = (value) => '^' + value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') + '$';
  const stock = { unknown: '재고 미확인', available: '확인 당시 판매 가능', out_of_stock: '확인 당시 품절' };
  const time = (iso) => new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' (한국 시간)';
  const value = { sessionId: dto.sessionId,
    fetched: dto.fetchedAt ? escape('DB에서 가져온 시각 ' + time(dto.fetchedAt)) : '',
    products: dto.products.map((product) => ({
    name: escape(product.name), unit: escape(product.unit),
    price: escape(product.priceKrw.toLocaleString('ko-KR') + '원'),
    observed: escape('확인 시각 ' + time(product.observedAt)), stock: escape(stock[product.availability]),
    expiry: escape(Date.parse(product.displayUntil) <= Date.now()
      ? '내부 재확인 기한이 지난 기록이에요.' : '확인 당시 가격이며 지금 가격과 다를 수 있어요.'),
    url: escape(product.sourceUrl),
  })) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = 'output.privatePreview = ' + JSON.stringify(value).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029') + ';\n';
  fs.writeFileSync(file, bytes);
  const fingerprint = hash(bytes);
  return () => { if (hash(fs.readFileSync(file)) !== fingerprint) throw new Error('검사 중 미리보기 기대값이 바뀌었습니다.'); };
}
