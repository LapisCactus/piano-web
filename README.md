# Webブラウザピアノアプリ

ブラウザで動くシンプルなピアノアプリです。PC/スマホのどちらでも演奏できます。

## 機能

- 2オクターブ鍵盤（C4〜B5）
- マウス・タッチ・ドラッグ操作に対応
- マルチタッチで和音演奏
- 音量スライダー
- Web Audio + AudioWorkletによるリアルタイム音声生成
- 録音ボタンで演奏イベントをメモリ上に記録（最初の打鍵を0msとして、時刻ms + ノート + on/off）
- 記録した演奏データの再生
- 録音データをMIDI（.mid）に変換してダウンロード

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
