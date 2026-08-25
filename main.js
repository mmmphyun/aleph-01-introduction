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
    { x: 50.0, y: 96.0 }, // GK
    { x: 15.0, y: 82.0 }, // LB
    { x: 36.0, y: 84.0 }, // LCB
    { x: 64.0, y: 84.0 }, // RCB
    { x: 85.0, y: 82.0 }, // RB [활성 - 풀백]
    { x: 26.0, y: 60.0 }, // LCM
    { x: 50.0, y: 72.0 }, // Regista [6번 딥라잉 피벗/앵커]
    { x: 58.0, y: 56.0 }, // CM [활성 - 전방 연계 미드필더]
    { x: 16.0, y: 32.0 }, // LW
    { x: 50.0, y: 25.0 }, // ST [활성 - 스트라이커]
    { x: 84.0, y: 32.0 }, // RW
  ],
  striker: [
    // 공격 상황: 전방 강력 압박 (ST 박스 침투, LW/RW/CM 좁혀오며 Regista 하프라인 전진)
    { x: 50.0, y: 90.0 }, // GK (하프라인 뒤 커버)
    { x: 12.0, y: 44.0 }, // LB (하이 라인)
    { x: 34.0, y: 54.0 }, // LCB (하프라인 전진)
    { x: 66.0, y: 54.0 }, // RCB (하프라인 전진)
    { x: 88.0, y: 44.0 }, // RB (하이 라인)
    { x: 24.0, y: 30.0 }, // LCM (하프스페이스 지원)
    { x: 50.0, y: 45.0 }, // Regista -> [하프라인 부근까지 전진하여 세컨볼 장악]
    { x: 62.0, y: 24.0 }, // CM -> [박스 아크 부근 전진 침투 지원]
    { x: 20.0, y: 15.0 }, // LW (상대 박스 안 쇄도)
    { x: 50.0, y: 10.0 }, // ST -> [골문 정면 깊숙이 침투!]
    { x: 80.0, y: 15.0 }, // RW (상대 박스 안 쇄도)
  ],
  volante: [
    // 빌드업: 라볼피아나 3-4-3 (Regista 센터백 사이 하강, 양 풀백 전진, CM이 중앙에서 연결)
    { x: 50.0, y: 96.0 }, // GK
    { x: 12.0, y: 50.0 }, // LB (윙백 전진)
    { x: 24.0, y: 84.0 }, // LCB (좌측 넓게 벌림)
    { x: 76.0, y: 84.0 }, // RCB (우측 넓게 벌림)
    { x: 88.0, y: 50.0 }, // RB (윙백 전진)
    { x: 35.0, y: 52.0 }, // LCM (중앙 미드)
    { x: 50.0, y: 86.0 }, // Regista -> [LCB와 RCB 사이로 깊게 내려와 3백 꼭짓점 형성!]
    { x: 58.0, y: 48.0 }, // CM -> [중앙 전방에서 Regista 패스 받아주는 메짤라/플레이메이커]
    { x: 16.0, y: 30.0 }, // LW
    { x: 50.0, y: 22.0 }, // ST
    { x: 84.0, y: 30.0 }, // RW
  ],
  fullback: [
    // 오버래핑: 우측 풀백 폭발적 치고 올라감 (RW 컷인, ST/LW 크로스 타겟)
    { x: 50.0, y: 96.0 }, // GK
    { x: 18.0, y: 70.0 }, // LB
    { x: 32.0, y: 78.0 }, // LCB
    { x: 60.0, y: 78.0 }, // RCB (우측 수비 커버)
    { x: 90.0, y: 8.0 },  // RB -> [상대 우측 코너 바이라인 끝까지 폭발적 오버래핑!]
    { x: 28.0, y: 46.0 }, // LCM
    { x: 46.0, y: 56.0 }, // Regista (후방 조율 및 전환 패스 기점)
    { x: 68.0, y: 38.0 }, // CM (우측 풀백 뒤 공간 지원)
    { x: 26.0, y: 16.0 }, // LW (박스 침투)
    { x: 48.0, y: 12.0 }, // ST (중앙 헤더 쇄도)
    { x: 72.0, y: 18.0 }, // RW (안쪽으로 좁히며 컷인)
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

// 오프스크린 캔버스 (픽셀화용)
const offscreen = document.createElement('canvas');
const offCtx    = offscreen.getContext('2d', { willReadFrequently: true });

let imgLoaded      = false;
let rafPending     = false;
let clickAnimating = false;
let clickRafId     = null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// ===== 90도 회전 및 픽셀화 렌더링 =====
const MIN_PX = 1;
const MAX_PX = 6;

function drawPixelatedRotated(pixelSize) {
  const w = canvas.width;
  const h = canvas.height;

  // 1단계: 원본 가로 이미지를 세로(90도 회전)로 오프스크린에 그리기
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = img.naturalHeight;
  rotCanvas.height = img.naturalWidth;
  const rotCtx = rotCanvas.getContext('2d');
  
  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate(90 * Math.PI / 180);
  rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  // 2단계: 세로화된 이미지를 캔버스 크기에 맞게 도트화
  if (pixelSize <= 1) {
    ctx.imageSmoothingEnabled = true;
    const iA = rotCanvas.width / rotCanvas.height;
    const cA = w / h;
    let sx, sy, sw, sh;
    if (iA > cA) {
      sh = rotCanvas.height; sw = sh * cA;
      sx = (rotCanvas.width - sw) / 2; sy = 0;
    } else {
      sw = rotCanvas.width; sh = sw / cA;
      sx = 0; sy = (rotCanvas.height - sh) / 2;
    }
    ctx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    const sw = Math.max(1, Math.floor(w / pixelSize));
    const sh = Math.max(1, Math.floor(h / pixelSize));
    offscreen.width = sw;
    offscreen.height = sh;
    offCtx.imageSmoothingEnabled = true;
    
    // 크롭 계산
    const iA = rotCanvas.width / rotCanvas.height;
    const cA = sw / sh;
    let sx, sy, scw, sch;
    if (iA > cA) {
      sch = rotCanvas.height; scw = sch * cA;
      sx = (rotCanvas.width - scw) / 2; sy = 0;
    } else {
      scw = rotCanvas.width; sch = scw / cA;
      sx = 0; sy = (rotCanvas.height - sch) / 2;
    }
    offCtx.drawImage(rotCanvas, sx, sy, scw, sch, 0, 0, sw, sh);
    
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(offscreen, 0, 0, sw, sh, 0, 0, w, h);
  }
}

// ===== 프레임 렌더링 루프 =====
function renderFrame() {
  const progress = getProgress();
  const pixelSize = Math.round(MIN_PX + (MAX_PX - MIN_PX) * Math.min(progress / 0.30, 1));

  drawPixelatedRotated(pixelSize);

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

window.addEventListener('resize', resizeCanvas);

// ===== 모션 감소 모드 =====
function applyReducedMotionState() {
  heroIntro.style.opacity = '0';
  heroSticky.classList.add('stage-active');
  lockerRoomBg.classList.add('visible');
  applyPositions(POSITIONS.base);
  updateActiveCard('card-striker');
  if (imgLoaded) drawPixelatedRotated(MAX_PX);
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
