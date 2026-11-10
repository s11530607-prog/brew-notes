# CLAUDE.md

這個專案的所有規則都寫在 **AGENTS.md**（給所有 AI 工具共用）。請先完整讀完再動手：

@AGENTS.md

## 給 Claude 的補充

- 開始任何任務前，先讀 `site.config.json` 與 `content/notes.json`，掌握目前有哪些分類與筆記。
- 新增筆記一律走 AGENTS.md §4 的流程；可以使用 `node scripts/new-note.mjs`。
- 結束前必須執行 `node scripts/check.mjs`，錯誤數為 0 才算完成；有警告時說明你如何處理。
- 回報時用條列列出「新增的檔案」與「修改的檔案」。
- 規則不清楚或使用者要求與規則衝突時，先提出來問，不要自行修改 AGENTS.md。只有使用者同意後，才更新 AGENTS.md，並確保它與程式、檢查腳本保持一致。
