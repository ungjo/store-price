import type { CatalogProduct } from './catalog.ts';

export type CatalogDeviceFixtureState = Readonly<{ requests: number; lateResponse: boolean }>;
export const INITIAL_CATALOG_DEVICE_STATE: CatalogDeviceFixtureState = Object.freeze({ requests: 0, lateResponse: false });

export function isCatalogDeviceFixtureEnabled({ development, runId, scenario }: {
  development: boolean;
  runId: string | undefined;
  scenario: string | undefined;
}): boolean {
  return development && typeof runId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(runId)
    && scenario === 'pending-choice';
}

/** 개발용 실기기 검사에서만 사용합니다. 실제 통신 차단이나 외부 가격 자료를 만들지 않습니다. */
export function createCatalogDeviceFixture(products: readonly CatalogProduct[]) {
  let state = INITIAL_CATALOG_DEVICE_STATE;
  const listeners = new Set<(state: CatalogDeviceFixtureState) => void>();
  const publish = (next: CatalogDeviceFixtureState) => {
    state = Object.freeze(next);
    for (const listener of listeners) listener(state);
  };

  const read = (signal: AbortSignal): Promise<readonly CatalogProduct[]> => {
    const request = state.requests + 1;
    publish({ requests: request, lateResponse: false });
    return new Promise((resolve) => {
      let delivered = false;
      const deliverLate = () => {
        if (delivered) return;
        delivered = true;
        // 취소를 일부러 무시한 늦은 성공으로, 사용자가 고른 예시 놀이가 유지되는지 검사합니다.
        queueMicrotask(() => {
          resolve(products);
          queueMicrotask(() => {
            // StrictMode에서 버린 이전 요청의 완료를 현재 요청의 검사 결과로 오인하지 않습니다.
            if (state.requests === request) publish({ requests: request, lateResponse: true });
          });
        });
      };
      if (signal.aborted) deliverLate();
      else signal.addEventListener('abort', deliverLate, { once: true });
    });
  };

  const subscribe = (listener: (state: CatalogDeviceFixtureState) => void) => {
    listeners.add(listener);
    listener(state);
    // 화면 정리 때 먼저 구독을 끊으면 대기 중인 microtask도 React 상태를 갱신하지 않습니다.
    return () => { listeners.delete(listener); };
  };

  return { read, subscribe };
}
