# Brand Lens for Bags

ブランドバッグ査定デモを **静的Webアプリ** として公開するための実装です。`index.html` / `app.js` / `styles.css` を中心に、GitHub Pages でそのままホスティングできる構成にしています。

## 構成

- `index.html`: 画面UIとメタ情報（manifestリンク含む）
- `app.js`: カメラ入力・画像アップロード・簡易推定ロジック・履歴管理
- `styles.css`: 画面スタイル
- `manifest.webmanifest`: PWAメタ情報
- `sw.js`: オフラインキャッシュ用のService Worker

## ローカル確認

ビルド不要です。任意の静的サーバーで起動します。

```bash
python3 -m http.server 8000
```

> Service Worker を確認するため、`file://` ではなく `http://localhost` で開いてください。

## GitHub Pages 公開手順

1. このリポジトリの `main` にPRをマージ
2. GitHub の **Settings > Pages** を開く
3. **Build and deployment** を `Deploy from a branch` に設定
4. Branch を `main` / `/ (root)` に設定して保存
5. 数分後に発行されるURLへアクセス

## 注意

- 今回はバイナリ画像・アイコンファイルを含めていません。
- `manifest.webmanifest` もテキストのみで構成しています。
