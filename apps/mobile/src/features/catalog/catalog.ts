export type CatalogProduct = Readonly<{
  id: string;
  name: string;
  unit: string;
  priceKrw: number;
  emoji: string;
  color: string;
  isSample: boolean;
  priceObservationId?: string;
}>;

export type CatalogConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export const MAX_CATALOG_PRODUCTS = 1000;
export const CATALOG_TIMEOUT_MS = 12000;

const selectedColumns = [
  'id', 'name', 'unit_label', 'source_price_krw', 'play_price_krw',
  'play_price_rule', 'is_sample', 'emoji', 'color', 'price_observation_id',
].join(',');

class CatalogError extends Error {}

function invalidResponse(): CatalogError {
  return new CatalogError('상품 목록 정보가 올바르지 않아요. 관리자에게 확인해 주세요.');
}

function oversizedCatalog(): CatalogError {
  return new CatalogError('상품이 너무 많아 목록을 모두 불러올 수 없어요. 관리자에게 확인해 주세요.');
}

function cancelledRequest(): CatalogError {
  const error = new CatalogError('상품 목록 불러오기를 취소했어요.');
  error.name = 'AbortError';
  return error;
}

export function readCatalogConfig(
  url: string | undefined,
  key: string | undefined,
): CatalogConfig | null {
  const normalizedUrl = url?.trim() ?? '';
  const normalizedKey = key?.trim() ?? '';
  if (!normalizedUrl && !normalizedKey) {
    return null;
  }

  if (!normalizedUrl || !normalizedKey) {
    throw new CatalogError('상품 서버 주소와 공개 키를 함께 설정해 주세요.');
  }

  // 프로젝트 주소만 받아 잘못 붙인 경로·다른 서버로 공개 키를 보내지 않습니다.
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co\/?$/u.test(normalizedUrl)) {
    throw new CatalogError('상품 서버 주소는 https://프로젝트주소.supabase.co 형식이어야 해요.');
  }

  // 관리자 키와 이전 JWT 키를 앱 설정에 넣는 실수를 차단하며 오류에 입력한 키를 되풀이하지 않습니다.
  if (normalizedKey.length > 256 || !/^sb_publishable_[A-Za-z0-9_-]+$/u.test(normalizedKey)) {
    throw new CatalogError('앱에는 sb_publishable_로 시작하는 공개 키만 사용할 수 있어요.');
  }

  return { url: normalizedUrl.replace(/\/$/u, ''), publishableKey: normalizedKey };
}

function isDisplayText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && Array.from(value).length <= maxLength
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function parseCatalogRows(value: unknown): readonly CatalogProduct[] {
  if (!Array.isArray(value)) {
    throw invalidResponse();
  }
  if (value.length > MAX_CATALOG_PRODUCTS) {
    throw oversizedCatalog();
  }

  const productIds = new Set<string>();
  const observationIds = new Set<string>();
  // 잘못된 행만 버리면 사용자가 불완전한 목록으로 놀이하게 되므로 응답 전체를 함께 확인합니다.
  return value.map((item: unknown): CatalogProduct => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw invalidResponse();
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string'
      || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(row.id)
      || !isDisplayText(row.name, 120)
      || !isDisplayText(row.unit_label, 120)
      || !isDisplayText(row.emoji, 16)
      || typeof row.color !== 'string'
      || !/^#[0-9a-fA-F]{6}$/u.test(row.color)
      || typeof row.is_sample !== 'boolean'
      || typeof row.play_price_krw !== 'number'
      || !Number.isInteger(row.play_price_krw)
      || row.play_price_krw <= 0
      || row.play_price_krw > 10000
      || row.source_price_krw !== row.play_price_krw
      || row.play_price_rule !== 'exact'
      || typeof row.price_observation_id !== 'string'
      || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u.test(row.price_observation_id)
      || productIds.has(row.id)
      || observationIds.has(row.price_observation_id.toLowerCase())
    ) {
      throw invalidResponse();
    }

    productIds.add(row.id);
    observationIds.add(row.price_observation_id.toLowerCase());
    // 원본 응답의 관리 정보나 참조를 화면으로 넘기지 않고 앱이 사용하는 값만 복사합니다.
    return {
      id: row.id,
      name: row.name,
      unit: row.unit_label,
      priceKrw: row.play_price_krw,
      emoji: row.emoji,
      color: row.color,
      isSample: row.is_sample,
      priceObservationId: row.price_observation_id,
    };
  });
}

function verifyCompleteRange(range: string | null, rowCount: number): void {
  const match = range?.match(/^(?:(\d+)-(\d+)|(\*))\/(\d+)$/u);
  if (!match) {
    throw invalidResponse();
  }
  const total = Number(match[4]);
  if (!Number.isSafeInteger(total)) {
    throw invalidResponse();
  }
  if (total > MAX_CATALOG_PRODUCTS) {
    throw oversizedCatalog();
  }
  if (
    rowCount !== total
    || (total === 0 ? match[3] !== '*' : Number(match[1]) !== 0 || Number(match[2]) !== total - 1)
  ) {
    throw invalidResponse();
  }
}

export async function loadCatalog(
  config: CatalogConfig,
  options: { signal?: AbortSignal; fetch?: typeof globalThis.fetch } = {},
): Promise<readonly CatalogProduct[]> {
  const checked = readCatalogConfig(config.url, config.publishableKey);
  if (!checked) {
    throw new CatalogError('상품 서버 주소와 공개 키를 함께 설정해 주세요.');
  }
  if (options.signal?.aborted) {
    throw cancelledRequest();
  }

  const controller = new AbortController();
  let rejectStop: (reason: CatalogError) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const stop = (error: CatalogError) => {
    if (controller.signal.aborted) return;
    // 취소를 먼저 확정해 fetch가 반환하는 기기별 오류나 원래 취소 사유가 사용자에게 드러나지 않게 합니다.
    rejectStop(error);
    controller.abort();
  };
  const onAbort = () => stop(cancelledRequest());
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    stop(new CatalogError('상품 목록을 기다리는 시간이 길어졌어요. 다시 시도해 주세요.'));
  }, CATALOG_TIMEOUT_MS);
  let completed = false;

  try {
    const request = async () => {
      const response = await (options.fetch ?? globalThis.fetch)(
        checked.url + '/rest/v1/play_catalog?select=' + selectedColumns
          + '&order=sort_order.asc,id.asc&limit=' + MAX_CATALOG_PRODUCTS,
        {
          method: 'GET',
          headers: {
            apikey: checked.publishableKey,
            Accept: 'application/json',
            Prefer: 'count=exact',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new CatalogError(response.status === 401 || response.status === 403
          ? '상품 목록에 연결할 권한을 확인해 주세요.'
          : '상품 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw invalidResponse();
      }
      const products = parseCatalogRows(data);
      // 서버의 행 제한 때문에 일부만 내려온 목록을 전체 목록처럼 보여 주지 않습니다.
      verifyCompleteRange(response.headers.get('Content-Range'), products.length);
      return products;
    };

    // 응답 본문을 읽는 동안에도 제한 시간을 적용하고, 취소를 지원하지 않는 테스트 fetch에도 종료를 보장합니다.
    const result = await Promise.race([request(), stopped]);
    completed = true;
    return result;
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    // 네트워크 오류에는 URL·헤더·응답이 들어갈 수 있어 외부 오류를 그대로 전달하지 않습니다.
    throw new CatalogError('상품 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    if (!completed) controller.abort();
  }
}
