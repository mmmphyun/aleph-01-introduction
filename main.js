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
    { x: 50.0, y: 95.0 }, // GK
    { x: 16.0, y: 78.0 }, // LB
    { x: 36.0, y: 80.0 }, // LCB
    { x: 64.0, y: 80.0 }, // RCB
    { x: 84.0, y: 78.0 }, // RB [풀백]
    { x: 28.0, y: 58.0 }, // LCM
    { x: 50.0, y: 68.0 }, // Regista [6번 앵커]
    { x: 58.0, y: 54.0 }, // CM [중앙 미드]
    { x: 18.0, y: 32.0 }, // LW
    { x: 50.0, y: 25.0 }, // ST [스트라이커]
    { x: 82.0, y: 32.0 }, // RW
  ],
  striker: [
    // 1) 공격 상황: 컴팩트한 상하 간격 & 센터백 하프라인 전진 & 박스 안 집중
    { x: 50.0, y: 80.0 }, // GK (하프라인 뒤 커버)
    { x: 14.0, y: 44.0 }, // LB (하프라인 위 전진)
    { x: 34.0, y: 50.0 }, // LCB -> [하프라인(y:52.5)까지 완벽 전진]
    { x: 66.0, y: 50.0 }, // RCB -> [하프라인(y:52.5)까지 완벽 전진]
    { x: 86.0, y: 44.0 }, // RB (하프라인 위 전진)
    { x: 32.0, y: 28.0 }, // LCM (박스 전면 세컨볼)
    { x: 50.0, y: 40.0 }, // Regista (중원 압박 라인)
    { x: 62.0, y: 22.0 }, // CM -> [박스 아크 부근 쇄도]
    { x: 25.0, y: 14.0 }, // LW -> [박스 안 좌측 침투]
    { x: 50.0, y: 10.0 }, // ST -> [골문 정면 깊숙이 침투!]
    { x: 75.0, y: 14.0 }, // RW -> [박스 안 우측 침투]
  ],
  volante: [
    // 2) 빌드업 상황: Regista 3백 하강, CM이 공 받으러 마중 하강, 공격 3인방 하프라인 부근 컴팩트 배치
    { x: 50.0, y: 95.0 }, // GK
    { x: 14.0, y: 58.0 }, // LB (윙백 전진)
    { x: 26.0, y: 84.0 }, // LCB (넓게 벌림)
    { x: 74.0, y: 84.0 }, // RCB (넓게 벌림)
    { x: 86.0, y: 58.0 }, // RB (윙백 전진)
    { x: 34.0, y: 56.0 }, // LCM (중앙 미드 유지)
    { x: 50.0, y: 86.0 }, // Regista -> [LCB와 RCB 사이 3백 꼭짓점 하강]
    { x: 52.0, y: 70.0 }, // CM -> [Regista의 3백 앞까지 깊게 내려와 공을 받아주는 마중 움직임!]
    { x: 22.0, y: 44.0 }, // LW -> [하프라인(y:52.5) 바로 위, 컴팩트 배치]
    { x: 50.0, y: 38.0 }, // ST -> [하프라인 위 컴팩트 배치]
    { x: 78.0, y: 44.0 }, // RW -> [하프라인(y:52.5) 바로 위, 컴팩트 배치]
  ],
  fullback: [
    // 3) 오버래핑 상황: 수비 3인방 우측으로 슬라이딩(CB2+LB1), 수비라인 하프라인까지 전진, RB 근처 연계 지원
    { x: 50.0, y: 82.0 }, // GK
    { x: 30.0, y: 52.0 }, // LB  -> [중앙/우측으로 좁히며 3백 좌측 형성, 하프라인 위치]
    { x: 50.0, y: 50.0 }, // LCB -> [우측으로 슬라이딩하여 3백 중앙 형성, 하프라인 위치]
    { x: 70.0, y: 50.0 }, // RCB -> [우측 빈공간 커버하여 3백 우측 형성, 하프라인 위치]
    { x: 90.0, y: 12.0 }, // RB  -> [상대 우측 코너 플래그 끝까지 폭발적 오버래핑!]
    { x: 36.0, y: 38.0 }, // LCM (밸런스 지원)
    { x: 52.0, y: 44.0 }, // Regista (후방 전환 기점)
    { x: 76.0, y: 24.0 }, // CM  -> [오버래핑한 RB 바로 안쪽/대각선 뒤에서 볼을 연계해주는 지원 움직임!]
    { x: 32.0, y: 20.0 }, // LW  (반대편 대기)
    { x: 52.0, y: 16.0 }, // ST  (박스 중앙 침투)
    { x: 82.0, y: 18.0 }, // RW  -> [RB 앞쪽에서 숏패스 받아주며 공간 창출]
  ],
};

// ===== 스크롤 구간 정의 =====
const SCROLL_ZONES = [
  [0.00, 0.28, null,      null,      null],           // 픽셀화 시작
  [0.28, 0.44, null,      'base',    'card-striker'], // 전술판 눕히며 등장
  [0.44, 0.62, 'base',    'striker', 'card-striker'], // 1) ST 공격 압박
  [0.62, 0.78, 'striker', 'volante', 'card-volante'], // 2) CM/Regista 빌드업
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

// ===== stadium.jpg 세로(rotatedCanvas) 기준 피치 바운딩 박스 =====
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

  const cropT = Math.min(progress / 0.28, 1);

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
