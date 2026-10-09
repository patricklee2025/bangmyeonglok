// ============================================================
//  tests/lib/v4.mjs — v4 기능 테스트 공용 도우미 (docs/v4/04-testing.md §4, WP-00b §6.1)
//
//  기능 스위트(tests/features/<id>.mjs)는 이것만으로 "켜기/끄기 · 핫 토글 · 흔적 0 · 데이터 확인"을 합니다.
//  모든 `page.evaluate` 는 자기완결이고, 페이지 안에서 진짜 모듈(/js/core/*.js)을 import 합니다 — 페이지가 이미 쓰는 것과 같은 모듈 인스턴스입니다.
//
//    h.url('village.html', { ff: on('poll') })                      // ?ff=poll
//    h.url('index.html',   { ff: ff(on('poll'), off('bgm')) })      // ?ff=poll,-bgm
//    const admin = await adminPage(h, context);                     // 같은 데모 세계의 관리자 페이지 (설정을 '관리자로서' 바꿀 때)
//    await setFlag(h, admin, 'poll', true);                         // app/settings.features.poll = true  (null = 기본값으로)
//    await expectClean(h, page, 'poll', 'S3 after off');            // [data-f] · <link data-f> · f-poll-* 클래스 0개
// ============================================================
import { addGuests } from './flows.mjs';

/** ?ff= 조각: on('poll','bingo') → 'poll,bingo' · off('bgm') → '-bgm' · ff(on('poll'), off('bgm')) → 'poll,-bgm' */
export const on = (...ids) => ids.join(',');
export const off = (...ids) => ids.map(id => '-' + id).join(',');
export const ff = (...parts) => parts.filter(Boolean).join(',');
/** ?ff= that turns on only these features and every other manifest feature off (ready features are on by default) —
 *  for checks about one feature's own place on a shared spot (the phone bar, the welcome slot …). _selftest is never touched. */
export async function only(...ids) {
  const { FEATURES } = await import('../../public/js/features/index.js');
  return ff(on(...ids), off(...FEATURES.map(f => f.id).filter(id => id[0] !== '_' && !ids.includes(id))));
}

/**
 * 같은 컨텍스트(= 같은 기기·같은 데모 세계)에 admin.html 을 열고 데모 로그인이 끝날 때까지 기다립니다.
 * ctx: h.context() 의 결과 또는 프리셋 이름. admin.html 은 body.admin 이라 데모 규칙 거울이 "관리자"로 취급합니다.
 */
export async function adminPage(h, ctx = 'desktop', { tag = 'admin', params = {} } = {}) {
  const p = await h.page(ctx, { tag });
  await p.goto(h.url('admin.html', params));
  await p.waitForSelector('#main:not([hidden])', { timeout: 15000 });
  return p;
}

/** 관리자 페이지 안에서 core/settings.js 의 도우미를 부릅니다 (관리자가 아니면 permission-denied 로 reject → 테스트가 실패). */
const viaSettings = (admin, fn, arg) => admin.evaluate(async ([src, a]) => (0, eval)('(' + src + ')')(await import('/js/core/settings.js'), a), [fn.toString(), arg ?? null]);

/** app/settings.features[id] 저장. on: true | false | null(= 기본값으로). 다른 페이지에는 BroadcastChannel 로 곧 전달됩니다 — 효과는 폴링으로 기다리세요. */
export const setFlag = (h, admin, id, on) => viaSettings(admin, (m, a) => m.setFeature(a.id, a.on), { id, on });
/** 본식 안전 모드 */
export const setSafe = (h, admin, on) => viaSettings(admin, (m, a) => m.setSafe(a), !!on);
/** 비상 페이즈 강제: 'auto' | 'pre' | 'live' | 'after' | 'anniversary' */
export const setPhase = (h, admin, phase) => viaSettings(admin, (m, a) => m.setPhaseOverride(a), phase);
/** app/live 병합 저장 (cue, cueSeq, quiet, poll, msg …). 값에 { $sv: 'ts' } / { $sv: 'inc', n } 를 넣으면 서버 시각 / 증가 */
export const setLive = (h, admin, patch) => viaSettings(admin, (m, a) => m.setLive(a), patch);
/** app/settings.cfg.<id> 병합 저장 */
export const setCfg = (h, admin, id, patch) => viaSettings(admin, (m, a) => m.saveCfg(a.id, a.patch), { id, patch });

/**
 * 한 기능이 남긴 흔적: nodes = [data-f="<id>"] (link 제외) · links = <link data-f="<id>"> · styles = 클래스에 `f-<id>-` 로 시작하는 것이 있는 요소 수 (<html> 포함).
 * 꺼진 기능은 셋 다 0 이어야 합니다 (02 §3 규칙 3, 04 §4.1 S1).
 */
export const footprint = (page, id) => page.evaluate(id => ({
  nodes: document.querySelectorAll(`[data-f="${id}"]:not(link)`).length,
  links: document.querySelectorAll(`link[data-f="${id}"]`).length,
  styles: [...new Set([document.documentElement, ...document.querySelectorAll('[class]')])].filter(e => [...e.classList].some(c => c.startsWith(`f-${id}-`))).length,
}), id);

/**
 * 매니페스트 기본값 체크 (ff 없이, 관리자 플래그 없이 연 페이지): status 'ready' + default → 켜져 있음(source 'default'),
 * 그 밖(beta 등) → 흔적 0. Patrick 이 기능을 ready 로 지정해도 S3 핫 토글 시험이 그대로 의미를 갖도록.
 */
export async function expectDefault(h, page, id, label = 'S3 default') {
  const { FEATURES } = await import('../../public/js/features/index.js');
  const e = FEATURES.find(f => f.id === id);
  if (e?.status === 'ready' && e.default) {
    let st = null;
    for (let i = 0; i < 40; i++) { st = await featureState(page, id).catch(() => null); if (st?.on) break; await page.waitForTimeout(150); }
    return h.check(`${label}: ready → on by default`, !!st?.on && st.source === 'default', JSON.stringify(st));
  }
  return expectClean(h, page, id, `${label}: ${e?.status || '?'} → off`);
}

/** 흔적 0 체크를 기록합니다 (기록된 FAIL 에 어떤 흔적이 남았는지 함께 표시) */
export async function expectClean(h, page, id, label) {
  const f = await footprint(page, id);
  return h.check(`${label}: no trace of "${id}" (nodes ${f.nodes} · links ${f.links} · classes ${f.styles})`, f.nodes + f.links + f.styles === 0, JSON.stringify(f));
}

/** 페이지 안에서 docdb 호출 (검증용 — 규칙 거울이 그대로 적용되므로 페이지가 하객이면 하객 권한). */
const viaDb = (page, fn, arg) => page.evaluate(async ([src, a]) => (0, eval)('(' + src + ')')(await (await import('/js/core/docdb.js')).getDB(), a), [fn.toString(), arg ?? null]);
export const dbGet = (h, page, path) => viaDb(page, (db, p) => db.doc(p).get(), path);
/** data 안의 { $sv: 'ts' } / { $sv: 'inc', n } 는 서버 시각 / 증가. 오류는 { error: code } 로 돌려줍니다 (거부 사례 검사용) */
export const dbSet = (h, page, path, data, opts) => viaDb(page, async (db, a) => {
  try { await db.doc(a.path).set(a.data, a.opts); return { ok: true }; } catch (e) { return { ok: false, error: e?.code || String(e?.message || e) }; }
}, { path, data, opts });
/** q = { where: [[field, op, value], …], orderBy: [field, dir], limit } */
export const dbCol = (h, page, name, q = {}) => viaDb(page, async (db, a) => {
  let c = db.col(a.name);
  for (const [f, op, v] of a.q.where || []) c = c.where(f, op, v);
  if (a.q.orderBy) c = c.orderBy(...a.q.orderBy);
  if (a.q.limit) c = c.limit(a.q.limit);
  return c.get();
}, { name, q });

/** 데모 하객 n명을 만들고 각자의 4글자 하객 코드를 함께 돌려줍니다: [{ id, code }] */
export async function guestsWithCodes(h, page, n, prefix = '하객') {
  const ids = await addGuests(h, page, n, prefix);
  const codes = await page.evaluate(async ids => { const { guestCode } = await import('/js/core/ui.js'); return ids.map(id => guestCode(id)); }, ids);
  return ids.map((id, i) => ({ id, code: codes[i] }));
}

/** 이 페이지의 로더 상태 전체 (core/features.featureStates) / 한 기능만. 부팅 전이면 [] / null */
export const featureStates = page => page.evaluate(async () => (await import('/js/core/features.js')).featureStates());
export const featureState = async (page, id) => (await featureStates(page)).find(s => s.id === id) || null;

/**
 * WP-00b 시점 도우미: 아직 페이지가 기능을 부팅하지 않으므로, 빈 페이지(또는 아무 페이지) 안에서 bootFeatures(pageName, 가짜 페이지 API) 를 직접 부릅니다.
 * 가짜 API: forFeature(scope) 는 { guest | v | admin: { id } } 를 돌려주고 scope 를 window.__stub.scopes[id] 에 보관, refreshTexts 는 호출 횟수를 셉니다 (window.__stub.refresh).
 * 켜진 기능 id 목록을 돌려줍니다. opts 는 JSON 으로 전달되는 값만 (readyTimeoutMs 등).
 */
export function bootStub(h, page, pageName = 'guest', opts = {}) {
  return page.evaluate(async ([pageName, opts]) => {
    const F = await import('/js/core/features.js');
    const key = pageName === 'village' ? 'v' : pageName === 'admin' ? 'admin' : 'guest';
    const stub = window.__stub = { refresh: 0, scopes: {}, pageName };
    await F.bootFeatures(pageName, {
      forFeature: scope => { stub.scopes[scope.id] = scope; return { [key]: { id: scope.id } }; },
      refreshTexts: () => { stub.refresh++; },
    }, opts);
    return F.featureStates().filter(s => s.on).map(s => s.id);
  }, [pageName, opts]);
}

/**
 * 코어 시험용 격리: 기본으로 켜지는 진짜 기능(status ready · beta — wall, tv, prereg …)을 이 스위트의 페이지에서는 `planned`로 보이게 합니다
 * (= ?ff= 로 부를 때만 켜짐). core-extension · core-units-loader 처럼 "_selftest 하나만 있는 세상"을 가정하는 코어 시험이 씁니다.
 * isolateManifest(body) = 매니페스트 소스 변환 · coreOnly(h) = 이 스위트의 h.page 가 만드는 모든 페이지에 적용.
 */
export const isolateManifest = body => body.replace(/status:\s*'(?:ready|beta)'/g, "status: 'planned'");
export function coreOnly(h) {
  const page = h.page.bind(h);
  h.page = async (...a) => {
    const p = await page(...a);
    await p.route('**/js/features/index.js', async route => { const res = await route.fetch(); await route.fulfill({ response: res, body: isolateManifest(await res.text()) }); });
    return p;
  };
}
