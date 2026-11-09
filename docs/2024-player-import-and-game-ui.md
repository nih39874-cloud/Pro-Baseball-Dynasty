# 《鑽石王朝》2024 年球員初始資料更新

更新日期：2026-11-09

## 資料範圍

- 球員主檔共 570 人，包括 2024 年 471 人、2025 年 49 位選秀新秀、2026 年 50 位選秀新秀。
- 2024 年新人選秀的 51 筆指名紀錄保存在 `public.draft_selections_2024`，其中 50 人納入 2024 球員主檔；許賀捷 2024 年指名未簽約，僅保留選秀紀錄，避免改寫既有的 2025 年球員資料。
- 新增缺漏的 22 名選秀球員到 `players_master`，同時加入 GM 與正式聯盟，各自獨立為預備名單。原本已有的選秀球員僅補 `draft_year` / `draft_round`。
- 新增的選秀新秀有獨立的初始隱藏能力值（依輪次與位置推估）；這些數值不會回傳到前端。

## 薪資口徑

`public.player_salary_reference_2024` 為 471 位 2024 年球員記錄遊戲所用月薪，使用下列三類證據：

| 類別 | 人數 | 說明 |
| --- | ---: | --- |
| `contemporaneous_report` | 16 | 2024 年新聞或球團明確公布月薪 |
| `2024_compilation` | 133 | 2024 年同年度薪資整理，來源混合已公開與作者估值，**並非全部官方確認** |
| `game_estimate` | 322 | 缺少月薪的遊戲估值；依出賽／打數／投球局數保守模擬，低於 7 萬採 7 萬，部分高額複數年合約另以總額合理推估 |

註：張育成（160 萬）、張奕（38 萬）、吳念庭（78 萬）是**遊戲推估月薪**，不是已公布的固定月薪，合約總額包含激勵獎金。除以上三人外，部分球員的計算也會因資料缺漏而保守低估。

薪資及選秀來源：
- https://www.cna.com.tw/news/aspt/202404030321.aspx
- https://www.tsghawks.com/台鋼雄鷹第三代鷹雄入陣-2024選秀6好手全數加盟/
- https://www.ptt.cc/bbs/Baseball/M.1712154892.A.B43.html
- https://tsna.com/article/91499
- https://www.cna.com.tw/news/aspt/202406300170.aspx
- https://www.cna.com.tw/news/aspt/202407130111.aspx
- https://www.taisounds.com/news/content/102/133467
- https://cpblstats.com/2024-cpbl-draft-results-signing-tracker/

本次只更動 2024 起始球員薪資（既有非零薪資未自動覆蓋）、2024 新秀名單與附屬資料，GM 與正式聯盟的玩家身分／賽事／交易權限仍然隔離。

## 介面風格

`src/ui/dynasty.css` 定義 Clubhouse 2.0：深色球場照明、隊色徽章、遊戲型對戰 HUD、球員市場與薪資控制台。手機保持單屏主區、清單區自行捲動。
