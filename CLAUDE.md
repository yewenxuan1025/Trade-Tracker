# Trade Tracker — Claude Code Guide

## Tech Stack

- **React 19** + **TypeScript** + **Vite 6** + **Tailwind CSS**
- **recharts** v3.7.0 — BarChart, PieChart, Treemap, ComposedChart, ReferenceLine, Cell
- **SheetJS (xlsx)** — Excel parsing and generation
- **Lucide React** — icons
- All data persisted in `localStorage` (no backend)

## Project Structure

```
App.tsx                          # Global state, tab routing, file upload handlers
types.ts                         # All TypeScript interfaces + utility functions
services/excelService.ts         # Excel parse (parseExcelFile) + export (exportGlobalData)
components/
  SummaryDashboard.tsx           # Summary tab — Holdings Review, portfolio charts, metrics
  AnalyticsDashboard.tsx         # Analytics tab — donut charts, concentration risk, P&L ratio chart
  NavDashboard.tsx               # Daily NAV tab — heatmap, cumulative return, drawdown
  TransactionTable.tsx           # Transactions ledger
  PnLTable.tsx                   # Realized P&L table
  StockTable.tsx                 # Lookup / holdings table
  SummaryCards.tsx               # Top-level metric cards
  FileUpload.tsx                 # File upload dropzone
```

## Key Data Models (types.ts)

### `StockData` — Lookup sheet
`ticker`, `companyName`, `market`, `closePrice`, `marketCap`, `peTTM`, `pb`, `dividendYield`, `roeTTM`, `psQuantile`, `type`, `category`, `class`, `isChinese`

### `TransactionData`
`id`, `stock`, `name`, `market`, `action` (Buy/Sell/Short/Cover), `price`, `shares`, `date`, `commission`, `total`
Option fields: `option` (Call/Put), `expiration`, `strike`, `exercise`

### `PnLData`
`stock`, `name`, `market`, `quantity`, `buyDate`, `buyPrice`, `buyComm`, `totalBuy`, `sellDate`, `sellPrice`, `sellComm`, `totalSell`, `realizedPnL`, `returnPercent`, `holdingDays`
Target metrics: `tgtProfitCost`, `tgtProfitSales`, `tgtLossCost`, `tgtLossSales`

### `NavData`
`date`, `aum`, `nav1`, `cumulativeReturn`, `shares`, `nav2`

### `BenchmarkData` (`BenchmarkEntry[]`)
`date: string`, plus dynamic index columns (e.g. `HSI`, `SPX`). Parsed from a "Benchmark" sheet in the uploaded Excel.

### `MarketConstants`
`date`, `exg_rate` (HKD→USD), `aud_exg` (AUD→USD), `sg_exg` (SGD→USD)

## Utility Functions (types.ts)

### `padHkTicker(ticker, market?)`
Pads numeric HK tickers to 4 digits: `"297"` → `"0297"`. Applied at parse time in `excelService.ts` for all data types (transactions, P&L, stocks). Also applied on localStorage load in `App.tsx` for migration of pre-existing data.

```typescript
export const padHkTicker = (ticker: string, market?: string): string => {
  if (!ticker) return ticker;
  const m = (market || '').toUpperCase().trim();
  if (m === 'HK' && /^\d+$/.test(ticker) && ticker.length < 4) {
    return ticker.padStart(4, '0');
  }
  return ticker;
};
```

## Excel Service (excelService.ts)

### `parseExcelFile(file)`
Returns `ParseResult` which includes:
- `pnlData`, `transactions`, `optionTransactions`, `navData`, `stocks`, `constants`
- **`benchmark: BenchmarkData`** — parsed from a sheet named "benchmark", "benchmark indices", or any name starting with "benchmark" (case-insensitive)

Benchmark sheet format: first column = Date, remaining columns = index names (e.g. HSI, SPX).

### `exportGlobalData(pnlData, transactions, optionTransactions, navData, stocks, constants, benchmarkData)`
Exports all data to Excel. Sheets produced:
- `Transactions`, `Transactions_Option`
- `Realized_PnL`
- `Holdings_HK`, `Holdings_CCS`, `Holdings_US`, `Holdings_AUS`
- `NAV`
- `Lookup`
- **`Benchmark Indices`** — written if `benchmarkData` is non-empty

## Component Notes

### SummaryDashboard.tsx

**Holdings Review table** sits at the TOP of the Summary section (before Portfolio Overview).
- HK group sorted numerically: `parseInt(a.stock, 10) - parseInt(b.stock, 10)`
- Other markets sorted alphabetically with `localeCompare`
- Uses `table-fixed` + `<colgroup>` to control column widths and prevent Name column overflow

### NavDashboard.tsx

**P&L Heatmap** supports frequency selector: `weekly | monthly | quarterly | annual` (default: `monthly`).

`getNavFreqKey(dateStr, freq)`:
- **Always normalize date strings**: `dateStr.replace(/\//g, '-')` before `new Date(...)` to handle dates stored as `"2025/10/01"` (slashes). Without this, `substring(0,7)` would produce `"2025/10"` — a phantom row key.
- Year filter: `.filter(y => /^\d{4}$/.test(y))` prevents non-year keys from appearing as rows.

Heatmap colors: `rgba(239,68,68,...)` = profit (ret ≥ 0), `rgba(16,185,129,...)` = loss (ret < 0).

Heatmap has a click-to-enlarge lightbox (`fixed inset-0` overlay).

### AnalyticsDashboard.tsx

**Portfolio donut charts** — always normalize category keys to lowercase before grouping, then restore display name from a `nameMap`. This prevents case-mismatch double-counting (e.g. `"HK Stock"` vs `"HK stock"`).

Three donut charts: By Class, By Type, By Category (Turnaround/Cyclical/Value/Growth).

**`lookupStockMap`** — case-insensitive Map (`ticker.toUpperCase()`) for cross-referencing holdings to lookup classifications.

**Concentration Risk treemap** — click-to-enlarge lightbox. Default threshold: **5%** (not 10%).

**Cost vs Last Price chart (`PriceRatioChart`)** — vertical bars:
- X-axis = tickers (categorical), Y-axis = ratio (numeric)
- Red (`#ef4444`) = ratio ≥ 1 (profit), Green (`#10b981`) = ratio < 1 (loss)
- `<ReferenceLine y={1} />` (not `x={1}`)
- Horizontal scroll wrapper for many tickers
- 4 panels: HK, CCS, US, AUS

## Common Pitfalls

1. **Slash-delimited dates** — Dates from some Excel exports arrive as `"2025/10/01"`. Always call `.replace(/\//g, '-')` before `new Date()` or `substring()`.

2. **Case-insensitive category grouping** — Never group by raw string from lookup data; always `.toLowerCase()` the key, accumulate, then restore display name from a separate map.

3. **HK ticker padding** — Applied at parse time. If displaying tickers from localStorage loaded before this change was introduced, `padHkTicker` is re-applied on load in `App.tsx`.

4. **recharts vertical vs horizontal bars** — Default recharts `BarChart` is vertical (X=category, Y=value). Remove `layout="vertical"` and swap `XAxis`/`YAxis` to switch from horizontal to vertical. `ReferenceLine` uses `y=` for horizontal lines and `x=` for vertical lines.

5. **Treemap/chart lightbox** — Use `fixed inset-0 z-50 bg-black/80` overlay with a `ResponsiveContainer` inside an `800px × 600px` centered div. Always render the enlarged chart as a separate JSX tree, not the same ref.

## Dev Commands

```bash
npm run dev      # start dev server (localhost:5173)
npm run build    # production build
npx tsc --noEmit # type-check without emitting
```
