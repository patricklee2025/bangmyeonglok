// ============================================================
//  웨딩 픽셀 마을 방명록 — 설정 파일
//  이 파일만 수정하면 됩니다. (README.md 참고)
// ============================================================

export const CONFIG = {
  // ---- 신랑 · 신부 ----------------------------------------
  couple: {
    groom: { ko: '지환', en: 'Patrick' },
    bride: { ko: '선경', en: 'Sunkyung' },
    date: '2027.04.10',  // 비워두면 표시 안 함
    venue: '',           // 첫 화면 날짜 옆 짧은 장소 (예: 'Orlando, FL'). 비워두면 표시 안 함
    venueName: '',       // 식장 이름 (입장권·캘린더) — 정해지면 입력
    venueAddress: '2700 Weston Ln, Orlando, FL 32810',   // 식장 주소 (입장권·캘린더 .ics)
  },

  // 신랑 · 신부 아바타 (팔레트 인덱스는 js/avatar.js 참고)
  groomAvatar: { skin: 2, hair: 0, hairStyle: 'sidepart', outfit: 'suit',  color: 0,  acc: 'boutonniere' },
  brideAvatar: { skin: 1, hair: 0, hairStyle: 'bun',      outfit: 'dress', color: 3,  acc: 'veil' },

  defaultLang: 'ko',     // 'ko' | 'en'

  // 하객이 고를 수 있는 마을 활동
  activities: ['walk', 'dance', 'fish', 'chat', 'eat', 'photo'],

  // ---- 마을 화면 -------------------------------------------
  // 'auto' = 저녁 7시 이후 밤 모드 / 'sunset' / 'night'
  timeOfDay: 'auto',
  // TV 화면 QR 코드가 가리킬 주소. 비워두면 현재 사이트 주소(/) 사용
  guestUrl: '',

  // ---- 사진 ------------------------------------------------
  photoMaxSide: 720,     // 원본 사진 저장 해상도(px). Firestore 문서 1MB 제한 때문에 720 이하 권장
  photoQuality: 0.78,

  // ---- 음성 메시지 · 타임캡슐 · 하객 스냅 --------------------
  voiceMaxSec: 15,                 // 음성 축하 메시지 최대 길이(초)
  capsuleOpen: '2028-04-10',       // 1주년 타임캡슐 공개일 — firestore.rules 의 timestamp.date(2028, 4, 10) 와 같게
  snapLimitPerGuest: 5,            // 하객 1명이 올릴 수 있는 스냅 사진 수
  snapMaxSide: 1280,               // 스냅 사진 저장 해상도(px)
  snapApproval: false,             // true = 관리자가 승인해야 TV에 표시 (firestore.rules 도 함께 수정)

  // ---- Firebase -------------------------------------------
  // 비워두면 "데모 모드"로 동작합니다 (같은 브라우저 안에서만 데이터 공유).
  firebase: {
    apiKey: 'AIzaSyBl2EJCzrCCJec-qqHWBmLvy-KhrULU2tY',
    authDomain: 'wedding-guestbook-48c8c.firebaseapp.com',
    projectId: 'wedding-guestbook-48c8c',
    appId: '1:117248172236:web:76f5518acc0aca144ee269',
  },
  // 관리자 페이지(admin.html) 로그인 허용 Google 계정 — firestore.rules 에도 동일하게 입력
  adminEmails: ['jihwan.patrick.lee@gmail.com', 'sunkyung0212@gmail.com'],

  // ---- v4 일정 (페이즈 계산: 결혼식 전 → 당일 → 후 → 기념일) --------
  schedule: {
    weddingDate: '2027-04-10',  // 식장 현지 날짜 (couple.date 와 같은 날)
    utcOffset: '-04:00',        // 올랜도 4월 = EDT
    liveStartHour: 6,           // 당일 06:00 ~ 다음날 06:00 = live
    liveHours: 24,
    anniversaryDays: 7,         // 매년 기념일 00:00부터 7일 = anniversary
  },
  // ---- v4 아카이브 (WP-14가 켬) ------------------------------------
  archive: null,                // 예: { url: 'archive/data.json' } → 읽기 전용 아카이브 모드
};

// ?demo=1 → 리허설/테스트용 데모 모드 (Firebase에 기록하지 않음, 이 브라우저 안에서만 저장)
// ?demo=0 → 이 탭의 데모 모드 해제 (리허설에 쓴 키오스크 탭을 실제 모드로 되돌릴 때)
const demoParam = (() => { try { return new URLSearchParams(location.search).get('demo'); } catch { return null; } })();
try { if (demoParam === '0') sessionStorage.removeItem('wgb_demo'); } catch {}
const forceDemo = (() => { try { return demoParam === '1' || (demoParam !== '0' && sessionStorage.getItem('wgb_demo') === '1'); } catch { return false; } })();
try { if (forceDemo) sessionStorage.setItem('wgb_demo', '1'); } catch {}
export const DEMO = !CONFIG.firebase.apiKey || forceDemo;

// 마을 레벨: 하객 수가 기준을 넘을 때마다 레벨업 + 새 장식 해금
export const LEVELS = [
  { at: 5,  ko: '스트링 라이트 점등', en: 'String lights on' },
  { at: 10, ko: '분수대 완공', en: 'Fountain built' },
  { at: 20, ko: '꽃길 아치', en: 'Flower arches' },
  { at: 30, ko: '囍 현수막 & 불꽃놀이', en: 'Banner & fireworks' },
  { at: 40, ko: '강아지·고양이 친구', en: 'Puppy & kitty friends' },
  { at: 50, ko: '무지개', en: 'Rainbow' },
];
