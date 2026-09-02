# Regista · 한승윤

> **SKT ALEPH Bootcamp — Vibe Coding Challenge (T01)**  
> 관심 있는 것을 분석하고, 직접 프로덕트로 설계·구현하는 사람 한승윤의 인터랙티브 소개 페이지입니다.

- **Live Demo**: [https://mmmphyun.github.io/aleph-01-introduction/](https://mmmphyun.github.io/aleph-01-introduction/)

---

## ⚽ Project Concept

축구에서 깊은 위치(Deep-lying)에서 경기 흐름을 읽고 공격을 설계하는 **'Regista(레지스타)'**의 역할을 저의 문제 해결 방식(분석 → 설계 → 구현)에 투영했습니다.

- **히어로 화면**: 세로형 고각도 경기장 야경을 통한 시각적 몰입감
- **스크롤 전환**: 캔버스 서브픽셀 다운샘플링을 통한 픽셀 아트(도트 게임 감성) 도트화 + 3D 이젤 전술판 전환
- **인터랙션**: 11명 선수 마커의 실제 축구 전술 기반 동선(공격 압박, 라볼피아나 빌드업, 오버래핑) 및 글래스모피즘 상세 설명 카드

---

## 🤖 Vibe Coding & Engineering Log

AI를 단순 코드 생성기가 아닌 **페어 프로그래머**로 활용하며, 추상적인 시각적 느낌(Vibe)을 정밀한 프론트엔드 스펙으로 발전시켰습니다.

### 1. 추상적인 감성을 구체적인 기술 스펙으로 전환
- "고해상도 도트 게임 같은 느낌": 실사 이미지를 단순히 뭉개는 대신, 오프스크린 캔버스를 활용한 정수 배율 다운샘플링 + CRT 스캔라인 그리드 오버레이 구조로 구체화
- "이젤에 비스듬히 누운 전술판": CSS `perspective` 및 `rotateX(24deg)` 사다리꼴 변형과 좌/우 2열 글래스모피즘 레이아웃 분리로 마커 가림 현상 해결

### 2. AI 제안을 맹종하지 않고 직접 판단한 의사결정
- **실제 전술적 디테일 직접 설계**: 6번 레지스타의 딥라잉 피벗 롤, 빌드업 시 3백 사이 하강, 우풀백 오버래핑 시 윙어의 박스 안 투톱 쇄도 등 실제 축구 전술 메커니즘을 직접 정의하고 좌표계 교정
- **불필요한 복잡도 배제**: AI가 제안했던 복잡한 WebGL 3D 카메라 앵글 회전 대신, 순수 Canvas 피치 줌인 크롭을 적용하여 가볍고 안정적인 브라우저 경험 구축

---

## 🛠️ Tech Stack

- **Core**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Graphics**: HTML5 Canvas, SVG Pitch Vector Overlay
- **Deploy**: GitHub Pages
