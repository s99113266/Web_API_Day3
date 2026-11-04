# DOG-O-VISION · 狗狗映像管電視

用 [Dog CEO API](https://dog.ceo/dog-api/) 隨機抓狗狗照片，放進一台 70–80 年代風格的紅色映像管電視裡。
純 HTML / CSS / JavaScript，沒有任何框架與建置流程。

## 檔案結構

```
index.html      頁面結構（不含 inline CSS / JS）
css/
  common.css    共用樣式：Reset、設計變數、共用按鈕骨架、共用提示框、共用工具類、材質
  tv.css        本頁專用：滿版紅色機身、鉛筆描邊、CRT 螢幕、控制面板、開關機動畫
js/
  common.js     共用工具（window.App）：DOM 選取、本地儲存庫、JSON 請求、圖片預載、動畫等待
  tv.js         本頁專用：抓圖、上一張／下一張、歷史紀錄、電源狀態
```

- 共用檔案（`css/common.css`、`js/common.js`）不含任何本頁專屬樣式或邏輯，其他頁面可直接引用。
- 本頁專屬樣式與邏輯只放在 `css/tv.css`、`js/tv.js`，不寫進共用檔。

## 執行方式

直接用瀏覽器開啟 `index.html` 即可；若想用本機伺服器：

```powershell
python -m http.server 8123
# 開啟 http://127.0.0.1:8123/
```

## 操作

| 操作 | 說明 |
| --- | --- |
| 下一張 | 若本地歷史還有下一張，直接回放；只有在歷史末端時才呼叫 API 抓新照片 |
| 上一張 | 只播放本地歷史，不會重新請求 API |
| 電源 | 關機／開機，狀態會記在 `localStorage` |
| ← / → | 上一張／下一張 |
| 空白鍵 | 開關電視 |

## 資料保存

使用 `localStorage`，命名空間為 `dogTv`：

- `dogTv:history`：照片網址陣列（保留最近 40 張）
- `dogTv:index`：目前播放到第幾張
- `dogTv:power`：`on` / `off`

因此「上一張 → 再按下一張」會拿到剛才顯示過的那張，不會再打 API。

## 動畫實作重點

- **關機**：對螢幕圖層做 `clip-path: inset(...)`，可視區先收成水平亮線、再收成亮點，
  同時把影像 `blur` 並提高 `brightness`；全程不使用 `transform: scale`，圖片本身不會縮小。
- **開機**：可視區從第一幀就是滿版（不做放大），只讓畫面由 `blur(20px) brightness(4.6) saturate(0)`
  的模糊全白，逐步過渡到 `saturate(1)` 的正常彩色。
- **鉛筆描邊**：以 `feTurbulence` + `feDisplacementMap` 的 SVG 濾鏡讓邊框抖動，搭配紅色機身排線與紙張顆粒。

## API

`GET https://dog.ceo/api/breeds/image/random`

```json
{
  "message": "https://images.dog.ceo/breeds/cockapoo/guri9.jpg",
  "status": "success"
}
```

