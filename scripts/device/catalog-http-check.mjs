import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { StringDecoder } from 'node:string_decoder';

import { readCatalogConfig, loadCatalog } from '../../apps/mobile/src/features/catalog/catalog.ts';
import { sampleProducts } from '../../apps/mobile/src/data/sample-products.ts';

const configKeys = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const envFiles = ['.env.development.local', '.env.local', '.env.development', '.env'];
const privateStates = new WeakMap();
const hash = (value) => createHash('sha256').update(value).digest('hex');

function readInputs(mobileRoot, env) {
  const values = {};
  const files = envFiles.map((name) => {
    let content;
    try {
      const file = path.join(mobileRoot, name);
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65_536) throw new Error('unsupported-env-file');
      content = readFileSync(file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [name, null];
      throw new Error('앱 환경 파일을 안전하게 읽지 못했습니다. 일반 UTF-8 설정 파일인지 확인해 주세요.');
    }
    // Expo 개발 모드의 우선순위로 첫 값을 선택하고, export도 같은 값으로 고정합니다.
    for (const [key, value] of Object.entries(parseEnv(content))) {
      if (configKeys.includes(key) && !Object.hasOwn(values, key)) values[key] = value;
    }
    return [name, hash(content)];
  });
  const processValues = configKeys.map((key) => [key, env[key] ?? null]);
  for (const [key, value] of processValues) if (value !== null) values[key] = value;
  return { values, fingerprint: hash(JSON.stringify({ files, processValues })) };
}

function details(state) {
  const value = privateStates.get(state);
  if (!value) throw new Error('현재 실행에서 확인한 카탈로그 설정이 필요합니다.');
  return value;
}

export function captureCatalogEnvironment(mobileRoot, env = process.env) {
  const root = path.resolve(mobileRoot);
  const inputs = readInputs(root, env);
  let config;
  try { config = readCatalogConfig(inputs.values[configKeys[0]], inputs.values[configKeys[1]]); }
  catch { throw new Error('Supabase 공개 설정 형식이 올바르지 않습니다. 프로젝트 URL과 publishable 키를 확인해 주세요.'); }
  if (!config) throw new Error('실기기 원격 검사를 위해 apps/mobile/.env.local에 Supabase URL과 publishable 키를 설정해 주세요.');
  // 외부에 넘기는 상태를 직렬화해도 키가 나오지 않도록 실제 설정은 WeakMap에만 둡니다.
  const state = Object.freeze({ fingerprint: inputs.fingerprint });
  privateStates.set(state, { root, config: Object.freeze({ ...config }) });
  return state;
}

export function assertCatalogEnvironmentUnchanged(state, env = process.env) {
  if (readInputs(details(state).root, env).fingerprint !== state.fingerprint) {
    throw new Error('검사 중 Supabase 설정 또는 환경 파일이 바뀌었습니다. 다시 검사해야 합니다.');
  }
}

export function pinnedCatalogEnvironment(state, baseEnv, runId = '') {
  const { config } = details(state);
  const pinned = {
    ...baseEnv,
    EXPO_PUBLIC_SUPABASE_URL: config.url,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_DEVICE_RUN_ID: runId,
  };
  // 호출한 셸의 비활성화 옵션 때문에 앱에 공개 설정이 빠지지 않게 합니다.
  delete pinned.EXPO_NO_CLIENT_ENV_VARS;
  // 일반 검사·배포·Expo 실행에 개발용 실제 자료 설정이 상속되지 않게 기본값에서 제거합니다.
  delete pinned.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW;
  delete pinned.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN;
  return pinned;
}

export function catalogProjectRef(state) {
  return new URL(details(state).config.url).hostname.split('.')[0];
}

export function redactCatalogText(state, text) {
  const key = state ? details(state).config.publishableKey : null;
  return key ? String(text).replaceAll(key, '<supabase-publishable-key>') : String(text);
}

export function createCatalogLogWriter(state, write) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const flushLines = () => {
    const end = pending.lastIndexOf('\n') + 1;
    if (end) { write(redactCatalogText(state, pending.slice(0, end))); pending = pending.slice(end); }
  };
  // 키가 여러 stdout 청크에 나뉘어도 원문이 로그에 저장되지 않도록 줄 단위로 정제합니다.
  return {
    write(chunk) { pending += decoder.write(chunk); flushLines(); },
    end() { pending += decoder.end(); write(redactCatalogText(state, pending)); pending = ''; },
  };
}

function fixtureFields(product) {
  const { id, name, unit, priceKrw, emoji, color, isSample } = product;
  return { id, name, unit, priceKrw, emoji, color, isSample };
}

async function assertReadDenied(config, fetchImpl, endpoint, profile, allowed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(config.url + endpoint, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { apikey: config.publishableKey, 'Accept-Profile': profile, Accept: 'application/json' },
    });
    // 응답 본문이나 키를 오류에 넣지 않습니다. 알려진 접근 거부만 성공으로 인정합니다.
    const body = await response.json();
    if (!allowed.some(([status, code]) => response.status === status && body?.code === code)) {
      throw new Error('unexpected-access-result');
    }
  } catch { throw new Error('카탈로그의 비공개 읽기 차단을 확인하지 못했습니다. HTTP 설정과 권한을 확인해 주세요.'); }
  finally { clearTimeout(timer); }
}

export async function checkCatalogHttp(state, { fetch: fetchImpl = globalThis.fetch, previous } = {}) {
  const { config } = details(state);
  let products;
  try { products = await loadCatalog(config, { fetch: fetchImpl }); }
  catch { throw new Error('Supabase 공개 상품 GET을 확인하지 못했습니다. 연결과 공개 읽기 설정을 확인해 주세요.'); }
  if (JSON.stringify(products.map(fixtureFields)) !== JSON.stringify(sampleProducts.map(fixtureFields))) {
    throw new Error('공개 상품이 실기기 회귀 검사에 필요한 예시 6개의 이름·단위·가격·표시 정보와 다릅니다.');
  }
  await assertReadDenied(config, fetchImpl, '/rest/v1/price_observations?select=id&limit=1', 'catalog_private', [
    [406, 'PGRST106'], [401, '42501'], [403, '42501'],
  ]);
  await assertReadDenied(config, fetchImpl, '/rest/v1/play_catalog?select=approval_notes&limit=1', 'public', [
    [400, '42703'], [400, 'PGRST204'], [401, '42501'], [403, '42501'],
  ]);
  const fingerprint = hash(JSON.stringify(products));
  if (previous && previous.fingerprint !== fingerprint) {
    throw new Error('검사 전후 Supabase 상품 또는 가격 관측이 달라졌습니다. 최신 상품으로 다시 검사해야 합니다.');
  }
  return Object.freeze({
    productCount: products.length, projectHost: new URL(config.url).host, fingerprint,
    privateSchemaBlocked: true, approvalNotesBlocked: true,
  });
}
