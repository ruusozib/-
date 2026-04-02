const cameraEl = document.getElementById("camera");
const snapshotEl = document.getElementById("snapshot");
const resultImageEl = document.getElementById("resultImage");
const startCameraBtn = document.getElementById("startCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const scanBtn = document.getElementById("scanBtn");
const imageUpload = document.getElementById("imageUpload");
const resultCard = document.getElementById("resultCard");
const statusText = document.getElementById("statusText");
const candidateList = document.getElementById("candidateList");
const latencyChip = document.getElementById("latencyChip");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const scanLine = document.getElementById("scanLine");

const fields = {
  brand: document.getElementById("brand"),
  model: document.getElementById("model"),
  category: document.getElementById("category"),
  price: document.getElementById("price"),
  material: document.getElementById("material"),
  confidence: document.getElementById("confidence"),
};

const HISTORY_KEY = "brand_lens_history_v1";

// 製品版向けのローカル特徴ベース推定データ
const bagCatalog = [
  {
    brand: "CHANEL",
    model: "Classic Flap Bag",
    category: "ショルダーバッグ",
    price: "¥1,650,000〜",
    material: "ラムスキン / キャビアスキン",
    signature: { r: 84, g: 74, b: 64, edge: 0.46, contrast: 0.41 },
  },
  {
    brand: "LOUIS VUITTON",
    model: "Speedy Bandoulière 25",
    category: "ハンドバッグ",
    price: "¥330,000〜",
    material: "モノグラム・キャンバス",
    signature: { r: 123, g: 96, b: 73, edge: 0.32, contrast: 0.35 },
  },
  {
    brand: "HERMÈS",
    model: "Birkin 30",
    category: "トートバッグ",
    price: "¥1,800,000〜",
    material: "トゴレザー",
    signature: { r: 132, g: 96, b: 68, edge: 0.28, contrast: 0.33 },
  },
  {
    brand: "DIOR",
    model: "Lady Dior",
    category: "ハンドバッグ",
    price: "¥920,000〜",
    material: "カーフスキン",
    signature: { r: 96, g: 84, b: 76, edge: 0.5, contrast: 0.44 },
  },
  {
    brand: "GUCCI",
    model: "GG Marmont",
    category: "ショルダーバッグ",
    price: "¥290,000〜",
    material: "キルティングレザー",
    signature: { r: 102, g: 90, b: 84, edge: 0.37, contrast: 0.38 },
  },
];

let stream;

function setStatus(message) {
  statusText.textContent = message;
}

function setButtonsAfterCameraStart() {
  startCameraBtn.disabled = true;
  stopCameraBtn.disabled = false;
  scanBtn.disabled = false;
}

function setButtonsAfterCameraStop() {
  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  scanBtn.disabled = true;
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    cameraEl.srcObject = stream;
    setButtonsAfterCameraStart();
    setStatus("カメラ接続済み: バッグをフレーム内に合わせてスキャンしてください。");
  } catch (error) {
    setStatus("カメラアクセスに失敗しました。権限設定を確認してください。");
    console.error(error);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  cameraEl.srcObject = null;
  setButtonsAfterCameraStop();
  scanLine.classList.add("hidden");
  setStatus("カメラ停止中: 画像アップロードでも認識可能です。");
}

function extractFeatureSignature(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let brightnessSum = 0;
  let brightnessSqSum = 0;
  let edgeCount = 0;

  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = luma(r, g, b);

    sumR += r;
    sumG += g;
    sumB += b;
    brightnessSum += y;
    brightnessSqSum += y * y;
  }

  const avgBrightness = brightnessSum / pixelCount;
  const variance = Math.max(brightnessSqSum / pixelCount - avgBrightness * avgBrightness, 0);
  const contrast = Math.min(Math.sqrt(variance) / 128, 1);

  // 軽量エッジ推定（横方向差分）
  for (let y = 0; y < height; y += 2) {
    for (let x = 1; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      const leftIdx = (y * width + (x - 1)) * 4;

      const diffR = Math.abs(data[idx] - data[leftIdx]);
      const diffG = Math.abs(data[idx + 1] - data[leftIdx + 1]);
      const diffB = Math.abs(data[idx + 2] - data[leftIdx + 2]);

      if (diffR + diffG + diffB > 65) {
        edgeCount += 1;
      }
    }
  }

  const sampledPixels = Math.ceil((width / 2) * (height / 2));
  const edge = Math.min(edgeCount / sampledPixels, 1);

  return {
    r: Math.round(sumR / pixelCount),
    g: Math.round(sumG / pixelCount),
    b: Math.round(sumB / pixelCount),
    contrast: Number(contrast.toFixed(3)),
    edge: Number(edge.toFixed(3)),
  };
}

function distance(a, b) {
  const colorDist =
    Math.abs(a.r - b.r) / 255 + Math.abs(a.g - b.g) / 255 + Math.abs(a.b - b.b) / 255;
  const textureDist = Math.abs(a.edge - b.edge) + Math.abs(a.contrast - b.contrast);
  return colorDist * 0.65 + textureDist * 0.35;
}

function rankCandidates(signature) {
  const scored = bagCatalog
    .map((item) => ({
      ...item,
      score: distance(signature, item.signature),
    }))
    .sort((a, b) => a.score - b.score);

  const topScore = scored[0].score;

  return scored.map((item) => {
    const relative = Math.max(0, 1 - (item.score - topScore) * 1.8);
    const confidence = Math.round(Math.max(45, Math.min(98, relative * 100)));
    return {
      ...item,
      confidence,
    };
  });
}

function renderResult(topCandidate, topThree, imageUrl, elapsedMs) {
  fields.brand.textContent = topCandidate.brand;
  fields.model.textContent = topCandidate.model;
  fields.category.textContent = topCandidate.category;
  fields.price.textContent = topCandidate.price;
  fields.material.textContent = topCandidate.material;
  fields.confidence.textContent = `${topCandidate.confidence}%`;

  resultImageEl.src = imageUrl;
  latencyChip.textContent = `処理時間: ${elapsedMs} ms`;

  candidateList.innerHTML = "";
  topThree.forEach((candidate) => {
    const li = document.createElement("li");
    li.textContent = `${candidate.brand} / ${candidate.model}（一致率 ${candidate.confidence}%）`;
    candidateList.appendChild(li);
  });

  resultCard.classList.remove("hidden");
}

function saveHistory(result) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  history.unshift(result);
  const trimmed = history.slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  renderHistory(trimmed);
}

function renderHistory(data = null) {
  const history = data ?? JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  historyList.innerHTML = "";

  if (history.length === 0) {
    const empty = document.createElement("li");
    empty.innerHTML = `<span>履歴はまだありません</span><small>スキャン後にここへ表示されます</small>`;
    historyList.appendChild(empty);
    return;
  }

  history.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${item.brand} / ${item.model} (${item.confidence}%)</span><small>${item.timestamp}</small>`;
    historyList.appendChild(li);
  });
}

function processImageToResult(imageLike, sourceLabel = "camera") {
  const start = performance.now();

  snapshotEl.width = imageLike.videoWidth || imageLike.naturalWidth || imageLike.width;
  snapshotEl.height = imageLike.videoHeight || imageLike.naturalHeight || imageLike.height;

  if (!snapshotEl.width || !snapshotEl.height) {
    setStatus("画像サイズを取得できませんでした。別の画像でお試しください。");
    return;
  }

  const ctx = snapshotEl.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imageLike, 0, 0, snapshotEl.width, snapshotEl.height);

  const imageData = ctx.getImageData(0, 0, snapshotEl.width, snapshotEl.height);
  const signature = extractFeatureSignature(imageData);
  const ranked = rankCandidates(signature);
  const topThree = ranked.slice(0, 3);
  const topCandidate = topThree[0];

  const elapsedMs = Math.round(performance.now() - start);
  const imageUrl = snapshotEl.toDataURL("image/jpeg", 0.9);

  renderResult(topCandidate, topThree, imageUrl, elapsedMs);

  const timestamp = new Date().toLocaleString("ja-JP", { hour12: false });
  saveHistory({
    brand: topCandidate.brand,
    model: topCandidate.model,
    confidence: topCandidate.confidence,
    timestamp,
    source: sourceLabel,
  });

  setStatus(`認識完了: ${topCandidate.brand} ${topCandidate.model} を検出しました。`);
}

function scanFromCamera() {
  if (!cameraEl.videoWidth || !cameraEl.videoHeight) {
    setStatus("カメラ準備中です。数秒待ってから再試行してください。");
    return;
  }

  scanLine.classList.remove("hidden");
  setStatus("解析中…");

  window.setTimeout(() => {
    processImageToResult(cameraEl, "camera");
    scanLine.classList.add("hidden");
  }, 400);
}

function scanFromUpload(file) {
  if (!file) {
    return;
  }

  const img = new Image();
  const fileUrl = URL.createObjectURL(file);

  img.onload = () => {
    processImageToResult(img, "upload");
    URL.revokeObjectURL(fileUrl);
  };

  img.onerror = () => {
    setStatus("画像の読み込みに失敗しました。別ファイルをお試しください。");
    URL.revokeObjectURL(fileUrl);
  };

  img.src = fileUrl;
  setStatus(`アップロード画像を解析中… (${file.name})`);
}

startCameraBtn.addEventListener("click", startCamera);
stopCameraBtn.addEventListener("click", stopCamera);
scanBtn.addEventListener("click", scanFromCamera);
imageUpload.addEventListener("change", (event) => {
  const [file] = event.target.files;
  scanFromUpload(file);
  event.target.value = "";
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory([]);
  setStatus("スキャン履歴を削除しました。");
});

renderHistory();
