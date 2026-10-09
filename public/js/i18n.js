import { CONFIG } from './config.js';

const D = {
  ko: {
    title: '픽셀 마을 방명록',
    welcome_sub: '방명록을 남기면 나만의 픽셀 캐릭터가\n두 사람의 마을에 놀러 가요!',
    start: '방명록 남기기',
    already: '이미 방명록을 남기셨어요. 한 번 더 남길 수도 있어요!',
    step_info: '1 / 4 · 방명록',
    name: '이름', name_ph: '이름을 입력해주세요',
    side: '누구의 하객이신가요?', side_groom: '신랑측', side_bride: '신부측', side_both: '둘 다!',
    message: '축하 메시지', message_ph: '두 사람에게 따뜻한 한마디를 남겨주세요',
    next: '다음', back: '이전',
    step_photo: '2 / 4 · 사진 찍기',
    photo_guide: '얼굴을 동그라미 안에 맞춰주세요',
    photo_tip: '얼굴형·헤어·표정·수염·안경·옷까지 분석해서 픽셀 캐릭터로 만들어드려요 (사진은 폰 안에서만 분석돼요)',
    capture: '찰칵!', retake: '다시 찍기', use_photo: '이 사진으로 만들기',
    upload: '앨범에서 선택', skip_photo: '사진 없이 직접 만들기',
    keep_photo: '신랑·신부에게 사진도 전달할게요 (두 사람만 볼 수 있어요)',
    camera_denied: '카메라를 사용할 수 없어요. 앨범에서 선택하거나 사진 없이 진행해주세요.',
    step_custom: '3 / 4 · 캐릭터 꾸미기',
    step_act: '4 / 4 · 마을 활동',
    simple_start: '간편하게 남기기 (큰 글씨)',
    voice_title: '🎤 음성으로도 축하해주세요 (선택)', voice_sub: `최대 ${CONFIG.voiceMaxSec}초 · 신랑·신부만 들을 수 있어요`, voice_too_long: '녹음이 너무 길어요. 조금 짧게 다시 녹음해주세요.',
    voice_rec: '녹음', voice_stop: '정지', voice_play: '듣기', voice_saved: '녹음 완료!', voice_denied: '마이크를 사용할 수 없어요. 글로 남겨주세요.',
    voice_only_ok: '글 대신 음성만 남겨도 괜찮아요',
    capsule_title: '1년 뒤 두 사람에게 (타임캡슐, 선택)', capsule_sub: '결혼 1주년에 공개돼요. 그 전에는 신랑·신부도 열어볼 수 없어요.', capsule_ph: '1년 뒤의 두 사람에게 하고 싶은 말',
    simple_enter: '이대로 입장하기!', voice_msg: '🎤 음성 메시지를 남겼어요',
    priv_label: '💌 신랑·신부에게만 보여주기 (다른 하객과 TV에는 안 보여요)', priv_msg: '💌 신랑·신부에게 마음을 전했어요',
    snap_title: '📷 오늘의 사진 올리기', snap_sub: '찍은 사진을 올리면 TV 마을 포토월에 나와요', snap_pick: '사진 고르기', snap_caption_ph: '한 줄 설명 (선택)',
    snap_left: '장 더 올릴 수 있어요', snap_done: '올렸어요! TV를 확인해보세요', snap_full: '사진을 모두 올렸어요. 고마워요!', snap_uploading: '올리는 중',
    snap_shoot: '📸 지금 찍기', snap_album: '🖼 앨범에서 (여러 장)', snap_count: '{n}장 올렸어요', snap_retry: '다시', snap_failed: '못 올린 사진이 있어요. 사진을 눌러 다시 시도해주세요.',
    snap_queued: '인터넷이 느려서 연결되면 자동으로 올라가요. 이 창을 열어두세요.', snap_limit_note: '1명당 최대 {max}장까지 올릴 수 있어요',
    snap_need_guest: '방명록을 남기면 사진도 올릴 수 있어요!', snap_btn: '사진', snap_here: '📷 사진도 올려요', sign_cta: '✍️ 방명록 남기고 마을에 들어가기',
    my_snap: '📷 사진 올리기', back_village: '🏡 다시 마을로', close: '닫기', snap_shared: '📷 TV 포토월로 보냈어요!', to_village: '🏡 마을로 가기',
    handoff_title: '📱 내 폰으로 이어하기', handoff_sub: '폰 카메라로 찍으면 사진 올리기와 리모컨을 내 폰에서 쓸 수 있어요',

    act_title: '마을에서 뭐 하고 놀까요?',
    act_walk: '산책', act_walk_d: '마을 곳곳을 구경해요',
    act_dance: '댄스', act_dance_d: '무대에서 신나게 춤춰요',
    act_fish: '낚시', act_fish_d: '호수에서 월척을 노려요',
    act_chat: '수다', act_chat_d: '분수대에서 이야기꽃',
    act_eat: '먹방', act_eat_d: '잔칫상 앞을 지켜요',
    act_photo: '사진사', act_photo_d: '신랑신부를 찰칵찰칵',
    analyzing: '사진 분석 중...', analyzed: '이런 특징을 찾았어요!', no_face: '얼굴을 찾지 못해서 색만 가져왔어요. 직접 꾸며주세요!',
    to_custom: '이 캐릭터로 꾸미기',
    tab_face: '얼굴', tab_hair: '헤어', tab_outfit: '옷', tab_acc: '소품',
    tab_pick: '✨ 추천', pick_title: '마음에 드는 모습을 골라보세요 — 고른 뒤 다른 탭에서 더 꾸밀 수 있어요', pick_photo: '사진을 바탕으로 만든 4가지 스타일이에요 — 골라서 더 꾸며보세요',
    pick_more: '🎲 다른 추천', pick_as_is: '그대로', pick_hanbok: '한복', pick_formal: '차려입기', pick_casual: '캐주얼', pick_n: '추천 {n}',
    face: '얼굴형', eyes: '눈', brows: '눈썹', mouth: '입', beard: '수염', glasses: '안경', bangs: '앞머리', length: '머리 길이', color2: '포인트 색',
    my_photo: '내 사진',
    remote_title: '🎮 TV 속 내 캐릭터 움직이기', remote_sub: '버튼을 누르면 TV 속 내 캐릭터가 반응해요!',
    em_heart: '하트', em_clap: '박수', em_dance: '춤', em_jump: '점프', em_greet: '인사하러 가기',
    sent: '보냈어요!', open_remote: '🎮 내 캐릭터 움직이기',

    skin: '피부', hair: '머리색', hairStyle: '헤어', outfit: '옷', color: '옷 색', acc: '소품',
    random: '랜덤', submit: '마을에 입장하기!',
    sending: '마을로 가는 중...',
    done_title: '마을에 도착했어요!',
    done_sub: '화면 속 마을에서 내 캐릭터를 찾아보세요',
    done_queued: '인터넷이 느려서 전송을 기다리는 중이에요. 이 화면을 닫지 말고 잠시만 기다려주세요.',
    view_village: '마을에서 내 캐릭터 보기', again: '처음으로', reset_in: '초 후 처음 화면으로',
    error: '전송에 실패했어요. 다시 시도해주세요.',
    villagers: '주민', arrived: '님이 마을에 도착했어요!', sign_here: '방명록 남기기',
    arrived_many: '🎉 {name}님 외 {n}명이 도착했어요!', quiet_chip: '본식 진행 중이에요', fa_more: '더보기',
    need_name: '이름과 메시지를 입력해주세요',
    need_msg: '메시지를 한 글자 이상 쓰거나 음성으로 남겨주세요', need_msg_name: '이름을 입력해주세요',
    step_info_s: '1 / 2 · 방명록', step_photo_s: '2 / 2 · 사진', skip_photo_simple: '사진 없이 바로 입장',
    camera_denied_simple: '카메라를 쓸 수 없어요. 아래 "사진 없이 바로 입장"을 눌러주세요.',
    photo_unsupported: '이 사진 형식은 열 수 없어요. 다른 사진을 골라주세요.', no_model: '사진 분석을 못 해서 색만 가져왔어요. 직접 꾸며주세요!',
    snap_bad: '열 수 없는 사진', snap_skipped: '사진이 아닌 파일은 건너뛰었어요', random_label: '랜덤으로 꾸미기',
    snap_inapp: '카카오톡 안에서는 사진이 잘 안 올라갈 수 있어요. 휴대폰 브라우저로 열면 더 잘 돼요.', snap_inapp_open: '🌐 브라우저로 열기',
    snap_inapp_other: '사진이 잘 안 올라가면 오른쪽 위 메뉴(⋯)에서 "브라우저로 열기"를 눌러 주세요.',
    done_sent: '전송 완료! 마을에 도착했어요', leave_warn: '아직 전송 중이에요',
  },
  en: {
    title: 'Pixel Village Guestbook',
    welcome_sub: 'Sign the guestbook and your own pixel character\nwill join the couple\'s village!',
    start: 'Sign the Guestbook',
    already: 'You\'ve already signed — feel free to sign again!',
    step_info: '1 / 4 · Guestbook',
    name: 'Name', name_ph: 'Your name',
    side: 'Whose guest are you?', side_groom: 'Groom', side_bride: 'Bride', side_both: 'Both!',
    message: 'Message', message_ph: 'Leave a warm note for the couple',
    next: 'Next', back: 'Back',
    step_photo: '2 / 4 · Take a photo',
    photo_guide: 'Fit your face inside the circle',
    photo_tip: 'We read your face shape, hair, smile, glasses & outfit to build your pixel twin (analyzed on your phone)',
    capture: 'Snap!', retake: 'Retake', use_photo: 'Use this photo',
    upload: 'Choose from album', skip_photo: 'Skip the photo',
    keep_photo: 'Also share my photo with the couple (only they can see it)',
    camera_denied: 'Camera unavailable. Choose a photo or skip.',
    step_custom: '3 / 4 · Customize',
    step_act: '4 / 4 · Activity',
    simple_start: 'Quick & easy (large text)',
    voice_title: '🎤 Add a voice message (optional)', voice_sub: `Up to ${CONFIG.voiceMaxSec} sec · only the couple can hear it`, voice_too_long: 'That recording is too long — please record a shorter one.',
    voice_rec: 'Record', voice_stop: 'Stop', voice_play: 'Play', voice_saved: 'Recorded!', voice_denied: 'Microphone unavailable. Please write a message instead.',
    voice_only_ok: 'A voice message alone is fine too',
    capsule_title: 'A note for 1 year later (time capsule, optional)', capsule_sub: 'Opens on their 1st anniversary — even the couple can\'t read it before then.', capsule_ph: 'Something to tell them a year from now',
    simple_enter: 'Enter the village!', voice_msg: '🎤 Left a voice message',
    priv_label: '💌 Only for the couple (hidden from other guests and the big screen)', priv_msg: '💌 Left a private note for the couple',
    snap_title: '📷 Share today\'s photos', snap_sub: 'Your photos appear on the village photo wall on the big screen', snap_pick: 'Choose photos', snap_caption_ph: 'Caption (optional)',
    snap_left: 'more you can add', snap_done: 'Uploaded! Check the big screen', snap_full: 'All photos shared. Thank you!', snap_uploading: 'Uploading',
    snap_shoot: '📸 Take one now', snap_album: '🖼 From album (multiple)', snap_count: '{n} shared', snap_retry: 'Retry', snap_failed: 'Some photos didn\'t upload — tap them to retry.',
    snap_queued: 'Slow connection — they\'ll upload automatically. Keep this page open.', snap_limit_note: 'Up to {max} photos per guest',
    snap_need_guest: 'Sign the guestbook to share photos too!', snap_btn: 'Photo', snap_here: '📷 Share photos', sign_cta: '✍️ Sign the guestbook & join the village',
    my_snap: '📷 Share photos', back_village: '🏡 Back to the village', close: 'Close', snap_shared: '📷 Sent to the photo wall!', to_village: '🏡 To the village',
    handoff_title: '📱 Continue on your phone', handoff_sub: 'Scan with your phone camera to share photos and use the remote',

    act_title: 'What will you do in the village?',
    act_walk: 'Stroll', act_walk_d: 'Wander around the village',
    act_dance: 'Dance', act_dance_d: 'Hit the dance floor',
    act_fish: 'Fishing', act_fish_d: 'Catch a big one at the lake',
    act_chat: 'Chat', act_chat_d: 'Gossip by the fountain',
    act_eat: 'Feast', act_eat_d: 'Guard the banquet table',
    act_photo: 'Photographer', act_photo_d: 'Snap the happy couple',
    analyzing: 'Analyzing photo...', analyzed: 'Here is what we found!', no_face: 'Couldn\'t find a face — colors only. Customize away!',
    to_custom: 'Customize this character',
    tab_face: 'Face', tab_hair: 'Hair', tab_outfit: 'Outfit', tab_acc: 'Extras',
    tab_pick: '✨ Picks', pick_title: 'Pick a look you like — then fine-tune it in the other tabs', pick_photo: 'Four styles based on your photo — pick one, then fine-tune it',
    pick_more: '🎲 More ideas', pick_as_is: 'As is', pick_hanbok: 'Hanbok', pick_formal: 'Dressed up', pick_casual: 'Casual', pick_n: 'Look {n}',
    face: 'Face shape', eyes: 'Eyes', brows: 'Brows', mouth: 'Mouth', beard: 'Beard', glasses: 'Glasses', bangs: 'Bangs', length: 'Length', color2: 'Accent',
    my_photo: 'My photo',
    remote_title: '🎮 Move your character on the big screen', remote_sub: 'Tap a button — your character reacts on the big screen!',
    em_heart: 'Heart', em_clap: 'Clap', em_dance: 'Dance', em_jump: 'Jump', em_greet: 'Go say hi',
    sent: 'Sent!', open_remote: '🎮 Move my character',

    skin: 'Skin', hair: 'Hair color', hairStyle: 'Hair', outfit: 'Outfit', color: 'Color', acc: 'Extra',
    random: 'Random', submit: 'Enter the village!',
    sending: 'Walking to the village...',
    done_title: 'You\'ve arrived!',
    done_sub: 'Find your character in the village on the big screen',
    done_queued: 'Slow connection — still sending. Please keep this page open for a moment.',
    view_village: 'See me in the village', again: 'Start over', reset_in: 's until reset',
    error: 'Something went wrong. Please try again.',
    villagers: 'Villagers', arrived: ' has arrived!', sign_here: 'Sign the guestbook',
    arrived_many: '🎉 {name} and {n} others arrived!', quiet_chip: 'Ceremony in progress', fa_more: 'More',
    need_name: 'Please enter your name and a message',
    need_msg: 'Write at least one character or leave a voice message', need_msg_name: 'Please enter your name',
    step_info_s: '1 / 2 · Guestbook', step_photo_s: '2 / 2 · Photo', skip_photo_simple: 'Enter without a photo',
    camera_denied_simple: 'Camera unavailable. Tap "Enter without a photo" below.',
    photo_unsupported: 'This photo format can\'t be opened. Please choose another one.', no_model: 'Couldn\'t analyze the photo — colors only. Customize away!',
    snap_bad: 'Can\'t open', snap_skipped: 'Skipped files that aren\'t photos', random_label: 'Random look',
    snap_inapp: 'Photo uploads can be unreliable inside KakaoTalk. Opening this page in your phone\'s browser works better.', snap_inapp_open: '🌐 Open in browser',
    snap_inapp_other: 'If photos don\'t upload, use the menu (⋯) at the top right → "Open in browser".',
    done_sent: 'Sent! You\'re in the village', leave_warn: 'Still sending',
  },
};

let lang = CONFIG.defaultLang;
try { lang = localStorage.getItem('wgb_lang') || lang; } catch {}
export const getLang = () => lang;
export function setLang(l) { lang = l; try { localStorage.setItem('wgb_lang', l); } catch {} applyI18n(); }

// ---- v4 확장 (docs/v4/02-contracts.md §4 · WP-00b §4.8) -----------------------------------------
//  · 기능 문구: addStrings(id, D) / removeStrings(id) — core/features.js 가 기능을 켜고 끌 때 부릅니다.
//  · 코어 문구 덮어쓰기: overrideStrings(id, D) — ctx.texts() 의 바탕. D = null 이면 그 기능의 덮어쓰기를 모두 해제.
//  · 조회 순서: 덮어쓰기(마지막 등록 우선, 현재 언어) → 코어 D[lang] → 기능 문구[lang] → 코어 D.ko → 기능 문구.ko → 키 그대로
//  · t(k, vars): vars 가 있으면 문구 속 '{n}' 을 치환. 기존 t(k) 호출은 그대로 동작합니다.
const featStrings = new Map();   // 기능 id → { ko:{…}, en:{…} }
const overrides = new Map();     // 기능 id → { ko:{…}, en:{…} }  (Map 은 삽입 순서 유지 → 뒤에 등록한 기능이 우선)
let featFlat = { ko: {}, en: {} }, overFlat = { ko: {}, en: {} };
const cleanDict = d => { const out = { ko: {}, en: {} }; for (const l of ['ko', 'en']) if (d && typeof d[l] === 'object' && d[l]) for (const [k, v] of Object.entries(d[l])) if (typeof v === 'string') out[l][k] = v; return out; };
const flatten = m => { const out = { ko: {}, en: {} }; for (const d of m.values()) for (const l of ['ko', 'en']) Object.assign(out[l], d[l]); return out; };
const own = (o, k) => { const v = o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; return typeof v === 'string' ? v : undefined; };
export function addStrings(id, dict) { featStrings.set(id, cleanDict(dict)); featFlat = flatten(featStrings); }
export function removeStrings(id) { if (featStrings.delete(id)) featFlat = flatten(featStrings); }
export function overrideStrings(id, dict) {
  overrides.delete(id);                              // 다시 부르면 이 기능의 덮어쓰기를 통째로 교체 (그리고 가장 최근 등록이 됨)
  if (dict) overrides.set(id, cleanDict(dict));
  overFlat = flatten(overrides);
}
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, n) => (Object.prototype.hasOwnProperty.call(vars, n) ? String(vars[n]) : m));
export const t = (k, vars) => {
  const s = own(overFlat[lang], k) ?? own(D[lang], k) ?? own(featFlat[lang], k) ?? own(D.ko, k) ?? own(featFlat.ko, k) ?? k;
  return vars ? fill(s, vars) : s;
};
export const coupleNames = (l = lang) => `${CONFIG.couple.groom[l]} ♥ ${CONFIG.couple.bride[l]}`;
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.documentElement.lang = lang;
}
