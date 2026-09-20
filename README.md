# Portfolio & P&L Tracker

A comprehensive React-based application for tracking stock and options portfolios, calculating Realized Profit & Loss (P&L), and monitoring Net Asset Value (NAV). The app is designed to work seamlessly with Excel files for data import and export, making it easy to manage trading history and analyze performance.

## Features

- **Dashboard Overview**: View high-level portfolio metrics including Total Value, Cash Position, Day's P&L, and overall performance.
- **Transaction Management**: Track stock and options trades (Buy, Sell, Short, Cover) with details like price, shares, commission, and execution dates.
- **Realized P&L Calculation**: Automatically calculates realized profit and loss from matched buy and sell transactions.
- **NAV Tracking**: Monitor Net Asset Value over time, including AUM, shares, and cumulative returns.
- **Historical Analysis**: Analyze past performance with the History Dashboard.
- **Permanent Trading History Ledger**: Preserve executions after Holdings records are paired into realized P&L, with standalone Excel import/export and date-range filtering.
- **Trade Event Allocations**: Inspect the audit links between original broker executions and the buy/sell legs used in realized P&L without splitting the raw Trading History rows.
- **Excel Integration**: Import and export data (Lookup, Transactions, Options, Trading History, Trade Event Allocations, P&L, NAV) directly to and from Excel files (`.xlsx`). Full snapshots use the `TradeTracker_Record_YYYYMMDD.xlsx` naming convention.
- **Browser Persistence**: Core data is saved in `localStorage`; the larger Trading History ledger is stored in IndexedDB.
- **Multi-Currency Support**: Handles different markets (US, HK, SG, AUS) with configurable exchange rates to standardize metrics into USD.

## App Structure

The application is built using React, TypeScript, and Tailwind CSS.

- `src/App.tsx`: The main application component. It manages the global state (using `localStorage` for persistence) and handles navigation between different tabs (Summary, Lookup, Transactions, P&L, History, NAV).
- `src/components/`: Contains all the modular UI components:
  - `SummaryCards.tsx`: Displays top-level portfolio metrics.
  - `SummaryDashboard.tsx`: Detailed portfolio breakdown and charts.
  - `StockTable.tsx`: Displays current stock holdings and lookup data.
  - `TransactionTable.tsx`: Manages the ledger of stock and option trades.
  - `TradeEventsTable.tsx`: Displays and imports/exports the permanent execution ledger.
  - `TradingHistoryWorkspace.tsx`: Switches between the permanent Trading History and P&L allocation audit views.
  - `TradeEventAllocationsTable.tsx`: Displays allocation links, filters, and missing-event checks.
  - `PnLTable.tsx`: Shows realized profit and loss records with advanced filtering.
  - `HistoryDashboard.tsx`: Visualizes historical trading performance.
  - `NavDashboard.tsx`: Tracks and displays Net Asset Value data.
  - `FileUpload.tsx`: Handles Excel file uploads.
- `src/services/excelService.ts`: The core business logic layer. It handles parsing incoming Excel files, matching trades to calculate P&L, performing portfolio analysis, and generating Excel files for export.
- `src/types.ts`: Defines the TypeScript interfaces and constants used throughout the application, ensuring type safety.

## Data Structure

The application relies on several core data models defined in `src/types.ts`:

### `StockData` (Lookup Data)
Contains fundamental data about tracked assets.
- `ticker`, `companyName`, `market`
- `closePrice`, `marketCap`, `peTTM`, `pb`, `dividendYield`, `roeTTM`, `psQuantile`
- Classification fields: `type`, `category`, `class`, `isChinese`

### `TransactionData`
Records individual trading actions.
- `id`, `stock`, `name`, `market`
- `action` (e.g., Buy, Sell), `price`, `shares`, `date`, `commission`, `total`
- Option specific: `option` (Call/Put), `expiration`, `strike`, `exercise`

### `PnLData`
Represents a completed trade cycle (buy and sell) and its resulting profit or loss.
- `stock`, `name`, `market`, `quantity`
- Buy details: `buyDate`, `buyPrice`, `buyComm`, `totalBuy`
- Sell details: `sellDate`, `sellPrice`, `sellComm`, `totalSell`
- Results: `realizedPnL`, `returnPercent`, `holdingDays`
- Target Metrics: `tgtProfitCost`, `tgtProfitSales`, `tgtLossCost`, `tgtLossSales` (calculated based on user-defined target percentages)

### `TradeEventData`
Retains every stock and option execution independently of its current Holdings/P&L state.
- Execution fields inherited from `TransactionData`
- `assetType`, `recordStatus`, `eventOrigin`
- Optional P&L and split lineage fields

### `TradeEventAllocationData`
Links part or all of a raw trade event to one realized P&L leg.
- `tradeEventId`, `pnlId`, `pnlTradeNumber`, `leg`
- Allocated price, shares, commission, and total
- Allocation source and audit date

### `NavData`
Tracks the fund's performance over time.
- `date`, `aum`, `nav1`, `cumulativeReturn`, `shares`, `nav2`

### `MarketConstants`
Stores global settings.
- `date` (Current tracking date)
- Exchange rates: `exg_rate` (HKD), `aud_exg` (AUD), `sg_exg` (SGD)

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

### Usage
1. **Initial Setup**: Go to the Settings/Summary tab to configure your exchange rates and cash position.
2. **Import Data**: Use the "Upload" button to import your existing Excel tracking sheets. The app expects specific column headers (mapped in `types.ts`).
3. **Manage Trades**: View and edit your transactions in the "Transactions" tab.
4. **Analyze Performance**: Check the "Realized P&L" and "History" tabs to review your trading performance.
5. **Trading History**: Inspect raw trade events and switch to the P&L Allocations view to audit each linked buy/sell leg.
6. **Export**: Use "Export All Data" to download a dated `TradeTracker_Record_YYYYMMDD.xlsx` snapshot.

The built application has no runtime API, model, font, CDN, or webpage dependency. All application code and styles are bundled locally; Excel files and browser storage remain the only data inputs.

## Technologies Used
- **React 18**: UI Library
- **TypeScript**: Static typing
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Iconography
- **XLSX (SheetJS)**: Excel file parsing and generation
- **Recharts**: Data visualization and charting
