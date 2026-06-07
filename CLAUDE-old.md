# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on port 3000
npm run build    # Production build
npm run preview  # Preview production build
```

## Architecture

**Trade Tracker** is a single-page React + TypeScript app for portfolio and P&L tracking. All state is persisted to `localStorage` — there is no backend.

### Data Flow

```
Excel files / screenshots
    → FileUpload.tsx / geminiService.ts (parse)
    → excelService.ts (transform & calculate)
    → App.tsx (state via useState + localStorage)
    → Dashboard components (display)
```

### Key Files

- **`types.ts`** — All TypeScript interfaces (`TransactionData`, `PnLData`, `HoldingData`, `NavData`, `StockData`, `MarketConstants`) and constants (header maps, defaults).
- **`services/excelService.ts`** (~1200 lines) — Core business logic: Excel parsing, P&L calculation, portfolio analysis, and export. The `EXCEL_HEADER_MAP`, `TRANSACTION_HEADER_MAP` constants define flexible column-name matching for imported spreadsheets.
- **`App.tsx`** — Owns all application state. Reads/writes 7 `localStorage` keys (`trade_tracker_*`). Handles navigation between views and delegates file processing.
- **`components/SummaryDashboard.tsx`** (~55 KB) — Most complex component; renders P&L summary, winners/losers, holdings breakdown, and filtering.
- **`components/TransactionTable.tsx`** / **`PnLTable.tsx`** — Heavy components with inline editing, sorting, and filtering.

### State / localStorage Keys

| Key | Content |
|-----|---------|
| `trade_tracker_market_constants` | Date, exchange rates (HKD/SGD/AUD→USD) |
| `trade_tracker_lookup_data` | Fundamentals (PE, PB, dividend yield, etc.) |
| `trade_tracker_txn_data` | Stock transactions |
| `trade_tracker_option_txn_data` | Options transactions |
| `trade_tracker_pnl_data` | Matched trade P&L records |
| `trade_tracker_nav_data` | NAV/AUM snapshots over time |
| `trade_tracker_cash_pos` | Cash positions |

### P&L Matching

P&L records are created by pairing one open (buy/short) transaction with one closing (sell/cover) transaction. Matching can be done manually (user selects two rows) or semi-automatically via `excelService`. Options matching additionally validates strike, expiration, and option type.

### Multi-currency

All analytics normalize to USD using exchange rates stored in `MarketConstants`. Supported markets: US, HK, SG, AUS.
