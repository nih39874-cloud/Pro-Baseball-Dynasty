# 鑽石王朝 / Pro Baseball Dynasty

六隊中華職棒經營＋GM 獨立模擬聯盟＋橫向 PWA＋3D 棒球操作。

## 2026-11-08 已部署到雲端的部分

- GitHub Pages 靜態遊戲程式（GitHub Actions 工作流程已包含，**Pages 設定仍須由儲存庫擁有者啟用／確認**）。
- Supabase 專案：`imustiprnotlhryoappj`，東京區域。
- 兩個互不影響的聯盟：`gm` 和 `official`，均從遊戲 2024 年開始，各隊初始 5 億元。
- 每個聯盟 360 場、每隊 120 場例行賽排程。下一輪新球季預設每週二台灣時間 08:00 開始。
- 每分鐘一次的 `pg_cron` 工作、PostgreSQL 賽事模擬、比分／逐打席記錄、初步季後賽系列賽、32 人／60 人名單自動補選、可接洽球員市場、球團收支和 GM 時間快轉／回溯、資金修改的後端邏輯。
- 後端 Edge Function `game-api` 已部署，驗證 Supabase Auth JWT，並依 `memberships` 限制球隊與 GM 權限。
- 前端登入與正式財務、名單、FA 接洽、賽程、GM API 操作已接線；沒有直接將密碼或 service-role key 放入 GitHub。
- RLS 已啟用；已確認安全顧問目前沒有安全警告。

## 重要：尚不能當作正式版上線

- **七組正式 Auth 帳號尚未開通**：目前可透過 `scripts/provision-users.mjs` 使用服務端管理金鑰安全建立。原先使用者指定的四位數密碼很容易被猜測，應儘速更換。
- **2024 全季六隊＋2025／2026 選秀球員完整資料未匯入**。資料表不會為了湊人數而虛構真實姓名與 FA 年資。
- **B 級真人辨識度建模、真實球場建模與動畫未完成**。目前是可操作的 WebGL2／軟體 3D 佔位模型，不是正式肖像。
- **多人即時 3D 逐球投打、守備、跑壘與 ABS 同步尚未完成**。伺服器版目前以**賽程驅動的 AI 模擬**為主；本機練習賽不能取代多人實戰。
- 季後賽先用 **第 3 對第 4 名三戰兩勝→第 2 名三戰兩勝→冠軍七戰四勝**的遊戲暫定賽制，**不是宣稱完全照 2024 中職正式規則**。
- 球隊票房／贊助及薪資結算目前是遊戲設計估算，不是真實球團財報；FA 談判目前只有基本報價／接受邏輯。
- **正式聯盟 `is_ready=false`**：不會在帳號／球員資料未齊備時，自動模擬不存在的球員。GM 聯盟也保護性禁止空白球季快轉。

## 本機啟動

```sh
python3 -m http.server 4173
# 開啟 http://localhost:4173
```

最新 Chrome、Edge 或 Safari，橫向瀏覽最佳。支援 WebGL2，部分環境可使用軟體 3D 備援渲染。

```sh
npm test
```

## 安全建立正式登入帳號

直接在 Supabase Dashboard 建立 Auth 使用者，或由專案擁有者在**私人本機**執行：

```sh
SUPABASE_URL='https://imustiprnotlhryoappj.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<private key>' \
DIAMOND_ACCOUNT_PASSWORDS='<private JSON with seven username/password pairs>' \
node scripts/provision-users.mjs
```

腳本建立七個帳號與 `memberships`，**不會**把密碼寫進 GitHub 或前端。為避免覆蓋，已存在帳號時會回報但不重設其密碼。完成合法球員資料匯入後，專案擁有者再用受控的 `public.server_activate_league(league_id)` 進行啟用（只授權 service-role）。

## 模組架構

- `src/main.js`：只做啟動與組裝。
- `src/core/`：練習賽狀態機及棒球判定。
- `src/graphics/`：3D 球場、模型佔位渲染。
- `src/controls/`：MOBA 風格搖桿／操作。
- `src/ui/`：登入、球隊、正式賽程與 GM 控制 UI。
- `src/backend/auth.js`：Supabase Auth 與 Edge Function 呼叫。
- `src/platform/`：PWA／橫向與觸控防護。
- `supabase/functions/game-api/`：伺服器權限、資金、FA、名單、GM 指令。
- `sql/`：已部署的 Schema 與流程遷移，按編號執行。

## 資料授權

野球革命 Open Data：https://github.com/rebas-tw/rebas.tw-open-data （ODC-By；使用時依條款標示來源）。其他中職／Trackman／肖像／商標資料須分別確認使用授權，不能把網站內容任意整批轉載。
