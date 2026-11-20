# FPGA Web Simulator — 全面 Bug 盤點報告 (`BUG_REPORT.md`)

**盤點日期：** 2026-11-19  
**檢查分支 / 版本：** `main` (`8229ed709a4b10c6e007bad17e20dabaa9d14277`) — 已部署於 `https://tim941008.github.io/fpga-web-simulator/`  
**盤點範圍：** 前端主流程（`App.tsx`）、硬體配置與持久化（`HardwareConfigPanel.tsx` / `configPersistence.ts` / `hardwareMapping.ts` / `matrixMapping.ts`）、模擬與時脈控制（`ClockControls.tsx` / `simulationEngine.ts` / `fpgaRuntime.ts`）、面板與顯示元件（`BoardView.tsx` / `SevenSegmentDisplay.tsx` / `MatrixViewer.tsx` / `SignalMonitor.tsx` / `ProjectExplorer.tsx`）、Verilog 前置解析（`verilogParser.ts`）與 Verilator Worker（`verilator-worker.js`）。

---

## 總覽統計

| 嚴重等級 | 數量 | 編號 |
|---|---:|---|
| **Critical（嚴重 — 破壞預設頁面或核心功能）** | 1 | `BUG-01` |
| **High（高 — 明顯功能異常、狀態不同步或設定無效）** | 4 | `BUG-02` ~ `BUG-05` |
| **Medium（中 — UI 一致性、跨裝置操作、驗證遺漏或邊界錯誤）** | 8 | `BUG-06` ~ `BUG-13` |
| **Low（低 — 體驗瑕疵、效能微耗或提示不足）** | 4 | `BUG-14` ~ `BUG-17` |
| **合計** | **17** | — |

---

## Critical

### BUG-01：全域 `localStorage` 硬體配置污染預設頁面（重整後預設範例直接壞掉）
- **現象（使用者回報實例）：**
  ```text
  System Clock (signalName): signal "clk" does not exist in active Verilog module.
  16×16 LED Matrix (row.signalName): signal "col" does not exist in active Verilog module.
  16×16 LED Matrix (col.signalName): signal "col" does not exist in active Verilog module.
  ```
  重整網頁載入預設範例 `top_fpga_demo` 後，畫面卻套用先前上傳自訂專案（如 `game.sv`）時修改的 `clk` / `col` 硬體綁定，導致預設頁面的 `Run Clock` / `Step Cycle` / `Step Edge` 全部反灰停用、16×16 Matrix 斷線，看起來像預設網頁壞掉。
- **影響檔案：** `src/App.tsx`（L109–116）、`src/config/configPersistence.ts`
- **根因：** `projectFiles` 不會持久化（每次重整必定回到 Preset 1 `top_fpga_demo`），但 `hardwareConfig` 卻全域儲存在單一 `localStorage` key (`web_fpga_sim_hardware_config_v1`) 且啟動時直接載入覆蓋預設 Preset 的硬體配置，未比對 `topModule` 或區分「預設範例」與「自訂專案」。
- **建議修復：**
  1. 啟動時若載入的 `hardwareConfig` 與預設 `top_fpga_demo` 發生任何 `MISSING_SIGNAL`（例如 `CLOCK_50` 不匹配），自動回退至 `SAMPLE_PRESETS[0].createHardwareConfig()`（或依 `topModule` 分開儲存配置）。
  2. 在驗證警示橫幅直接提供「一鍵還原預設硬體配置」按鈕。

---

## High

### BUG-02：`parseVerilogSource()` 忽略 `selectedTop`，編譯失敗時 Port 列表錯亂
- **影響檔案：** `src/App.tsx`（L169）、`src/parsers/verilogParser.ts`（L68–94）
- **現象：** 當專案包含多個 module 且 Verilator 編譯失敗（`runtimePorts === null`）時，`HardwareConfigPanel` 下拉選單的 port 列表會改用 `parseVerilogSource(verilogOnlyContents)` 的結果，但該函式未接收 `topModule`，會自行猜測一個 top module，可能與使用者選定的 `Top Module` 不同，導致出現錯誤的 port 選項或遺漏 `clk` / `row` / `col`。
- **建議修復：** `parseVerilogSource(sources, preferredTopModule?)` 接收 `topModule`，優先解析指定 module 的 ports。

### BUG-03：`SimulationEngine` 閉包過期與 `Cycle` 計數器左右不同步
- **影響檔案：** `src/App.tsx`（L296–326, L424–466）、`src/components/ClockControls.tsx`（L114, L233）
- **現象：**
  1. **左右 Cycle 數字不同步：** 按 `Step Cycle` / `Step Edge` 時，只更新 `cycleCount`（左側顯示 `Cycle #5`）與 `engine.setCycle()`，**沒有更新 `engineStats`**，導致右側統計區仍顯示 `Cycle: 0`。
  2. **執行中修改硬體設定無效：** `startRun()` 將 `activeMatrixConfig` 與 `clkName` 寫死在 `sampleRef.current` / `stepRef.current` 閉包中；執行或暫停期間修改 Matrix 極性、bit order、POV 或 Clock 訊號不會生效。
  3. **暫停狀態下的按鈕不一致：** 模擬 `paused` 時，Batch 按鈕（`10 / 100 / 1k / 10k / 100k`）在 UI 上仍可點擊，但 `handleRunBatch()` 內直接 `return` 毫無反應；於 batch 暫停時按 `Step Cycle` 亦未遞減 `engine.remaining`。
- **建議修復：** 單步執行時同步呼叫 `setEngineStats(engine.stats())`（或統一單一來源）；`sampleRef` 改讀 `hardwareConfigRef.current`；`paused` 時停用 Batch 按鈕。

### BUG-04：`ClockComponentConfig.polarity`（Active-Low）與 `defaultHz` 完全無效
- **影響檔案：** `src/sim/fpgaRuntime.ts`（`makeCycleStepper`）、`src/App.tsx`（`stepFullCycle`, `stepHalfCycle`）、`src/components/HardwareConfigPanel.tsx`
- **現象：** 使用者可在 Hardware Config 將 Clock 設為 `Active-Low`，且 schema 中存有 `defaultHz`，但 `makeCycleStepper()` 與單步控制一律固定輸出 `1 → 0`（Active-High），`defaultHz` 也從未套用到 `rateHz`。
- **建議修復：** 將 `activeClockConfig.polarity` 傳入 `makeCycleStepper` 與單步函式（Active-Low 時脈為 `0 → 1`、靜止於 `1`），並在切換 preset 時依 `defaultHz` 初始化 `rateHz`（或移除未使用的 `defaultHz` 欄位）。

### BUG-05：內建多檔範例立即報 4–6 個硬體配置錯誤，且「還原預設」會還原錯 Preset
- **影響檔案：** `src/presets/exampleProjects.ts`、`src/App.tsx`（L592–597, L660–704）
- **現象：**
  1. 4 個多檔範例（`Example 1: SW to LED`、`Example 2: Counter` 等）全部共用 `createFullDemoHardwareConfig()`，選取 Example 1 或 Example 2 後立即冒出 4–6 個 `MISSING_SIGNAL` 錯誤。
  2. 選取多檔範例或自行上傳檔案後，上方 Preset 下拉選單仍停留在舊的單檔 Preset 名稱，點擊 Hardware Config 的「還原預設配置」會還原成舊 Preset 的設定。
- **建議修復：** 為每個 `ExampleProject` 提供對應其 port 的專屬 `createHardwareConfig()`，並追蹤當前專案來源（`preset` / `example` / `custom`）。

---

## Medium

### BUG-06：Warm FPGA Lab 主題未完整套用至所有子面板（配色割裂）
- **影響檔案：** `src/components/HardwareConfigPanel.tsx`、`src/components/MatrixViewer.tsx`、`src/components/ProjectExplorer.tsx`、`src/App.tsx`
- **現象：** Phase C.2 將 `App`、`ClockControls`、`BoardView`、`SignalMonitor` 改為暖琥珀色系（Amber/Orange/Slate），但 `HardwareConfigPanel`（L150, L162, L203, L485, L567）、`MatrixViewer` 與 `ProjectExplorer` 仍硬編碼 `emerald` / `cyan` / `indigo`，且未接收 `theme` prop，切換 `FPGA Lab` / `Classic` 時視覺割裂。
- **建議修復：** 將 `theme={uiTheme}` 傳入上述三個元件並統一外框/按鈕色系（保留 LED / 7-Seg / Matrix 硬體發光原色）。

### BUG-07：雙語介面（繁體中文 / English）嚴重缺漏
- **影響檔案：** `src/components/ProjectExplorer.tsx`、`src/components/ClockControls.tsx`、`src/components/SignalMonitor.tsx`、`src/App.tsx`、`src/i18n/translations.ts`
- **現象：** 切換為「繁體中文」後，Phase C.1 與 C.2 所有新增控制項仍硬編碼英文，包括 `Multi-file examples...`、`Folder`、`ZIP`、`Top:`、`Stop`、`Resume`、`Unlimited (max speed)`、`Cycle / Speed / Elapsed`、`Add files / Add folder / Add ZIP`、`Digital Logic Workbench`、`FPGA Lab`、`Visible Signals`、`Showing X of Y signals`。
- **建議修復：** 將上述字串全部納入 `src/i18n/translations.ts` 的 `en` 與 `zh-TW` 字典。

### BUG-08：可新增多個 `MATRIX` 或 `CLOCK` 元件，但畫面上靜默忽略第二個以上
- **影響檔案：** `src/App.tsx`（L180–200）、`src/components/HardwareConfigPanel.tsx`
- **現象：** Hardware Config 允許使用者點擊 `+ MATRIX` 或 `+ CLOCK` 新增多個元件，但 `App.tsx` 僅使用 `.find(...)` 取第一個啟用中的 `CLOCK` 與 `MATRIX`，其餘啟用中的元件完全不會顯示或驅動，也無任何提示。
- **建議修復：** Board 分頁渲染所有啟用中的 `MATRIX` 元件（或在 UI 中提示／限制同時僅能啟用 1 個 `CLOCK` 與 1 個 `MATRIX`）。

### BUG-09：`configPersistence.ts` 反序列化驗證不完整，損毀的 JSON 可能導致畫面崩潰
- **影響檔案：** `src/config/configPersistence.ts`（`isValidComponent`）
- **現象：** `isValidComponent()` 未檢查 `SEVEN_SEGMENT` 的 `segmentMap`、`KEY` 的 `initialPressed` / `behavior`，也未檢查 `MATRIX` 的 `row.width` / `col.width` 是否為有效數字；若 `localStorage` 資料部分缺欄，會通過檢查並在渲染 `SevenSegmentDisplay` 或 `BoardView` 時拋出 `TypeError`。
- **建議修復：** 依各元件型別補齊完整欄位型別與範圍驗證，異常時安全回退預設值。

### BUG-10：重複輸入訊號綁定無警告，且 7-Segment 的 `bitOrder` 為無效死選項
- **影響檔案：** `src/config/hardwareMapping.ts`、`src/components/HardwareConfigPanel.tsx`（L314–333）、`src/components/SevenSegmentDisplay.tsx`
- **現象：**
  1. 兩個 `SWITCH` 或 `KEY` 綁定到同一個 Verilog input port 時，`validateHardwareConfig()` 不會發出警告，初始化時後者靜默覆蓋前者。
  2. `HardwareConfigPanel` 為 `SEVEN_SEGMENT` 顯示 `Bit Order (MSB → LSB / LSB → MSB)` 下拉選單，但 `SevenSegmentDisplay.tsx` 完全沒讀取 `bitOrder`（改了沒有任何效果）。
- **建議修復：** 新增 `DUPLICATE_INPUT_BINDING` 警告；對 `SEVEN_SEGMENT` 隱藏未使用的 `bitOrder` 控制項。

### BUG-11：Push Button (`KEY`) 的 Momentary 模式不支援觸控裝置與鍵盤操作
- **影響檔案：** `src/components/BoardView.tsx`（L344–364）
- **現象：** `KEY` 按鈕僅綁定 `onMouseDown` / `onMouseUp` / `onMouseLeave`，在觸控螢幕（平板／觸控筆電）或鍵盤 `Space` / `Enter` 聚焦操作時無法正常按下或放開。
- **建議修復：** 改用 Pointer Events（`onPointerDown` / `onPointerUp` / `onPointerCancel`）並補上 `onKeyDown` / `onKeyUp` 支援。

### BUG-12：Verilator Worker 每次編譯重配 64 MB–1 GB WASM 記憶體、無逾時機制、檔名正規化導致錯誤高亮失效
- **影響檔案：** `public/verilator/verilator-worker.js`（L69, L78）、`src/sim/fpgaRuntime.ts`、`src/components/ProjectExplorer.tsx`
- **現象：**
  1. 每次自動編譯（450 ms debounce）都重新建立 `new WebAssembly.Memory({ initial: 1024, maximum: 16384 })` 且 `noExitRuntime: true`，長時間編輯或 Safari 瀏覽器容易記憶體飆升／OOM。
  2. `runVerilator()` 無逾時與中止機制，遇到異常程式碼卡死時編譯指示器會永遠轉圈。
  3. 檔名含空白或非 ASCII 字元時，`verilator-worker.js` 會轉成 `_`（如 `my_file.v`），回傳的錯誤檔名與 `ProjectFile.name` 不符，導致 `ProjectExplorer` 無法標紅對應檔案。
- **建議修復：** 建立 `safePath -> originalName` 對照表還原錯誤檔名；在 `fpgaRuntime.ts` 加入編譯逾時（如 30 秒）並重建 worker；調降合理 `maximum` 上限。

### BUG-13：`fpgaRuntime.ts` 殘留硬編碼測試檔 `rom_init.hex`、丟棄 `@addr`、`inout` 誤判與 >64-bit 靜默忽略
- **影響檔案：** `src/sim/fpgaRuntime.ts`（L142–146, L196–210）
- **現象：**
  1. 正式程式碼硬編碼 `memFiles.set('rom_init.hex', 'A5\n5A\nF0\n0F')`，若使用者忘記上傳 `rom_init.hex` 會靜默載入假資料。
  2. `normalizeMemContent` 直接濾除 `@address` 位址指示（`!t.startsWith('@')`），破壞含位址偏移的 `$readmemh` / `$readmemb` 檔案。
  3. `inout` port（同時 `isInput && isOutput`）被誤歸類為 `'input'`。
  4. 超過 64-bit 的 port 直接 `continue` 略過，未在編譯橫幅發出任何警告。
- **建議修復：** 移除硬編碼 `rom_init.hex`；正確處理 `@addr`；將 `isInput && isOutput` 標為 `'inout'`；對 >64-bit port 發出明確警告訊息。

---

## Low

### BUG-14：16×16 Matrix POV 視覺暫留衰減速度隨模擬頻率劇烈漂移
- **影響檔案：** `src/config/matrixMapping.ts`（`sampleLiveMatrixIntoBuffer`）
- **現象：** 每次取樣呼叫即乘上 `0.96`（未依實際經過時間或 frame 間隔計算），導致 10 Hz、1 kHz 與 Unlimited（stride 61）下矩陣亮度與殘影表現完全不一致。
- **建議修復：** 改以 frame 時間差 `dt` 計算指數衰減。

### BUG-15：`SimulationEngine` 低頻（1 Hz）每秒空轉 250 次計時器且未關閉 `MessageChannel`
- **影響檔案：** `src/sim/simulationEngine.ts`（L55–72, L297）
- **現象：** `rate` 模式固定 `scheduleTick(4)`，1 Hz 時 99.6% 的喚醒皆執行 0 cycle；且 `MessageChannel` 未提供 `dispose()` 關閉 port。
- **建議修復：** 依目標頻率動態調整 delay（如 `Math.min(25, Math.max(4, Math.floor(500 / mode.hz)))`）並新增 `dispose()`。

### BUG-16：Verilator `BLKLOOPINIT` 錯誤訊息容易誤導使用者改用阻塞賦值 `=`
- **影響檔案：** `src/sim/fpgaRuntime.ts`
- **現象：** Verilator 4.205 原生訊息寫 `(non-delayed is ok - see docs)`，容易誤導學生在 `always @(posedge clk)` 內把 `<=` 改成 `=`（造成同一個 clock 邊緣的模擬與合成不一致 race condition）。
- **建議修復：** 偵測 `BLKLOOPINIT` 錯誤時，附加友善提示建議改用 `generate for` 結構化展開（而非將 `<=` 改為 `=`）。

### BUG-17：`HardwareConfigPanel` 修改 Matrix 寬度時清空輸入框會立刻跳回 `16`
- **影響檔案：** `src/components/HardwareConfigPanel.tsx`（L514, L596）
- **現象：** `onChange` 寫 `Number(e.target.value) || 16`，當使用者按 Backspace 清空數字想輸入 `8` 時，欄位會瞬間彈回 `16`，難以編輯。
- **建議修復：** 允許輸入過程暫存字串並於 `onBlur` 時再 clamp 至 `[1, 16]`（或使用受控步進控制）。

---

## 建議優先修復順序

1. **立即修復（影響預設頁面可用性）：** `BUG-01`（`localStorage` 污染預設頁）、`BUG-02`（`parseVerilogSource` 忽略 `selectedTop`）、`BUG-03`（Cycle 不同步與閉包過期）、`BUG-05`（多檔範例初始報錯與還原錯 Preset）。
2. **次優先（功能完整性與 UX）：** `BUG-04`（Clock polarity）、`BUG-06`（Warm Lab 主題補齊）、`BUG-07`（繁體中文補齊）、`BUG-09`（persistence 驗證防崩潰）、`BUG-11`（觸控／鍵盤按鍵）。
3. **後續強化：** `BUG-08`、`BUG-10`、`BUG-12` ~ `BUG-17`。

---

## 修復與驗證總表（2026-11-20 更新）

| Bug | 嚴重等級 | 狀態 | Commit (`feature/c2-wave-theme`) | 修復摘要 |
|---|---|---|---|---|
| `BUG-01` | Critical | ✅ Resolved | `c91a50a` | 以 `(projectOrigin, files, topModule)` 隔離 scoped `localStorage` 並安全回退預設配置 |
| `BUG-02` | High | ✅ Resolved | `88213fe` | `parseVerilogSource(sources, preferredTopModule)` 優先解析使用者選定的 `topModule` |
| `BUG-03` | High | ✅ Resolved | `c0a3926` | 單步同步 `engineStats`、移除 `startRun()` 過期閉包、`paused` 時停用 Batch 並遞減 `remaining` |
| `BUG-04` | High | ✅ Resolved | `4c50bbc` | `makeCycleStepper()`、單步控制與初始輸入全面支援 Active-Low 時脈與 `defaultHz` |
| `BUG-05` | High | ✅ Resolved | `7d39e44` | 4 個多檔範例採用 `createBoardConfigForSignals()` 專屬配置並同步下拉選單狀態 |
| `BUG-06` | Medium | ✅ Resolved | `b955273` | 將 `theme={uiTheme}` 套用至 `HardwareConfigPanel`、`MatrixViewer`、`ProjectExplorer`、`TopModuleSelector` |
| `BUG-07` | Medium | ✅ Resolved | `b955273` | 補齊 `en` 與 `zh-TW` 全部 Phase C.1/C.2 缺漏翻譯並新增字典完整性測試 |
| `BUG-08` | Medium | ✅ Resolved | `c363898` | 新增 `MULTIPLE_ACTIVE_CLOCKS` 與 `MULTIPLE_ACTIVE_MATRICES` 驗證警示明確提示 |
| `BUG-09` | Medium | ✅ Resolved | `c363898` | 強化 `configPersistence.ts` `isValidComponent()` 全型別欄位與範圍驗證 |
| `BUG-10` | Medium | ✅ Resolved | `c363898` | 新增 `DUPLICATE_INPUT_BINDING` 警告並對 `SEVEN_SEGMENT` 隱藏無效 `bitOrder` |
| `BUG-11` | Medium | ✅ Resolved | `1cb9736` | `BoardView` Push Button 改用 Pointer Events 並補齊 `Space`/`Enter` 鍵盤與 `onBlur` 釋放 |
| `BUG-12` | Medium | ✅ Resolved | `cb3144e` | Worker 還原正規化檔名、WASM 記憶體上限調降為 256 MB、`runVerilator()` 新增 30 秒逾時重建 |
| `BUG-13` | Medium | ✅ Resolved | `cb3144e` | 移除硬編碼 `rom_init.hex`、展開 `@addr` 偏移、正確歸類 `inout`、對 >64-bit port 發出警告 |
| `BUG-14` | Low | ✅ Resolved | `1cb9736` | `sampleLiveMatrixIntoBuffer()` 改用時間差 `dtMs` 指數衰減維持跨頻率一致 POV |
| `BUG-15` | Low | ✅ Resolved | `c0a3926` | `rate` 模式改用動態延遲（1 Hz 降至 25 ms）並新增 `SimulationEngine.dispose()` 關閉 `MessageChannel` |
| `BUG-16` | Low | ✅ Resolved | `cb3144e` | 偵測 `BLKLOOPINIT` 時附加友善提示建議使用 `generate for`（避免誤改為阻塞賦值 `=`） |
| `BUG-17` | Low | ✅ Resolved | `c363898` | Matrix 寬度輸入改用 `ClampedNumberInput` 允許清空重打並於 `onBlur` clamp 至 `[1, 16]` |
