가능합니다. 다만 단순히 원본을 확대하면서 보간을 끄는 방식은 “저해상도 사진”처럼 보일 수 있으니, **작게 축소 → 제한된 팔레트 적용 → 최근접 이웃으로 확대**하는 3단계가 가장 자연스러운 도트화 결과를 냅니다.

`<canvas>` 하나로 바닐라 HTML/CSS/JS에서 처리할 수 있고, 이미지의 외부 전송 없이 브라우저 안에서만 변환할 수도 있습니다.

## 핵심 방식

1. 축구장 탑뷰 원본을 canvas에 작은 크기(예: 240×135)로 그립니다.
2. 그 작은 캔버스의 픽셀을 색상 단계로 줄입니다.
3. 결과를 큰 canvas에 정수 배율(예: 6배)로 다시 그립니다.
4. `imageSmoothingEnabled = false`와 `image-rendering: pixelated`를 적용합니다.

Canvas의 `imageSmoothingEnabled` 기본값은 `true`이며, `false`로 설정하면 확대 시 픽셀 혼합을 막을 수 있습니다. CSS의 `image-rendering: pixelated`도 화면에 표시되는 canvas 확대를 선명하게 유지하는 데 사용됩니다. [developer.mozilla](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled)

## 바로 실행 가능한 예시

아래는 로컬 이미지 파일을 선택하면 **360×203 기준으로 축소한 뒤 4배(1440×812)로 도트화**하는 단일 HTML 예제입니다.

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>축구장 도트화</title>
  <style>
    body {
      margin: 24px;
      background: #141414;
      color: #f4f4f4;
      font-family: system-ui, sans-serif;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      margin: 16px 0;
    }

    canvas {
      max-width: 100%;
      height: auto;
      display: block;
      background: #222;
      border: 1px solid #3d3d3d;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>
</head>
<body>
  <h1>축구장 탑뷰 도트화</h1>

  <div class="controls">
    <input id="file" type="file" accept="image/*" />

    <label>
      픽셀 크기
      <input id="pixelSize" type="range" min="2" max="12" value="4" />
      <span id="pixelSizeValue">4</span>
    </label>

    <label>
      색상 단계
      <input id="levels" type="range" min="2" max="16" value="8" />
      <span id="levelsValue">8</span>
    </label>

    <button id="download">PNG 저장</button>
  </div>

  <canvas id="output"></canvas>

  <script>
    const fileInput = document.querySelector("#file");
    const pixelSizeInput = document.querySelector("#pixelSize");
    const levelsInput = document.querySelector("#levels");
    const pixelSizeValue = document.querySelector("#pixelSizeValue");
    const levelsValue = document.querySelector("#levelsValue");
    const output = document.querySelector("#output");
    const outputCtx = output.getContext("2d");

    const small = document.createElement("canvas");
    const smallCtx = small.getContext("2d", { willReadFrequently: true });

    let image = null;

    function quantize(value, levels) {
      const step = 255 / (levels - 1);
      return Math.round(value / step) * step;
    }

    function render() {
      if (!image) return;

      const pixelSize = Number(pixelSizeInput.value);
      const levels = Number(levelsInput.value);

      pixelSizeValue.textContent = pixelSize;
      levelsValue.textContent = levels;

      const maxWidth = 360;
      const maxHeight = 203;
      const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);

      small.width = Math.max(1, Math.floor((image.width * ratio) / pixelSize));
      small.height = Math.max(1, Math.floor((image.height * ratio) / pixelSize));

      smallCtx.imageSmoothingEnabled = true;
      smallCtx.clearRect(0, 0, small.width, small.height);
      smallCtx.drawImage(image, 0, 0, small.width, small.height);

      const frame = smallCtx.getImageData(0, 0, small.width, small.height);
      const data = frame.data;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = quantize(data[i], levels);
        data[i + 1] = quantize(data[i + 1], levels);
        data[i + 2] = quantize(data[i + 2], levels);
      }

      smallCtx.putImageData(frame, 0, 0);

      output.width = small.width * pixelSize;
      output.height = small.height * pixelSize;

      outputCtx.imageSmoothingEnabled = false;
      outputCtx.clearRect(0, 0, output.width, output.height);
      outputCtx.drawImage(
        small,
        0, 0, small.width, small.height,
        0, 0, output.width, output.height
      );
    }

    fileInput.addEventListener("change", (event) => {
      const [file] = event.target.files;
      if (!file) return;

      const url = URL.createObjectURL(file);
      image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);
        render();
      };

      image.src = url;
    });

    pixelSizeInput.addEventListener("input", render);
    levelsInput.addEventListener("input", render);

    document.querySelector("#download").addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = "soccer-stadium-pixelated.png";
      link.href = output.toDataURL("image/png");
      link.click();
    });
  </script>
</body>
</html>
```

## 조절 팁

- **픽셀 크기 3~4**: 경기장 라인, 골대, 관중석 구조가 비교적 잘 남습니다.
- **픽셀 크기 5~7**: 레트로 게임 맵 느낌이 강해집니다.
- **색상 단계 6~10**: 잔디 명암과 관중석이 과도하게 뭉개지는 것을 줄입니다.
- 원본은 경기장 전체가 화면을 꽉 채우고, 카메라가 수직에 가까운 탑뷰일수록 좋습니다.
- 전광판·관중·그림자 등 디테일을 남기려면 원본을 처음부터 너무 작게 내리지 마세요.

특히 축구장처럼 선이 중요한 이미지에서는, 잔디 무늬와 관중석을 너무 큰 단위로 줄이면 라인이 깨질 수 있으니 출력 크기 기준으로 **한 도트 블록이 3~5px** 정도가 무난합니다.

## 보간 없는 확대 주의점

`ctx.imageSmoothingEnabled = false`는 **canvas 내부에서 `drawImage()`로 확대할 때** 필요합니다. CSS로 canvas 크기를 또 확대한다면 `image-rendering: pixelated`도 같이 적용하세요. 또한 캔버스 크기, 렌더링 좌표, 확대 배율을 정수로 유지해야 픽셀 블록 크기가 일정하고 가장자리에 흐림이 생기지 않습니다. [developer.mozilla](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look)

이미지가 외부 URL에 있을 때는 CORS 설정이 없으면 `getImageData()`나 PNG 저장 단계에서 보안 오류가 날 수 있습니다. 따라서 지금 예제처럼 사용자가 파일을 업로드하게 하거나, 같은 도메인에서 이미지를 서빙하는 방식을 권장합니다.