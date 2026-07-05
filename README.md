# Webブラウザピアノアプリ

ブラウザで動くシンプルなピアノアプリです。PC/スマホのどちらでも演奏できます。

## 機能

- 2オクターブ鍵盤（C4〜B5）
- マウス・タッチ・ドラッグ操作に対応
- マルチタッチで和音演奏
- 音量スライダー
- Web Audio + AudioWorkletによるリアルタイム音声生成

## 利用方法

[https://lapiscactus.github.io/piano-web/](https://lapiscactus.github.io/piano-web/)にアクセスするか、ローカルで起動して利用できます。

1. このディレクトリでローカルサーバーを起動
2. ブラウザで `http://localhost:8000` を開く
3. 鍵盤をタップ/クリックして演奏（初回タップで音声エンジンが有効化）

```bash
cd piano-web
python3 -m http.server 8000
```

## License

Apache License v2
