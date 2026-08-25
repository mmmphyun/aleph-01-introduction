'use strict';

// ===== 유틸리티 =====
const lerp = (a, b, t) => a + (b - a) * t;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ===== 포메이션 데이터 =====
// 인덱스 순서: 0=GK 1=LB 2=LCB 3=RCB 4=RB 5=LCM 6=Regista 7=Volante 8=LW 9=ST 10=RW
// 좌표 단위: 피치 105×68 기준 퍼센트 (left%, top%)
const POSITIONS = {
  base: [
    { x: 4.8,  y: 50.0 },  // GK
    { x: 19.0, y: 17.6 },  // LB
    { x: 21.9, y: 38.2 },  // LCB
    { x: 21.9, y: 61.8 },  // RCB
    { x: 19.0, y: 82.4 },  // RB  [활성]
    { x: 38.1, y: 29.4 },  // LCM
    { x: 33.3, y: 50.0 },  // Regista
    { x: 45.7, y: 50.0 },  // Volante  [활성]
    { x: 64.8, y: 17.6 },  // LW
    { x: 71.4, y: 50.0 },  // ST  [활성]
    { x: 64.8, y: 82.4 },  // RW
  ],
  striker: [
    // 공격 상황: 전방 압박, 상대 박스 근처로 집결
    { x: 7.6,  y: 50.0 },  // GK (소폭 전진)
    { x: 49.5, y: 11.8 },  // LB (하이 포지셔닝)
    { x: 40.0, y: 32.4 },  // LCB (전진)
    { x: 40.0, y: 67.6 },  // RCB (전진)
    { x: 49.5, y: 88.2 },  // RB (하이 포지셔닝)
    { x: 59.0, y: 23.5 },  // LCM (박스 근처)
    { x: 53.3, y: 50.0 },  // Regista (전진)
    { x: 62.9, y: 41.2 },  // Volante (박스 전면)
    { x: 78.1, y: 14.7 },  // LW (바이라인 근처)
    { x: 81.9, y: 50.0 },  // ST (박스 안)
    { x: 78.1, y: 85.3 },  // RW (바이라인 근처)
  ],
  volante: [
    // 빌드업: 4-3-3 → 3-4-3 (볼란치 내려오고 풀백 올라감)
    { x: 4.8,  y: 50.0 },  // GK
    { x: 42.9, y: 17.6 },  // LB → 왼쪽 미드 라인으로 전진
    { x: 19.0, y: 32.4 },  // LCB → 3백 왼쪽
    { x: 19.0, y: 67.6 },  // RCB → 3백 오른쪽
    { x: 42.9, y: 82.4 },  // RB → 오른쪽 미드 라인으로 전진
    { x: 40.0, y: 36.8 },  // LCM → 중앙 좌측 미드
    { x: 36.2, y: 50.0 },  // Regista → 중앙 미드 유지
    { x: 21.0, y: 50.0 },  // Volante → 3백 중앙으로 하강! ←핵심
    { x: 64.8, y: 17.6 },  // LW
    { x: 70.5, y: 50.0 },  // ST
    { x: 64.8, y: 82.4 },  // RW
  ],
  fullback: [
    // 오버래핑: 우측 풀백이 상대 박스 옆까지 전진
    { x: 4.8,  y: 50.0 },  // GK
    { x: 28.6, y: 17.6 },  // LB → 소폭 전진
    { x: 26.7, y: 36.8 },  // LCB → 커버 위해 약간 좌이동
    { x: 26.7, y: 63.2 },  // RCB → 커버 위해 약간 우이동
    { x: 83.8, y: 88.2 },  // RB → 오버래핑! 상대 박스 우측 바이라인
    { x: 47.6, y: 32.4 },  // LCM → 우측으로 이동
    { x: 41.9, y: 50.0 },  // Regista → 소폭 전진
    { x: 55.2, y: 41.2 },  // Volante → 우중앙
    { x: 74.3, y: 23.5 },  // LW → 박스 안으로 침투
    { x: 80.0, y: 44.1 },  // ST → 박스 포지셔닝
    { x: 76.2, y: 76.5 },  // RW → 크로스 착지점
  ],
};

// ===== 스크롤 구간 정의 =====
// [start, end, fromState, toState] — progress 0→1
const SCROLL_ZONES = [
  [0.00, 0.32, null,       null],        // 픽셀화만
  [0.32, 0.44, null,       'base'],      // 전술판 등장 (base 위치로 수렴)
  [0.44, 0.62, 'base',     'striker'],   // 공격 상황
  [0.62, 0.78, 'striker',  'volante'],   // 빌드업 (4-3-3 → 3-4-3)
  [0.78, 0.95, 'volante',  'fullback'],  // 오버래핑
];

// ===== DOM 참조 =====
const canvas          = document.getElementById('pitch-canvas');
const ctx             = canvas.getContext('2d');
const img             = document.getElementById('stadium-img');
const heroEl          = document.getElementById('hero');
const heroIntro       = document.getElementById('hero-intro');
const canvasOverlay   = document.getElementById('canvas-overlay');
const tacticalOverlay = document.getElementById('tactical-overlay');

// 선수 마커 요소 (data-index 기준 정렬)
const markerEls = Array.from({ length: 11 });
document.querySelectorAll('.marker[data-index]').forEach(el => {
  markerEls[parseInt(el.dataset.index, 10)] = el;
});

const markerBtns = document.querySelectorAll('.marker-btn');
const panels     = document.querySelectorAll('.panel');
const stripItems = document.querySelectorAll('.strip-item');

// 픽셀화용 오프스크린 캔버스
const offscreen = document.createElement('canvas');
const offCtx    = offscreen.getContext('2d', { willReadFrequently: true });

let imgLoaded      = false;
let rafPending     = false;
let clickAnimating = false;
let clickRafId     = null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== 캔버스 크기 맞춤 =====
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  if (imgLoaded) renderFrame();
}

// ===== 스크롤 진행도 (0 → 1) =====
function getProgress() {
  const scrollRange = heroEl.offsetHeight - window.innerHeight;
  return Math.max(0, Math.min(1, window.scrollY / scrollRange));
}

// ===== 선수 위치 적용 =====
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
    if (!toState) return null; // 픽셀화 구간, 마커 없음

    const t = easeInOut((progress - start) / (end - start));
    const from = POSITIONS[fromState ?? toState];
    const to   = POSITIONS[toState];

    return from.map((f, i) => ({
      x: lerp(f.x, to[i].x, t),
      y: lerp(f.y, to[i].y, t),
    }));
  }
  return POSITIONS['fullback']; // 마지막 구간 이후
}

// ===== 클릭 모드: rAF 시간 기반 애니메이션 =====
function animateToState(targetState, duration = 750) {
  if (clickRafId) cancelAnimationFrame(clickRafId);
  clickAnimating = true;

  // 현재 마커 위치 스냅샷
  const startPositions = markerEls.map(el => ({
    x: parseFloat(el?.style.getPropertyValue('--mx') ?? '50'),
    y: parseFloat(el?.style.getPropertyValue('--my') ?? '50'),
  }));
  const targetPositions = POSITIONS[targetState];
  const startTime = performance.now();

  function tick(now) {
    if (!clickAnimating) return;
    const t      = Math.min(1, (now - startTime) / duration);
    const eased  = easeInOut(t);

    startPositions.forEach((s, i) => {
      const tgt = targetPositions[i];
      const el  = markerEls[i];
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

// ===== 캔버스 픽셀화 렌더 =====
const MIN_PX = 1;
const MAX_PX = 7;

function drawPixelated(pixelSize) {
  const w = canvas.width, h = canvas.height;
  if (pixelSize <= 1) {
    ctx.imageSmoothingEnabled = true;
    // object-fit: cover 방식으로 크롭
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
    offscreen.width  = sw;
    offscreen.height = sh;
    offCtx.imageSmoothingEnabled = true;
    offCtx.drawImage(img, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(offscreen, 0, 0, sw, sh, 0, 0, w, h);
  }
}

// ===== 메인 렌더 루프 =====
function renderFrame() {
  const progress  = getProgress();
  const pixelSize = Math.round(MIN_PX + (MAX_PX - MIN_PX) * Math.min(progress / 0.35, 1));

  drawPixelated(pixelSize);

  // 인트로 페이드 아웃
  heroIntro.style.opacity = String(Math.max(0, 1 - progress / 0.28 * 2));

  // 전술판 등장/퇴장
  if (progress >= 0.32) {
    tacticalOverlay.classList.add('visible');
    tacticalOverlay.removeAttribute('aria-hidden');
    canvasOverlay.classList.add('tactical-mode');
  } else {
    tacticalOverlay.classList.remove('visible');
    tacticalOverlay.setAttribute('aria-hidden', 'true');
    canvasOverlay.classList.remove('tactical-mode');
  }

  // 스크롤 기반 포메이션 (클릭 애니메이션 중이 아닐 때만)
  if (!clickAnimating) {
    const scrollPos = getScrollPositions(progress);
    if (scrollPos) applyPositions(scrollPos);
  }
}

// ===== 이미지 로드 =====
function onImgLoad() {
  imgLoaded = true;
  resizeCanvas();
  if (reduceMotion) applyReducedMotionState();
}

img.addEventListener('load', onImgLoad);
img.addEventListener('error', () => {
  ctx.fillStyle = '#1a3520';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  applyReducedMotionState();
});

if (img.complete && img.naturalWidth > 0) onImgLoad();

// ===== 스크롤 / 리사이즈 =====
window.addEventListener('scroll', () => {
  clickAnimating = false; // 스크롤이 항상 우선
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
  tacticalOverlay.classList.add('visible');
  tacticalOverlay.removeAttribute('aria-hidden');
  canvasOverlay.classList.add('tactical-mode');
  applyPositions(POSITIONS.base);
  if (imgLoaded) drawPixelated(MAX_PX);
}

if (reduceMotion) applyReducedMotionState();

// ===== 패널 열기/닫기 =====
function closeAllPanels() {
  panels.forEach(p => p.classList.remove('open'));
  markerBtns.forEach(m => m.setAttribute('aria-expanded', 'false'));
}

function openPanel(panelId, targetState) {
  closeAllPanels();
  const panel  = document.getElementById(panelId);
  const marker = document.querySelector(`[aria-controls="${panelId}"]`);
  if (!panel) return;
  panel.classList.add('open');
  marker?.setAttribute('aria-expanded', 'true');
  animateToState(targetState);
  requestAnimationFrame(() => panel.querySelector('.panel-close')?.focus());
}

// 마커 버튼 클릭
const stateMap = {
  'panel-striker':  'striker',
  'panel-volante':  'volante',
  'panel-fullback': 'fullback',
};

markerBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('aria-controls');
    const isOpen  = btn.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      closeAllPanels();
      animateToState('base');
    } else {
      openPanel(panelId, stateMap[panelId]);
    }
  });
});

// 닫기 버튼
document.querySelectorAll('.panel-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.closest('.panel').id;
    const marker  = document.querySelector(`[aria-controls="${panelId}"]`);
    closeAllPanels();
    animateToState('base');
    marker?.focus();
  });
});

// Escape 키
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const openMarker = document.querySelector('.marker-btn[aria-expanded="true"]');
  closeAllPanels();
  animateToState('base');
  openMarker?.focus();
});

// 스트립 버튼: 전술판이 없으면 스크롤 후 패널 열기
stripItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId     = btn.dataset.panel;
    const targetState = btn.dataset.state;

    if (!tacticalOverlay.classList.contains('visible')) {
      const targetScroll = (heroEl.offsetHeight - window.innerHeight) * 0.4;
      window.scrollTo({ top: targetScroll, behavior: reduceMotion ? 'auto' : 'smooth' });
      setTimeout(() => openPanel(panelId, targetState), reduceMotion ? 0 : 600);
    } else {
      openPanel(panelId, targetState);
    }
  });
});
