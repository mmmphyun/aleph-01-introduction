'use strict';

// ===== 유틸리티 함수 =====
const lerp = (a, b, t) => a + (b - a) * t;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ===== 11명 세로 포메이션 데이터 (세로 68 x 105 기준 %, 0:상단 골대 ~ 100:하단 골대) =====
// 인덱스: 0=GK 1=LB 2=LCB 3=RCB 4=RB 5=LCM 6=Regista 7=Volante 8=LW 9=ST 10=RW
const POSITIONS = {
  base: [
    { x: 50.0, y: 95.0 }, // GK (아군 골대 앞)
    { x: 16.0, y: 80.0 }, // LB
    { x: 38.0, y: 82.0 }, // LCB
    { x: 62.0, y: 82.0 }, // RCB
    { x: 84.0, y: 80.0 }, // RB [활성 - 풀백]
    { x: 28.0, y: 60.0 }, // LCM
    { x: 50.0, y: 66.0 }, // Regista [본인]
    { x: 50.0, y: 54.0 }, // Volante [활성 - 볼란치]
    { x: 18.0, y: 35.0 }, // LW
    { x: 50.0, y: 28.0 }, // ST [활성 - 스트라이커]
    { x: 82.0, y: 35.0 }, // RW
  ],
  striker: [
    // 공격 상황: 전방 압박, 상대 박스(상단) 근처 집결
    { x: 50.0, y: 92.0 }, // GK
    { x: 14.0, y: 50.0 }, // LB (높은 라인)
    { x: 35.0, y: 60.0 }, // LCB (하프라인 전진)
    { x: 65.0, y: 60.0 }, // RCB (하프라인 전진)
    { x: 86.0, y: 50.0 }, // RB (높은 라인)
    { x: 25.0, y: 38.0 }, // LCM
    { x: 50.0, y: 46.0 }, // Regista
    { x: 55.0, y: 36.0 }, // Volante
    { x: 18.0, y: 20.0 }, // LW (상대 박스 옆)
    { x: 50.0, y: 16.0 }, // ST (상대 박스 안 침투)
    { x: 82.0, y: 20.0 }, // RW (상대 박스 옆)
  ],
  volante: [
    // 빌드업: 4-3-3 -> 3-4-3 (볼란치 하강 라볼피아나, 양 풀백 전진)
    { x: 50.0, y: 95.0 }, // GK
    { x: 15.0, y: 56.0 }, // LB (윙백 전진)
    { x: 28.0, y: 82.0 }, // LCB (3백 좌측)
    { x: 72.0, y: 82.0 }, // RCB (3백 우측)
    { x: 85.0, y: 56.0 }, // RB (윙백 전진)
    { x: 36.0, y: 58.0 }, // LCM
    { x: 50.0, y: 62.0 }, // Regista
    { x: 50.0, y: 84.0 }, // Volante -> [센터백 사이로 하강!]
    { x: 18.0, y: 35.0 }, // LW
    { x: 50.0, y: 28.0 }, // ST
    { x: 82.0, y: 35.0 }, // RW
  ],
  fullback: [
    // 오버래핑: 우측 풀백이 상대 우측 바이라인(상단) 끝까지 치고 올라감
    { x: 50.0, y: 95.0 }, // GK
    { x: 20.0, y: 72.0 }, // LB
    { x: 35.0, y: 78.0 }, // LCB
    { x: 62.0, y: 78.0 }, // RCB (커버)
    { x: 88.0, y: 15.0 }, // RB -> [상대 코너 부근 오버래핑!]
    { x: 32.0, y: 50.0 }, // LCM
    { x: 48.0, y: 55.0 }, // Regista
    { x: 65.0, y: 44.0 }, // Volante (우측 지원)
    { x: 28.0, y: 24.0 }, // LW (크로스 타겟)
    { x: 46.0, y: 18.0 }, // ST (박스 중앙 쇄도)
    { x: 74.0, y: 22.0 }, // RW (인사이드 컷)
  ],
};

// ===== 스크롤 구간 정의 =====
// [start, end, fromState, toState, cardTarget]
const SCROLL_ZONES = [
  [0.00, 0.30, null,      null,      null],           // 히어로 및 픽셀화 시작
  [0.30, 0.44, null,      'base',    'card-striker'], // 전술판 눕히며 등장 (기본 대형)
  [0.44, 0.62, 'base',    'striker', 'card-striker'], // 1) Striker 공격
  [0.62, 0.78, 'striker', 'volante', 'card-volante'], // 2) Volante 빌드업 (3-4-3)
  [0.78, 0.96, 'volante', 'fullback','card-fullback'],// 3) Fullback 오버래핑
];

// ===== DOM 참조 =====
const canvas          = document.getElementById('pitch-canvas');
const ctx             = canvas.getContext('2d');
const img             = document.getElementById('stadium-img');
const heroEl          = document.getElementById('hero');
const heroSticky      = document.getElementById('hero-sticky');
const heroIntro       = document.getElementById('hero-intro');
const lockerRoomBg    = document.getElementById('locker-room-bg');
const glassCards      = document.querySelectorAll('.glass-card');
const markerBtns      = document.querySelectorAll('.marker-btn');
const stripItems      = document.querySelectorAll('.strip-item');

// 선수 마커 요소 정렬 (data-index 0~10)
const markerEls = Array.from({ length: 11 });
document.querySelectorAll('.marker[data-index]').forEach(el => {
  markerEls[parseInt(el.dataset.index, 10)] = el;
});

// 오프스크린 캔버스 (픽셀화용)
const offscreen = document.createElement('canvas');
const offCtx    = offscreen.getContext('2d', { willReadFrequently: true });

let imgLoaded      = false;
let rafPending     = false;
let clickAnimating = false;
let clickRafId     = null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== 캔버스 크기 리사이즈 =====
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.max(rect.width, 300);
  canvas.height = Math.max(rect.height, 450);
  if (imgLoaded) renderFrame();
}

// ===== 스크롤 진행도 계산 (0 -> 1) =====
function getProgress() {
  const scrollRange = heroEl.offsetHeight - window.innerHeight;
  return Math.max(0, Math.min(1, window.scrollY / scrollRange));
}

// ===== 마커 좌표 적용 =====
function applyPositions(positions) {
  positions.forEach((pos, i) => {
    const el = markerEls[i];
    if (!el) return;
    el.style.setProperty('--mx', pos.x.toFixed(2) + '%');
    el.style.setProperty('--my', pos.y.toFixed(2) + '%');
  });
}

// ===== 스크롤 기반 포지션 계산 =====
function getScrollPositions(progress) {
  for (const [start, end, fromState, toState] of SCROLL_ZONES) {
    if (progress < start || progress > end) continue;
    if (!toState) return null;

    const t = easeInOut((progress - start) / (end - start));
    const from = POSITIONS[fromState ?? toState];
    const to   = POSITIONS[toState];

    return from.map((f, i) => ({
      x: lerp(f.x, to[i].x, t),
      y: lerp(f.y, to[i].y, t),
    }));
  }
  return POSITIONS.fullback;
}

// ===== 우측 활성 카드 업데이트 =====
function updateActiveCard(cardId) {
  glassCards.forEach(card => {
    if (card.id === cardId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  // 해당 마커 및 스트립 aria 동기화
  markerBtns.forEach(btn => {
    const match = btn.getAttribute('aria-controls') === cardId;
    btn.setAttribute('aria-expanded', match ? 'true' : 'false');
  });
}

// ===== 클릭 시 rAF 타임 기반 포메이션 애니메이션 =====
function animateToState(targetState, cardId, duration = 700) {
  if (clickRafId) cancelAnimationFrame(clickRafId);
  clickAnimating = true;

  updateActiveCard(cardId);

  const startPositions = markerEls.map(el => ({
    x: parseFloat(el?.style.getPropertyValue('--mx') || '50'),
    y: parseFloat(el?.style.getPropertyValue('--my') || '50'),
  }));
  const targetPositions = POSITIONS[targetState];
  const startTime = performance.now();

  function tick(now) {
    if (!clickAnimating) return;
    const t = Math.min(1, (now - startTime) / duration);
    const eased = easeInOut(t);

    startPositions.forEach((s, i) => {
      const tgt = targetPositions[i];
      const el = markerEls[i];
      if (!el) return;
      el.style.setProperty('--mx', lerp(s.x, tgt.x, eased).toFixed(2) + '%');
      el.style.setProperty('--my', lerp(s.y, tgt.y, eased).toFixed(2) + '%');
    });

    if (t < 1) {
      clickRafId = requestAnimationFrame(tick);
    } else {
      clickAnimating = false;
    }
  }

  clickRafId = requestAnimationFrame(tick);
}

// ===== Canvas 픽셀화 렌더링 =====
const MIN_PX = 1;
const MAX_PX = 6;

function drawPixelated(pixelSize) {
  const w = canvas.width;
  const h = canvas.height;

  if (pixelSize <= 1) {
    ctx.imageSmoothingEnabled = true;
    // 세로 이미지 cover 크롭 로직
    const iA = img.naturalWidth / img.naturalHeight;
    const cA = w / h;
    let sx, sy, sw, sh;
    if (iA > cA) {
      sh = img.naturalHeight; sw = sh * cA;
      sx = (img.naturalWidth - sw) / 2; sy = 0;
    } else {
      sw = img.naturalWidth; sh = sw / cA;
      sx = 0; sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    const sw = Math.max(1, Math.floor(w / pixelSize));
    const sh = Math.max(1, Math.floor(h / pixelSize));
    offscreen.width = sw;
    offscreen.height = sh;
    offCtx.imageSmoothingEnabled = true;
    offCtx.drawImage(img, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(offscreen, 0, 0, sw, sh, 0, 0, w, h);
  }
}

// ===== 프레임 렌더링 루프 =====
function renderFrame() {
  const progress = getProgress();
  const pixelSize = Math.round(MIN_PX + (MAX_PX - MIN_PX) * Math.min(progress / 0.32, 1));

  drawPixelated(pixelSize);

  // 인트로 페이드아웃
  heroIntro.style.opacity = String(Math.max(0, 1 - progress / 0.25 * 2.5));

  // 전술판 및 라커룸 배경 활성화
  if (progress >= 0.30) {
    heroSticky.classList.add('stage-active');
    lockerRoomBg.classList.add('visible');
  } else {
    heroSticky.classList.remove('stage-active');
    lockerRoomBg.classList.remove('visible');
  }

  // 스크롤 포메이션 보간 및 활성 카드 매핑
  if (!clickAnimating) {
    const currentZone = SCROLL_ZONES.find(([start, end]) => progress >= start && progress <= end);
    if (currentZone && currentZone[4]) {
      updateActiveCard(currentZone[4]);
    }
    const scrollPos = getScrollPositions(progress);
    if (scrollPos) applyPositions(scrollPos);
  }
}

// ===== 이미지 로드 핸들러 =====
function onImgLoad() {
  imgLoaded = true;
  resizeCanvas();
  if (reduceMotion) applyReducedMotionState();
}

img.addEventListener('load', onImgLoad);
img.addEventListener('error', () => {
  // 이미지 로드 실패 시 다크 그린 기본 피치 렌더
  ctx.fillStyle = '#14281a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  applyReducedMotionState();
});

if (img.complete && img.naturalWidth > 0) onImgLoad();

// ===== 스크롤 & 리사이즈 리스너 =====
window.addEventListener('scroll', () => {
  clickAnimating = false; // 스크롤 시 자동 애니메이션 중단 후 스크롤 우선
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    renderFrame();
    rafPending = false;
  });
}, { passive: true });

window.addEventListener('resize', resizeCanvas);

// ===== 모션 감소 모드 =====
function applyReducedMotionState() {
  heroIntro.style.opacity = '0';
  heroSticky.classList.add('stage-active');
  lockerRoomBg.classList.add('visible');
  applyPositions(POSITIONS.base);
  updateActiveCard('card-striker');
  if (imgLoaded) drawPixelated(MAX_PX);
}

if (reduceMotion) applyReducedMotionState();

// ===== 마커 클릭 인터랙션 =====
const stateMapping = {
  'card-striker':  'striker',
  'card-volante':  'volante',
  'card-fullback': 'fullback',
};

markerBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cardId = btn.getAttribute('aria-controls');
    const stateName = stateMapping[cardId];
    animateToState(stateName, cardId);
  });
});

// ===== 하단 스트립 클릭 인터랙션 =====
stripItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const cardId = btn.dataset.target;
    const stateName = btn.dataset.state;

    if (!heroSticky.classList.contains('stage-active')) {
      const targetScroll = (heroEl.offsetHeight - window.innerHeight) * 0.45;
      window.scrollTo({ top: targetScroll, behavior: reduceMotion ? 'auto' : 'smooth' });
      setTimeout(() => animateToState(stateName, cardId), reduceMotion ? 0 : 550);
    } else {
      animateToState(stateName, cardId);
    }
  });
});
