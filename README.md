# 沖煮手帖｜我的手沖咖啡知識庫

一個用 Markdown 寫成的手沖咖啡個人知識庫。一頁一主題、筆記之間互相連結，並用 `AGENTS.md` 定義一整套規則，讓 AI 可以依照同樣的格式持續新增內容。

- 網站：https://s11530607-prog.github.io/brew-notes/
- 規則文件：[AGENTS.md](AGENTS.md)（Claude Code 透過 [CLAUDE.md](CLAUDE.md) 讀取同一份規則）

## 特色

- **零建置**：純 HTML / CSS / JavaScript，推上 GitHub 就能用 GitHub Pages 瀏覽
- **內容與程式分離**：新增筆記只要新增一個 `.md` 檔並登記到 `content/notes.json`
- **三種筆記類型**：概念、指南、比較，各有固定的必備段落與範本（`templates/`）
- **站內連結**：`[[slug]]` 自動變成連結，並在被連到的筆記顯示「提到這篇的筆記」
- **自動檢查**：`scripts/check.mjs` 檢查格式、必備段落與連結；GitHub Actions 每次 push 都會執行

## 本機預覽

瀏覽器不允許直接用 `file://` 讀取檔案，所以需要啟動一個簡單的伺服器：

```bash
python3 -m http.server 8000
# 然後打開 http://localhost:8000
```

## 新增一篇筆記

```bash
node scripts/new-note.mjs water-quality concept basics "水質"
# 編輯 content/notes/water-quality.md 與 content/notes.json 的摘要、標籤
node scripts/check.mjs
```

或直接請 AI：「依照 AGENTS.md，新增一篇關於水質的概念筆記。」

## 部署到 GitHub Pages

1. 在 GitHub 建立一個 public repository，名稱建議為 `brew-notes`
2. 把整個資料夾上傳（或 `git push`）到 `main` 分支
3. 到 repository 的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`，按 Save
4. 約 1～2 分鐘後，網站會出現在 `https://你的帳號.github.io/brew-notes/`
5. 把 `site.config.json` 的 `repoUrl`、`author` 與本檔的網址改成自己的

## 目錄

```
index.html          唯一的 HTML 外框
site.config.json    網站設定（分類、筆記類型、必備段落）
assets/             程式與樣式
content/            筆記內容（notes.json + notes/*.md + pages/*.md）
templates/          三種筆記範本
scripts/            檢查與新增筆記的腳本
```
