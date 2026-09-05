import { PnLData, TradeEventData, TradeEventRecordStatus, TransactionData } from '../types';

const isOptionPnl = (record: PnLData): boolean =>
  !!record.option && /call|put/i.test(record.option);

export const transactionToTradeEvent = (
  transaction: TransactionData,
  assetType: TradeEventData['assetType'],
  overrides: Partial<TradeEventData> = {},
): TradeEventData => ({
  ...transaction,
  assetType,
  recordStatus: 'Recorded',
  eventOrigin: 'Transaction',
  ...overrides,
});

const pnlLegToTradeEvent = (
  record: PnLData,
  leg: 'buy' | 'sell',
  id: string,
): TradeEventData => {
  const isBuy = leg === 'buy';
  const option = isOptionPnl(record);
  const price = isBuy ? record.buyPrice : record.sellPrice;
  const commission = isBuy ? record.buyComm : record.sellComm;
  const total = isBuy ? record.totalBuy : record.totalSell;

  return {
    id,
    assetType: option ? 'Option' : 'Stock',
    recordStatus: 'Recorded',
    eventOrigin: 'P&L Reconstruction',
    linkedPnlId: record.id,
    linkedPnlTradeNumber: record.tradeNumber,
    stock: record.stock,
    name: record.name || record.stock,
    market: record.market || '',
    action: isBuy ? 'Buy' : 'Sell',
    price: price || 0,
    shares: record.quantity || 0,
    date: (isBuy ? record.buyDate : record.sellDate) || '',
    commission: commission || 0,
    total: total || 0,
    source: record.account || '',
    lastPrice: 0,
    lastMv: 0,
    option: record.option || '',
    expiration: record.expiration || '',
    strike: record.strike || 0,
    exercise: option ? record.optionAction : undefined,
    assignmentType: record.assignmentType,
    assignmentSource: record.assignmentSource,
    linkedOptionTransactionIds: record.linkedOptionTransactionIds,
    linkedOptionPnlId: record.linkedOptionPnlId,
    linkedOptionPnlTradeNumber: record.linkedOptionPnlTradeNumber,
    assignmentDate: record.assignmentDate,
  };
};

export const pnlToTradeEvents = (record: PnLData): TradeEventData[] => {
  const optionIds = record.linkedOptionTransactionIds || [];
  const buyId = record.buyTransactionId || optionIds[0] || `trade-event-${record.id}-buy`;
  const sellId = record.sellTransactionId || optionIds[1] || `trade-event-${record.id}-sell`;
  return [
    pnlLegToTradeEvent(record, 'buy', String(buyId)),
    pnlLegToTradeEvent(record, 'sell', String(sellId)),
  ];
};

export const buildTradeEventsFromData = (
  transactions: TransactionData[],
  optionTransactions: TransactionData[],
  pnlData: PnLData[],
): TradeEventData[] => [
  ...transactions.map(transaction => transactionToTradeEvent(transaction, 'Stock')),
  ...optionTransactions.map(transaction => transactionToTradeEvent(transaction, 'Option')),
  ...pnlData.flatMap(pnlToTradeEvents),
];

const normalizeText = (value: unknown): string => String(value || '').trim().toLowerCase();
const normalizeAction = (value: unknown): string => {
  const action = normalizeText(value);
  if (action.startsWith('buy')) return 'buy';
  if (action.startsWith('sell')) return 'sell';
  return action;
};
const nearlyEqual = (left: unknown, right: unknown): boolean =>
  Math.abs((Number(left) || 0) - (Number(right) || 0)) < 0.000001;

/**
 * Older/manual Excel files may not carry transaction IDs. In that case use a
 * deliberately strict one-to-one execution signature so we can add the P&L
 * link without risking a loose ticker-only match.
 */
const matchesReconstructedPnlLeg = (candidate: TradeEventData, reconstructed: TradeEventData): boolean => {
  if (candidate.eventOrigin === 'P&L Reconstruction') return false;
  if (candidate.recordStatus !== 'Recorded') return false;
  if (candidate.linkedPnlId && candidate.linkedPnlId !== reconstructed.linkedPnlId) return false;
  if (candidate.assetType !== reconstructed.assetType) return false;
  if (normalizeText(candidate.stock) !== normalizeText(reconstructed.stock)) return false;
  if (String(candidate.date || '').slice(0, 10) !== String(reconstructed.date || '').slice(0, 10)) return false;
  if (normalizeAction(candidate.action) !== normalizeAction(reconstructed.action)) return false;
  if (!nearlyEqual(Math.abs(candidate.shares || 0), Math.abs(reconstructed.shares || 0))) return false;
  if (!nearlyEqual(candidate.price, reconstructed.price)) return false;
  if (candidate.market && reconstructed.market && normalizeText(candidate.market) !== normalizeText(reconstructed.market)) return false;
  if (candidate.source && reconstructed.source && normalizeText(candidate.source) !== normalizeText(reconstructed.source)) return false;

  if (candidate.assetType === 'Option') {
    if (normalizeText(candidate.option) !== normalizeText(reconstructed.option)) return false;
    if (String(candidate.expiration || '').slice(0, 10) !== String(reconstructed.expiration || '').slice(0, 10)) return false;
    if (!nearlyEqual(candidate.strike, reconstructed.strike)) return false;
  }
  return true;
};

/**
 * Upsert by event ID while preserving richer original executions when a P&L
 * record can only reconstruct a historical leg. P&L reconstruction still adds
 * the P&L linkage needed for review and filtering.
 */
export const mergeTradeEvents = (
  existing: TradeEventData[],
  incoming: TradeEventData[],
): TradeEventData[] => {
  const byId = new Map(existing.map(event => [String(event.id), event]));

  incoming.forEach(event => {
    const id = String(event.id);
    const current = byId.get(id);

    if (event.eventOrigin === 'P&L Reconstruction' && (!current || current.eventOrigin === 'P&L Reconstruction')) {
      const matchedExecution = Array.from(byId.values()).find(candidate =>
        String(candidate.id) !== id && matchesReconstructedPnlLeg(candidate, event));
      if (matchedExecution) {
        byId.set(String(matchedExecution.id), {
          ...matchedExecution,
          linkedPnlId: event.linkedPnlId || matchedExecution.linkedPnlId,
          linkedPnlTradeNumber: event.linkedPnlTradeNumber ?? matchedExecution.linkedPnlTradeNumber,
        });
        if (current?.eventOrigin === 'P&L Reconstruction') byId.delete(id);
        return;
      }
    }

    if (!current) {
      byId.set(id, event);
      return;
    }

    if (event.eventOrigin === 'P&L Reconstruction') {
      byId.set(id, {
        ...event,
        ...current,
        linkedPnlId: event.linkedPnlId || current.linkedPnlId,
        linkedPnlTradeNumber: event.linkedPnlTradeNumber ?? current.linkedPnlTradeNumber,
      });
      return;
    }

    const preserveAuditStatus = current.recordStatus === 'Deleted' || current.recordStatus === 'Superseded';
    byId.set(id, {
      ...current,
      ...event,
      recordStatus: preserveAuditStatus ? current.recordStatus : event.recordStatus,
    });
  });

  return Array.from(byId.values()).sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id)),
  );
};

export const markTradeEvents = (
  events: TradeEventData[],
  ids: string[],
  recordStatus: TradeEventRecordStatus,
): TradeEventData[] => {
  const idSet = new Set(ids.map(String));
  return events.map(event => idSet.has(String(event.id)) ? { ...event, recordStatus } : event);
};
