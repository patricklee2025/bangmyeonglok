// ============================================================
//  WP-07 곡 데이터 — MML 비슷한 텍스트 (문법은 mml.js). 공개 저작물은 유명한 첫 주제만 짧게, 나머지는 자작 루프.
//  bar = 한 마디의 박 수 ('|' 사이 길이 — 시험 A7 이 채널마다 확인). 채널 4개의 길이는 모두 같아야 합니다.
// ============================================================
const J = a => a.join(' | ');

const MORNING = {
  id: 'morning', title: { ko: '마을의 아침', en: 'Village Morning' }, bpm: 104, bar: 4, loop: true, src: 'original',
  p1: 'o5 l8 ' + J(['e g a g e4 d4', 'c d e g e4 r4', 'f a >c< a g4 e4', 'd e d c d4 r4', 'e g a g e4 d4', 'c d e g a4 e4', 'f e d c d e f g', 'e2 c4 r4',
    'f a >c< a g e c e', 'g f e d e4 c4', 'd e f a g f e d', 'd4 g4 b4 g4', 'e g a g e4 d4', 'c d e g a4 >c4<', 'a g f e d e g f', 'e2 c4 r4']),
  p2: 'o4 l2 ' + J(['e g', 'e g', 'f a', 'g b', 'e g', 'e a', 'a b', 'g e', 'a >c<', 'g e', 'f a', 'g b', 'e g', 'e a', 'a b', 'g e']),
  tri: 'o3 l4 ' + J(['c g c g', 'c g c g', 'f >c< f >c<', 'g >d< g >d<', 'c g c g', 'a >e< a >e<', 'f >c< g >d<', 'c g c r',
    'f >c< f >c<', 'c g c g', 'd a d a', 'g >d< g >d<', 'c g c g', 'a >e< a >e<', 'f >c< g >d<', 'c g c r']),
  noise: 'l8 ' + J([...Array(7).fill('x r x r x r x x'), 'x r x r x x x x', ...Array(7).fill('x r x r x r x x'), 'x r x r x x x x']),
};

const BRIDAL = {
  id: 'bridal', title: { ko: '결혼 행진(바그너)', en: 'Bridal Chorus (Wagner)' }, bpm: 76, bar: 4, loop: false, src: 'Wagner, Lohengrin (1850) — public domain',
  p1: 'o4 l4 ' + J(['g >c8. c16 c2<', 'g >d8. <b16 >c2<', 'g >c8. f16 f4 e8 d8<', '>c4 <b8 >c8 d2<', 'g >c8. c16 c2<', 'g >d8. <b16 >c2<', 'g >c8. e16 g4 e8 c8<', 'a >d8. <b16 >c2<']),
  p2: 'o4 l2 ' + J(['e e', 'd e', 'a g', 'e f', 'e e', 'd e', 'e g', 'f4 f4 e2']),
  tri: J(['o3 c1', 'o2 g2 o3 c2', 'o3 f2 o2 g2', 'o3 c2 o2 g2', 'o3 c1', 'o2 g2 o3 c2', 'o3 c2 e2', 'o3 f4 o2 g4 o3 c2']),
  noise: 'l4 ' + J([...Array(7).fill('x r r r'), 'x r x x']),
};

const MARCH = {
  id: 'march', title: { ko: '결혼 행진곡(멘델스존)', en: 'Wedding March (Mendelssohn)' }, bpm: 116, bar: 4, loop: false,
  src: 'Mendelssohn, A Midsummer Night\'s Dream (1842) — public domain · opening fanfare + 8-bit march',
  p1: 'o5 ' + J(['l12 c c c c2 r4', 'c c c c2 r4', 'c c c c4 c c c c4', 'c c c c4 c c c c4', 'l4 e2. r4',
    'g4. e8 c4. e8', 'g4 >c4< b4 a4', 'g4. f8 e4 d4', 'c2 r4 g4', 'a4. g8 f4. a8', '>c4< b4 a4 g4', 'f4. e8 d4 g4', 'c2. r4']),
  p2: 'o4 ' + J(['l12 g g g g2 r4', 'g g g g2 r4', 'g g g g4 g g g g4', 'g g g g4 g g g g4', 'l2 g2. r4',
    'e g', 'e f', 'd <b>', 'c r', 'f a', 'e e', 'd f', 'e2. r4']),
  tri: J(['o3 c4 r2.', 'o3 c4 r2.', 'o3 c4 r4 c4 r4', 'o3 c4 r4 c4 r4', 'o3 e1',
    'o3 c4 g4 c4 g4', 'o3 c4 g4 f4 a4', 'o3 g4 d4 g4 d4', 'o3 c4 g4 c4 r4', 'o3 f4 c4 f4 c4', 'o2 a4 o3 e4 c4 e4', 'o2 g4 o3 d4 o2 g4 b4', 'o3 c2. r4']),
  noise: J(['l12 x x x x4 r2', 'x x x x4 r2', 'x x x x4 x x x x4', 'x x x x4 x x x x4', 'l16 x x x x x x x x x x x x x x x x',
    ...Array(7).fill('l8 x r x x x r x r'), 'l4 x r2.']),
};

const DANUBE = {
  id: 'danube', title: { ko: '아름답고 푸른 도나우', en: 'Blue Danube (Strauss II)' }, bpm: 168, bar: 3, loop: true, src: 'Johann Strauss II, An der schönen blauen Donau (1866) — public domain',
  p1: 'o4 l4 ' + J(['d f+ a', 'a2.', 'r2.', 'r2 d', 'd f+ a', 'a2.', 'r2.', 'r2 c+', 'c+ e b', 'b2.', 'r2.', 'r2 c+',
    'c+ e b', 'b2.', 'r2.', 'r2 d', 'd f+ a', '>d2.<', 'r2.', 'r2 d', 'd f+ a', '>d2.<', 'r2.', 'r2 d']),
  p2: 'o5 l4 ' + J(['r2.', 'r2.', 'r a a', 'r f+ f+', 'r2.', 'r2.', 'r a a', 'r g g', 'r2.', 'r2.', 'r b b', 'r g g',
    'r2.', 'r2.', 'r b b', 'r f+ f+', 'r2.', 'r2.', 'r >d d<', 'r a a', 'r2.', 'r2.', 'r >d d<', 'r b b']),
  tri: 'l4 ' + J([...Array(6).fill('o3 d a a'), ...Array(9).fill('o2 a o3 e g'), ...Array(8).fill('o3 d a a'), 'o2 g o3 d g']),
  noise: 'l4 ' + J(Array(24).fill('x r r')),
};

// Pachelbel: the ground bass under every line — p2 plays the lines one cycle behind p1 (a canon that wraps around the loop)
const CA = ['f+ e d c+', '<b a b >c+'], CB = ['d c+ <b a', 'g f+ g e>'], CC = ['l8 d f+ a g f+ d f+ e', 'd <b >d <a g b a g> l4'];
const CANON = {
  id: 'canon', title: { ko: '캐논(파헬벨)', en: 'Canon (Pachelbel)' }, bpm: 72, bar: 4, loop: true, src: 'Pachelbel, Canon in D (c. 1700) — public domain',
  p1: 'l4 ' + J(['o5 ' + CA[0], CA[1], 'o5 ' + CB[0], CB[1], 'o5 ' + CC[0], CC[1], 'o6 ' + CA[0], CA[1]]),
  p2: 'l4 ' + J(['o4 ' + CC[0], CC[1], 'o5 ' + CA[0], CA[1], 'o5 ' + CB[0], CB[1], 'o5 ' + CC[0], CC[1]]),
  tri: 'l4 ' + J(Array(4).fill(['o3 d o2 a b f+', 'g d g a']).flat()),
  noise: J(Array(8).fill('r1')),
};

const FESTIVAL = {
  id: 'festival', title: { ko: '잔치 날', en: 'Festival' }, bpm: 132, bar: 4, loop: true, src: 'original',
  p1: 'o5 ' + J(['g4 b8 >d8< b4 g4', 'a8 b8 a8 g8 e4 d4', 'e8 g8 >c8< b8 a4 g4', 'f+8 g8 a8 b8 a4 d4', 'g4 b8 >d8< b4 g4', 'e8 g8 b8 a8 g4 e4', 'e8 g8 >c8 e8 d4< a4', 'g2 r4 d4',
    'e8 g8 >c8< g8 e8 g8 >c8< g8', 'd8 g8 b8 g8 d8 g8 b8 >d8<', 'c8 e8 a8 >c8< b8 a8 g8 e8', 'f+8 a8 >d8< a8 f+4 d4', 'g4 b8 >d8< b4 g4', 'e8 g8 b8 a8 g4 e4', 'e8 g8 >c8 e8 d4< a4', 'g2 r2']),
  p2: 'o4 l8 ' + J(['r b r b r b r b', 'r b r b r b r b', 'r g r g r g r g', 'r a r a r a r a', 'r b r b r b r b', 'r b r b r b r b', 'r g r g r a r a', 'r b r b r b r b',
    'r g r g r g r g', 'r b r b r b r b', 'r a r a r a r a', 'r a r a r a r a', 'r b r b r b r b', 'r b r b r b r b', 'r g r g r a r a', 'r b r b r b r b']),
  tri: 'l4 ' + J(['o2 g o3 d o2 g o3 d', 'o2 g o3 d o2 g o3 d', 'o3 c g c g', 'o3 d a d a', 'o2 g o3 d o2 g o3 d', 'o3 e b e b', 'o3 c g d a', 'o2 g o3 d o2 g o3 d',
    'o3 c g c g', 'o2 g o3 d o2 g o3 d', 'o2 a o3 e o2 a o3 e', 'o3 d a d a', 'o2 g o3 d o2 g o3 d', 'o3 e b e b', 'o3 c g d a', 'o2 g o3 d o2 g o3 d']),
  noise: 'l8 ' + J([...Array(7).fill('x r x r x r x r'), 'x x x x x x x x', ...Array(7).fill('x r x r x r x r'), 'x x x x x x x x']),
};

// 청사초롱: A minor pentatonic over a slow 3+3+2 hand-drum feel
const LANTERNS = {
  id: 'lanterns', title: { ko: '청사초롱 밤', en: 'Lantern Night' }, bpm: 84, bar: 4, loop: true, src: 'original',
  p1: 'o5 ' + J(['a4 >c8< a8 g4 e4', 'd8 e8 g8 e8 d4. r8', 'e4 g8 a8 >c4< a4', 'g8 a8 g8 e8 d2', 'a4 >c8 d8 e4 d4<', '>c8< a8 g8 a8 e2', 'd8 e8 g8 a8 g8 e8 d8 c8', '<a2.> r4',
    'e4 e8 g8 a4 a4', '>c8< a8 g8 e8 g2', 'a4 g8 e8 d4 c4', 'd8 e8 g8 a8 e2', 'a4 >c8< a8 g4 e4', 'd8 e8 g8 e8 d4 c4', '<a8> c8 d8 e8 g8 e8 d8 c8', '<a2.> r4']),
  p2: 'o4 l4 ' + J(['a e >c< e', 'g d b d', 'g e >c< e', 'g d b d', 'a e >c< e', 'a e >c< e', 'g d b d', 'a e >c< e',
    'g e >c< e', 'a e >c< e', 'a e >c< e', 'g e b e', 'a e >c< e', 'g d b d', 'g e >c< e', 'a e >c< e']),
  tri: 'l1 ' + J(['o2 a', 'o2 g', 'o3 c', 'o2 g', 'o2 a', 'o2 a', 'o2 g', 'o2 a', 'o3 c', 'o2 a', 'o2 a', 'o2 e', 'o2 a', 'o2 g', 'o3 c', 'o2 a']),
  noise: 'l8 ' + J(Array(16).fill('x r r x r r x r')),
};

export const SONGS = [MORNING, BRIDAL, MARCH, DANUBE, CANON, FESTIVAL, LANTERNS];
export const songById = id => SONGS.find(s => s.id === id) || null;
