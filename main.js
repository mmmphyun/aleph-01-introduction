'use strict';

// ===== 유틸리티 함수 =====
const lerp = (a, b, t) => a + (b - a) * t;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ===== 11명 세로 포메이션 데이터 (0:상단 골대 ~ 100:하단 골대) =====
// 인덱스: 0=GK 1=LB 2=LCB 3=RCB 4=RB[활성] 5=LCM 6=Regista[6번 피벗] 7=CM[활성] 8=LW 9=ST[활성] 10=RW
const POSITIONS = {
  base: [
    { x: 50.0, y: 94.0 }, // GK
    { x: 16.0, y: 80.0 }, // LB
    { x: 36.0, y: 82.0 }, // LCB
    { x: 64.0, y: 82.0 }, // RCB
    { x: 84.0, y: 80.0 }, // RB [활성 - 풀백]
    { x: 28.0, y: 58.0 }, // LCM
    { x: 50.0, y: 70.0 }, // Regista [6번 딥라잉 피벗/앵커]
    { x: 58.0, y: 54.0 }, // CM [활성 - 전방 연계 미드필더]
    { x: 18.0, y: 32.0 }, // LW
    { x: 50.0, y: 24.0 }, // ST [활성 - 스트라이커]
    { x: 82.0, y: 32.0 }, // RW
  ],
  striker: [
    // 공격 상황: 전방 강력 압박 (ST 박스 침투, LW/RW/CM 좁혀오며 Regista 하프라인 전진)
    { x: 50.0, y: 88.0 }, // GK
    { x: 14.0, y: 46.0 }, // LB
    { x: 34.0, y: 56.0 }, // LCB
    { x: 66.0, y: 56.0 }, // RCB
    { x: 86.0, y: 46.0 }, // RB
    { x: 26.0, y: 32.0 }, // LCM
    { x: 50.0, y: 46.0 }, // Regista -> [하프라인 부근 전진]
    { x: 60.0, y: 26.0 }, // CM -> [박스 아크 부근 침투 지원]
    { x: 22.0, y: 16.0 }, // LW (상대 박스 안 쇄도)
    { x: 50.0, y: 11.0 }, // ST -> [골문 정면 깊숙이 침투!]
    { x: 78.0, y: 16.0 }, // RW (상대 박스 안 쇄도)
  ],
  volante: [
    // 빌드업: 라볼피아나 3-4-3 (Regista 센터백 사이 하강, 양 풀백 전진, CM이 중앙에서 연결)
    { x: 50.0, y: 94.0 }, // GK
    { x: 14.0, y: 52.0 }, // LB (윙백 전진)
    { x: 26.0, y: 82.0 }, // LCB (3백 좌측)
    { x: 74.0, y: 82.0 }, // RCB (3백 우측)
    { x: 86.0, y: 52.0 }, // RB (윙백 전진)
    { x: 36.0, y: 54.0 }, // LCM
    { x: 50.0, y: 84.0 }, // Regista -> [LCB와 RCB 사이로 깊게 내려와 3백 꼭짓점 형성!]
    { x: 58.0, y: 50.0 }, // CM -> [중앙 전방에서 Regista 패스 받아주는 메짤라]
    { x: 18.0, y: 32.0 }, // LW
    { x: 50.0, y: 24.0 }, // ST
    { x: 82.0, y: 32.0 }, // RW
  ],
  fullback: [
    // 오버래핑: 우측 풀백 폭발적 치고 올라감 (RW 컷인, ST/LW 크로스 타겟)
    { x: 50.0, y: 94.0 }, // GK
    { x: 18.0, y: 72.0 }, // LB
    { x: 34.0, y: 78.0 }, // LCB
    { x: 62.0, y: 78.0 }, // RCB (커버)
    { x: 88.0, y: 10.0 }, // RB -> [상대 우측 코너 바이라인 끝까지 폭발적 오버래핑!]
    { x: 30.0, y: 48.0 }, // LCM
    { x: 48.0, y: 58.0 }, // Regista (후방 조율 및 전환 기점)
    { x: 66.0, y: 40.0 }, // CM (우측 뒤 공간 지원)
    { x: 26.0, y: 18.0 }, // LW (박스 침투)
    { x: 48.0, y: 14.0 }, // ST (중앙 쇄도)
    { x: 70.0, y: 22.0 }, // RW (안쪽으로 좁히며 컷인)
  ],
};

// ===== 스크롤 구간 정의 =====
const SCROLL_ZONES = [
  [0.00, 0.28, null,      null,      null],           // 픽셀화 시작
  [0.28, 0.44, null,      'base',    'card-striker'], // 전술판 눕히며 등장
  [0.44, 0.62, 'base',    'striker', 'card-striker'], // 1) ST 공격 압박
  [0.62, 0.78, 'striker', 'volante', 'card-volante'], // 2) Regista 빌드업
  [0.78, 0.96, 'volante', 'fullback','card-fullback'],// 3) RB 오버래핑
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

// 선수 마커 정렬 (data-index 0~10)
const markerEls = Array.from({ length: 11 });
document.querySelectorAll('.marker[data-index]').forEach(el => {
  markerEls[parseInt(el.dataset.index, 10)] = el;
});

// 오프스크린 캔버스들
const rotatedCanvas = document.createElement('canvas');
const rotatedCtx    = rotatedCanvas.getContext('2d');

const offscreen = document.createElement('canvas');
const offCtx    = offscreen.getContext('2d', { willReadFrequently: true });

let imgLoaded      = false;
let rafPending     = false;
let clickAnimating = false;
let clickRafId     = null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== 미리 세로 90도 회전된 마스터 캔버스 준비 =====
function prepareRotatedMaster() {
  if (!img.naturalWidth || !img.naturalHeight) return;
  rotatedCanvas.width = img.naturalHeight;
  rotatedCanvas.height = img.naturalWidth;
  
  rotatedCtx.save();
  rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  rotatedCtx.rotate(90 * Math.PI / 180);
  rotatedCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  rotatedCtx.restore();
}

// ===== 캔버스 리사이즈 =====
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.max(rect.width, 320);
  canvas.height = Math.max(rect.height, 480);
  if (imgLoaded) renderFrame();
}

// ===== 스크롤 진행도 계산 =====
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

  markerBtns.forEach(btn => {
    const match = btn.getAttribute('aria-controls') === cardId;
    btn.setAttribute('aria-expanded', match ? 'true' : 'false');
  });
}

// ===== 클릭 시 rAF 타임 기반 포메이션 애니메이션 =====
function animateToState(targetState, cardId, duration = 650) {
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

// ===== stadium.jpg 세로(rotatedCanvas) 기준 실제 잔디 피치 바운딩 박스 =====
// 원본 가로: x(22.6%~76.4%), y(25.0%~71.2%)
// 90도 시계방향 회전 후:
// new_X = (1 - old_Y_max) ~ (1 - old_Y_min) = (1 - 0.712) ~ (1 - 0.250) = 28.8% ~ 75.0%
// new_Y = old_X_min ~ old_X_max = 22.6% ~ 76.4%
const PITCH_CROP = {
  x: 0.288,
  y: 0.226,
  w: 0.462,
  h: 0.538
};

// ===== 세로 고정 줌인 -> 피치 크롭 도트화 렌더링 =====
const MIN_PX = 1;
const MAX_PX = 6;

function drawVerticalStadium(pixelSize, progress) {
  const w = canvas.width;
  const h = canvas.height;
  const rw = rotatedCanvas.width;
  const rh = rotatedCanvas.height;

  if (!rw || !rh) return;

  // progress 0: 전체 세로 사진 cover (히어로)
  // progress >= 0.28: PITCH_CROP (순수 피치 영역으로 줌인 크롭)
  const cropT = Math.min(progress / 0.28, 1);

  // 현재 크롭 좌표 보간
  let full_sx = 0, full_sy = 0, full_sw = rw, full_sh = rh;
  const rA = rw / rh;
  const cA = w / h;
  if (rA > cA) {
    full_sw = rh * cA;
    full_sx = (rw - full_sw) / 2;
  } else {
    full_sh = rw / cA;
    full_sy = (rh - full_sh) / 2;
  }

  const target_sx = rw * PITCH_CROP.x;
  const target_sy = rh * PITCH_CROP.y;
  const target_sw = rw * PITCH_CROP.w;
  const target_sh = rh * PITCH_CROP.h;

  const cur_sx = lerp(full_sx, target_sx, cropT);
  const cur_sy = lerp(full_sy, target_sy, cropT);
  const cur_sw = lerp(full_sw, target_sw, cropT);
  const cur_sh = lerp(full_sh, target_sh, cropT);

  if (pixelSize <= 1) {
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(rotatedCanvas, cur_sx, cur_sy, cur_sw, cur_sh, 0, 0, w, h);
  } else {
    const sw = Math.max(1, Math.floor(w / pixelSize));
    const sh = Math.max(1, Math.floor(h / pixelSize));
    offscreen.width = sw;
    offscreen.height = sh;
    offCtx.imageSmoothingEnabled = true;
    offCtx.drawImage(rotatedCanvas, cur_sx, cur_sy, cur_sw, cur_sh, 0, 0, sw, sh);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(offscreen, 0, 0, sw, sh, 0, 0, w, h);
  }
}

// ===== 프레임 렌더링 루프 =====
function renderFrame() {
  const progress = getProgress();
  const pixelSize = Math.round(MIN_PX + (MAX_PX - MIN_PX) * Math.min(progress / 0.30, 1));

  drawVerticalStadium(pixelSize, progress);

  // 인트로 페이드아웃
  heroIntro.style.opacity = String(Math.max(0, 1 - progress / 0.25 * 2.5));

  // 전술판 및 라커룸 배경 활성화
  if (progress >= 0.28) {
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
  prepareRotatedMaster();
  resizeCanvas();
  if (reduceMotion) applyReducedMotionState();
}

img.addEventListener('load', onImgLoad);
img.addEventListener('error', () => {
  ctx.fillStyle = '#112619';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  applyReducedMotionState();
});

if (img.complete && img.naturalWidth > 0) onImgLoad();

// ===== 스크롤 & 리사이즈 리스너 =====
window.addEventListener('scroll', () => {
  clickAnimating = false;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    renderFrame();
    rafPending = false;
  });
}, { passive: true });

window.addEventListener('resize', () => {
  if (imgLoaded) prepareRotatedMaster();
  resizeCanvas();
});

// ===== 모션 감소 모드 =====
function applyReducedMotionState() {
  heroIntro.style.opacity = '0';
  heroSticky.classList.add('stage-active');
  lockerRoomBg.classList.add('visible');
  applyPositions(POSITIONS.base);
  updateActiveCard('card-striker');
  if (imgLoaded) drawVerticalStadium(MAX_PX, 1);
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
      const targetScroll = (heroEl.offsetHeight - window.innerHeight) * 0.42;
      window.scrollTo({ top: targetScroll, behavior: reduceMotion ? 'auto' : 'smooth' });
      setTimeout(() => animateToState(stateName, cardId), reduceMotion ? 0 : 500);
    } else {
      animateToState(stateName, cardId);
    }
  });
});
