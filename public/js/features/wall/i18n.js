// WP-19 방명록 모아보기 문구 — 키는 전부 'wall_' 로 시작 (02 §1)
const D = {
  ko: {
    wall_hub: '다른 하객 방명록 보기',            // the hub row draws its 💌 icon itself
    wall_title: '💌 하객 방명록',
    wall_count: '{n}명이 마음을 남겼어요',
    wall_privacy: '이름·캐릭터·메시지만 보여요. 사진과 음성은 신랑·신부만 봐요.',
    wall_f_all: '전체', wall_f_groom: '신랑측', wall_f_bride: '신부측', wall_f_both: '양가',
    wall_me: '나',
    wall_priv: '💌 신랑·신부에게만 남긴 메시지예요',
    wall_voice: '🎤 음성 메시지를 남겼어요',
    wall_loading: '불러오는 중…',
    wall_empty: '아직 여기에 남긴 방명록이 없어요',
    wall_error: '불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.',
    wall_retry: '↻ 다시 불러오기',
    wall_back: '← 돌아가기',
    wall_action: '방명록',
    wall_sheet_one: '💌 방명록',
  },
  en: {
    wall_hub: 'Read the other guests\' messages',
    wall_title: '💌 Guestbook',
    wall_count: '{n} guests left a message',
    wall_privacy: 'Only names, characters and messages are shown. Photos and voice messages are for the couple only.',
    wall_f_all: 'All', wall_f_groom: 'Groom', wall_f_bride: 'Bride', wall_f_both: 'Both',
    wall_me: 'Me',
    wall_priv: '💌 A private note for the couple',
    wall_voice: '🎤 Left a voice message',
    wall_loading: 'Loading…',
    wall_empty: 'No messages here yet',
    wall_error: 'Couldn\'t load the guestbook. Check your connection and tap to try again.',
    wall_retry: '↻ Try again',
    wall_back: '← Back',
    wall_action: 'Guestbook',
    wall_sheet_one: '💌 Guestbook',
  },
};
export default D;
