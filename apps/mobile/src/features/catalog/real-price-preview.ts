export type RealPricePreviewProduct = Readonly<{
  id: string;
  name: string;
  unit: string;
  priceKrw: number;
  sourceUrl: string;
  observedAt: string;
  displayUntil: string;
  availability: 'available' | 'out_of_stock' | 'unknown';
  isSample: false;
  sourceKind: 'manual_observation';
  salesChannel: 'ssg_emart_online';
}>;

export type RealPricePreview = Readonly<{
  schemaVersion: 1;
  sessionId: string;
  fetchedAt: string;
  products: readonly RealPricePreviewProduct[];
}>;

export type RealPricePreviewConfig = Readonly<{ token: string }>;
export const REAL_PRICE_PREVIEW_URL = 'http://127.0.0.1:8092/preview';
export const PREVIEW_TIMEOUT_MS = 12000;
const MAX_PREVIEW_PRODUCTS = 20;
const MAX_RESPONSE_LENGTH = 65536;
const envelopeFields = ['schemaVersion', 'sessionId', 'fetchedAt', 'products'];
const productFields = [
  'id', 'name', 'unit', 'priceKrw', 'sourceUrl', 'observedAt', 'displayUntil',
  'availability', 'isSample', 'sourceKind', 'salesChannel',
];

class PreviewError extends Error {}

const invalid = () => new PreviewError('가격 기록을 확인할 수 없어요. PC에서 미리보기를 다시 준비해 주세요.');
const cancelled = () => {
  const error = new PreviewError('가격 미리보기를 닫았어요.');
  error.name = 'AbortError';
  return error;
};

export function readRealPricePreviewConfig(
  development: boolean,
  enabled: string | undefined,
  token: string | undefined,
): RealPricePreviewConfig | null {
  // 배포 앱에서는 설정 값이 남아 있어도 미리보기 연결을 만들지 않습니다.
  if (!development || enabled !== '1') return null;
  if (!token || !/^[0-9a-f]{64}$/u.test(token)) throw invalid();
  return Object.freeze({ token });
}

function exactRecord(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && Object.keys(value).every((key) => fields.includes(key));
}

function displayText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0
    && Array.from(value).length <= maximum
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) throw invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw invalid();
  return time;
}

function verifySourceUrl(value: unknown, productId: string): value is string {
  if (typeof value !== 'string' || value.length > 1000
    || /[\s\u0000-\u001f\u007f-\u009f]/u.test(value)
    || !value.startsWith('https://emart.ssg.com/item/itemView.ssg?')) return false;
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    return url.origin === 'https://emart.ssg.com' && url.pathname === '/item/itemView.ssg'
      && !url.username && !url.password && !url.port && !value.includes('#')
      && new Set(keys).size === keys.length
      && keys.every((key) => ['itemId', 'siteNo', 'salestrNo'].includes(key))
      && url.searchParams.get('itemId') === productId.slice('ssg-emart-'.length)
      && url.searchParams.get('siteNo') === '6001'
      && (!url.searchParams.has('salestrNo') || /^\d{1,12}$/u.test(url.searchParams.get('salestrNo') ?? ''));
  } catch {
    return false;
  }
}

export function parseRealPricePreview(
  value: unknown,
  options: { now?: number; expectedSessionId?: string } = {},
): RealPricePreview {
  if (!exactRecord(value, envelopeFields) || value.schemaVersion !== 1
    || typeof value.sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value.sessionId)
    || (options.expectedSessionId !== undefined && value.sessionId !== options.expectedSessionId)
    || !Array.isArray(value.products) || value.products.length > MAX_PREVIEW_PRODUCTS) throw invalid();
  const now = options.now ?? Date.now();
  const fetchedAt = timestamp(value.fetchedAt);
  if (!Number.isFinite(now) || fetchedAt > now + 5 * 60 * 1000) throw invalid();
  const ids = new Set<string>();
  const products = value.products.map((row: unknown): RealPricePreviewProduct => {
    // 서버 응답에 관리 메모나 다른 열이 섞이면 화면에 넘기지 않고 응답 전체를 거절합니다.
    if (!exactRecord(row, productFields) || typeof row.id !== 'string' || !/^ssg-emart-\d{13}$/u.test(row.id)
      || ids.has(row.id) || !displayText(row.name, 120) || !displayText(row.unit, 120)
      || typeof row.priceKrw !== 'number' || !Number.isInteger(row.priceKrw)
      || row.priceKrw < 1 || row.priceKrw > 2147483647
      || !verifySourceUrl(row.sourceUrl, row.id)
      || typeof row.availability !== 'string' || !['available', 'out_of_stock', 'unknown'].includes(row.availability)
      || row.isSample !== false || row.sourceKind !== 'manual_observation'
      || row.salesChannel !== 'ssg_emart_online') throw invalid();
    const observedAt = timestamp(row.observedAt);
    const displayUntil = timestamp(row.displayUntil);
    if (observedAt > fetchedAt || displayUntil <= observedAt) throw invalid();
    ids.add(row.id);
    // 오래된 관측도 읽기 전용 기록으로 확인할 수 있습니다. 화면에서 현재 가격과 구분합니다.
    return Object.freeze({
      id: row.id, name: row.name, unit: row.unit, priceKrw: row.priceKrw,
      sourceUrl: row.sourceUrl, observedAt: row.observedAt as string,
      displayUntil: row.displayUntil as string,
      availability: row.availability as RealPricePreviewProduct['availability'],
      isSample: false, sourceKind: 'manual_observation', salesChannel: 'ssg_emart_online',
    });
  });
  return Object.freeze({ schemaVersion: 1, sessionId: value.sessionId, fetchedAt: value.fetchedAt as string, products: Object.freeze(products) });
}

export function formatPreviewTime(value: string): string {
  // 기기 언어·시간대와 무관하게 한국에서 확인한 시각을 같은 형식으로 읽습니다.
  const korean = new Date(timestamp(value) + 9 * 60 * 60 * 1000).toISOString();
  return korean.slice(0, 10) + ' ' + korean.slice(11, 16) + ' (한국 시간)';
}

export function previewStockLabel(status: RealPricePreviewProduct['availability']): string {
  return status === 'out_of_stock' ? '확인 당시 품절'
    : status === 'available' ? '확인 당시 판매 가능' : '재고 미확인';
}

export function previewIsExpired(product: RealPricePreviewProduct, now: number): boolean {
  return timestamp(product.displayUntil) <= now;
}

export async function loadRealPricePreview(
  config: RealPricePreviewConfig,
  options: { signal?: AbortSignal; fetch?: typeof globalThis.fetch; now?: number; expectedSessionId?: string; timeoutMs?: number } = {},
): Promise<RealPricePreview> {
  if (!readRealPricePreviewConfig(true, '1', config.token)) throw invalid();
  if (options.signal?.aborted) throw cancelled();
  const timeout = options.timeoutMs ?? PREVIEW_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > PREVIEW_TIMEOUT_MS) throw invalid();
  const controller = new AbortController();
  let rejectStop: (reason: PreviewError) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const stop = (error: PreviewError) => {
    if (controller.signal.aborted) return;
    rejectStop(error);
    controller.abort();
  };
  const onAbort = () => stop(cancelled());
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => stop(new PreviewError('PC의 가격 기록을 기다리는 시간이 길어졌어요. 다시 시도해 주세요.')), timeout);
  let completed = false;
  try {
    const request = async () => {
      // 주소를 입력으로 받지 않아 임시 연결 토큰을 외부 사이트로 보내지 않습니다.
      const response = await (options.fetch ?? globalThis.fetch)(REAL_PRICE_PREVIEW_URL, {
        method: 'GET', headers: { Accept: 'application/json', Authorization: 'Bearer ' + config.token },
        signal: controller.signal, redirect: 'error', credentials: 'omit',
      });
      if (!response.ok || (response.url && response.url !== REAL_PRICE_PREVIEW_URL)) throw invalid();
      const body = await response.text();
      if (body.length > MAX_RESPONSE_LENGTH) throw invalid();
      let value: unknown;
      try { value = JSON.parse(body); } catch { throw invalid(); }
      return parseRealPricePreview(value, options);
    };
    const result = await Promise.race([request(), stopped]);
    completed = true;
    return result;
  } catch (error) {
    if (error instanceof PreviewError) throw error;
    // 외부 오류·서버 응답에는 토큰이나 원본 자료가 있을 수 있어 그대로 표시하지 않습니다.
    throw new PreviewError('PC의 가격 기록에 연결하지 못했어요. USB 연결과 미리보기 실행 상태를 확인해 주세요.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    if (!completed) controller.abort();
  }
}
