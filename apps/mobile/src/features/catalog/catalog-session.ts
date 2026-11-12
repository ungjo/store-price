import type { CatalogProduct } from './catalog.ts';

export type CatalogSource = 'supabase' | 'sample';
export type CatalogState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; products: readonly CatalogProduct[]; source: CatalogSource }>
  | Readonly<{ status: 'empty' | 'error' | 'unconfigured' }>;

export const INITIAL_CATALOG_STATE: CatalogState = Object.freeze({ status: 'loading' });

type CatalogReader = (signal: AbortSignal) => Promise<readonly CatalogProduct[] | null>;
type CatalogListener = (state: CatalogState) => void;

export function createCatalogSession({ read, samples }: {
  read: CatalogReader;
  samples: readonly CatalogProduct[];
}) {
  let listener: CatalogListener | null = null;
  let choice: CatalogSource = 'supabase';
  let controller: AbortController | null = null;
  let requestVersion = 0;
  let connectionVersion = 0;

  const publish = (next: CatalogState) => {
    listener?.(next);
  };

  const cancelRequest = () => {
    // abort를 무시하는 늦은 응답도 버리도록 요청 번호를 먼저 바꾼 뒤 통신을 취소합니다.
    requestVersion += 1;
    const previous = controller;
    controller = null;
    previous?.abort();
  };

  const reload = () => {
    choice = 'supabase';
    cancelRequest();
    publish(INITIAL_CATALOG_STATE);
    // 화면을 떠난 뒤 남은 이벤트가 실행돼도 새 통신이나 화면 갱신을 시작하지 않습니다.
    if (!listener) return;

    const current = new AbortController();
    controller = current;
    const version = requestVersion;
    const isCurrent = () => listener !== null && choice === 'supabase'
      && version === requestVersion && !current.signal.aborted;

    async function receive() {
      try {
        const products = await read(current.signal);
        if (!isCurrent()) return;
        publish(products === null ? { status: 'unconfigured' }
          : products.length ? { status: 'ready', products, source: 'supabase' }
            : { status: 'empty' });
      } catch {
        if (isCurrent()) publish({ status: 'error' });
      } finally {
        if (controller === current) controller = null;
      }
    }

    void receive();
  };

  const useSamples = () => {
    // 네트워크 응답보다 아이가 고른 놀이를 우선하며, 전환 뒤 가격과 장바구니가 바뀌지 않게 합니다.
    choice = 'sample';
    cancelRequest();
    publish({ status: 'ready', products: samples, source: 'sample' });
  };

  const connect = (nextListener: CatalogListener) => {
    const connection = ++connectionVersion;
    listener = nextListener;
    if (choice === 'sample') publish({ status: 'ready', products: samples, source: 'sample' });
    else reload();

    return () => {
      // StrictMode의 연결→정리→재연결에서도 이전 정리가 새 요청을 취소하지 않습니다.
      if (connection !== connectionVersion) return;
      listener = null;
      cancelRequest();
    };
  };

  return { connect, reload, useSamples };
}
