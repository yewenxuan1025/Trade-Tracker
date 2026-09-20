import {
  PnLData,
  TradeEventAllocationData,
  TradeEventAllocationLeg,
  TradeEventAllocationSource,
  TradeEventData,
  TradeEventRecordStatus,
  TransactionData,
} from '../types';

const isOptionPnl = (record: PnLData): boolean =>
  !!record.option && /call|put/i.test(record.option);

export const getRawTradeEventId = (transaction: TransactionData): string =>
  String(transaction.rawTradeEventId || transaction.id);

export const isSplitTransaction = (transaction: TransactionData): boolean =>
  !!transaction.rawTradeEventId && String(transaction.rawTradeEventId) !== String(transaction.id);

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
  includePnlReconstruction = true,
): TradeEventData[] => {
  const rawEvents = [
    ...transactions.filter(transaction => !isSplitTransaction(transaction)).map(transaction => transactionToTradeEvent(transaction, 'Stock')),
    ...optionTransactions.filter(transaction => !isSplitTransaction(transaction)).map(transaction => transactionToTradeEvent(transaction, 'Option')),
  ];

  return includePnlReconstruction ? mergeTradeEvents(rawEvents, pnlData.flatMap(pnlToTradeEvents)) : rawEvents;
};

const normalizeText = (value: unknown): string => String(value || '').trim().toLowerCase();
const normalizeAction = (value: unknown): string => {
  const action = normalizeText(value);
  if (action.startsWith('buy')) return 'buy';
  if (action.startsWith('sell')) return 'sell';
  return action;
};
const nearlyEqual = (left: unknown, right: unknown): boolean =>
  Math.abs((Number(left) || 0) - (Number(right) || 0)) < 0.000001;

const withinAllocationTolerance = (left: unknown, right: unknown, minimum: number): boolean => {
  const expected = Number(right) || 0;
  return Math.abs((Number(left) || 0) - expected) <= Math.max(minimum, Math.abs(expected) * 0.000001);
};

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

const allocationLegFromAction = (action: unknown): TradeEventAllocationLeg => (
  normalizeAction(action).startsWith('sell') ? 'Sell' : 'Buy'
);

const buildTradeAllocationId = (
  tradeEventId: string,
  pnlId: string,
  leg: TradeEventAllocationLeg,
): string => `trade-allocation-${tradeEventId}-${pnlId}-${leg.toLowerCase()}`;

const allocationFromValues = (
  tradeEventId: string,
  record: {
    stock: string;
    name?: string;
    market?: string;
    option?: string;
    expiration?: string;
    strike?: number;
    action: string;
    price?: number;
    shares?: number;
    commission?: number;
    total?: number;
    date?: string;
    source?: string;
  },
  pnl: Pick<PnLData, 'id' | 'tradeNumber'>,
  assetType: TradeEventData['assetType'],
  allocationSource: TradeEventAllocationSource,
): TradeEventAllocationData => {
  const leg = allocationLegFromAction(record.action);
  return {
    id: buildTradeAllocationId(String(tradeEventId), String(pnl.id), leg),
    tradeEventId: String(tradeEventId),
    pnlId: String(pnl.id),
    pnlTradeNumber: pnl.tradeNumber,
    assetType,
    leg,
    stock: record.stock,
    name: record.name || record.stock,
    market: record.market || '',
    option: record.option || '',
    expiration: record.expiration || '',
    strike: record.strike || 0,
    allocatedShares: Math.abs(Number(record.shares) || 0),
    allocatedPrice: Number(record.price) || 0,
    allocatedCommission: Number(record.commission) || 0,
    allocatedTotal: Number(record.total) || 0,
    allocationDate: record.date || '',
    source: record.source || '',
    allocationSource,
  };
};

export const transactionToTradeAllocation = (
  transaction: TransactionData,
  assetType: TradeEventData['assetType'],
  pnl: Pick<PnLData, 'id' | 'tradeNumber'>,
  allocationSource: TradeEventAllocationSource = 'P&L Pairing',
): TradeEventAllocationData => allocationFromValues(
  getRawTradeEventId(transaction),
  {
    ...transaction,
    action: transaction.action || 'Buy',
  },
  pnl,
  assetType,
  allocationSource,
);

const pnlLegToAllocation = (
  record: PnLData,
  leg: 'buy' | 'sell',
  tradeEventId: string,
  allocationSource: TradeEventAllocationSource,
): TradeEventAllocationData => {
  const isBuy = leg === 'buy';
  const option = isOptionPnl(record);
  return allocationFromValues(
    tradeEventId,
    {
      stock: record.stock,
      name: record.name || record.stock,
      market: record.market || '',
      option: record.option || '',
      expiration: record.expiration || '',
      strike: record.strike || 0,
      action: isBuy ? 'Buy' : 'Sell',
      price: isBuy ? record.buyPrice : record.sellPrice,
      shares: record.quantity || 0,
      commission: isBuy ? record.buyComm : record.sellComm,
      total: isBuy ? record.totalBuy : record.totalSell,
      date: isBuy ? record.buyDate : record.sellDate,
      source: record.account || '',
    },
    record,
    option ? 'Option' : 'Stock',
    allocationSource,
  );
};

export const pnlToTradeAllocations = (record: PnLData): TradeEventAllocationData[] => {
  const optionIds = record.linkedOptionTransactionIds || [];
  const buyId = record.buyTransactionId || optionIds[0] || `trade-event-${record.id}-buy`;
  const sellId = record.sellTransactionId || optionIds[1] || `trade-event-${record.id}-sell`;
  const hasSourceIds = Boolean(record.buyTransactionId || record.sellTransactionId || optionIds.length);
  const allocationSource: TradeEventAllocationSource = hasSourceIds ? 'P&L Pairing' : 'P&L Reconstruction';
  return [
    pnlLegToAllocation(record, 'buy', String(buyId), allocationSource),
    pnlLegToAllocation(record, 'sell', String(sellId), allocationSource),
  ];
};

export const tradeEventLinksToAllocations = (events: TradeEventData[]): TradeEventAllocationData[] =>
  events
    .filter(event => event.linkedPnlId)
    .map(event => allocationFromValues(
      String(event.parentEventId || event.id),
      {
        ...event,
        action: event.action || 'Buy',
      },
      { id: String(event.linkedPnlId), tradeNumber: event.linkedPnlTradeNumber },
      event.assetType,
      event.eventOrigin === 'P&L Reconstruction' ? 'P&L Reconstruction' : 'Legacy Link',
    ));

const remapAllocationToMatchingEvent = (
  allocation: TradeEventAllocationData,
  reconstructed: TradeEventData,
  candidateEvents: TradeEventData[],
): TradeEventAllocationData => {
  const directMatch = candidateEvents.find(event => String(event.id) === allocation.tradeEventId);
  const matchedExecution = directMatch || candidateEvents.find(event =>
    String(event.id) !== String(reconstructed.id) && matchesReconstructedPnlLeg(event, reconstructed));
  if (!matchedExecution) return allocation;
  return {
    ...allocation,
    id: buildTradeAllocationId(String(matchedExecution.id), allocation.pnlId, allocation.leg),
    tradeEventId: String(matchedExecution.id),
    allocationSource: matchedExecution.eventOrigin === 'P&L Reconstruction' ? 'P&L Reconstruction' : 'P&L Pairing',
  };
};

export const buildTradeAllocationsFromData = (
  transactions: TransactionData[],
  optionTransactions: TransactionData[],
  pnlData: PnLData[],
  tradeEvents: TradeEventData[] = [],
): TradeEventAllocationData[] => {
  const rawEventIdByTransactionId = new Map(
    [...transactions, ...optionTransactions].map(transaction => [
      String(transaction.id),
      getRawTradeEventId(transaction),
    ]),
  );
  const candidateEvents = mergeTradeEvents(
    tradeEvents,
    [
      ...transactions.filter(transaction => !isSplitTransaction(transaction)).map(transaction => transactionToTradeEvent(transaction, 'Stock')),
      ...optionTransactions.filter(transaction => !isSplitTransaction(transaction)).map(transaction => transactionToTradeEvent(transaction, 'Option')),
    ],
  );

  return mergeTradeAllocations(
    tradeEventLinksToAllocations(candidateEvents),
    pnlData.flatMap(record => {
      const reconstructed = pnlToTradeEvents(record);
      const allocations = pnlToTradeAllocations(record);
      return allocations.map((allocation, index) => {
        const rawEventId = rawEventIdByTransactionId.get(String(allocation.tradeEventId));
        const rawEvent = rawEventId
          ? candidateEvents.find(event => String(event.id) === String(rawEventId))
          : undefined;
        const normalizedAllocation = rawEvent && String(rawEvent.id) !== String(allocation.tradeEventId)
          ? {
              ...allocation,
              id: buildTradeAllocationId(String(rawEvent.id), allocation.pnlId, allocation.leg),
              tradeEventId: String(rawEvent.id),
              allocationSource: 'P&L Pairing' as TradeEventAllocationSource,
            }
          : allocation;
        return remapAllocationToMatchingEvent(normalizedAllocation, reconstructed[index], candidateEvents);
      });
    }),
  );
};

export const mergeTradeAllocations = (
  existing: TradeEventAllocationData[],
  incoming: TradeEventAllocationData[],
): TradeEventAllocationData[] => {
  const byId = new Map(existing.map(allocation => [String(allocation.id), allocation]));
  incoming.forEach(allocation => {
    const id = String(allocation.id);
    byId.set(id, { ...byId.get(id), ...allocation, id });
  });
  return Array.from(byId.values()).sort(
    (a, b) =>
      (a.allocationDate || '').localeCompare(b.allocationDate || '') ||
      String(a.pnlTradeNumber || '').localeCompare(String(b.pnlTradeNumber || '')) ||
      String(a.id).localeCompare(String(b.id)),
  );
};

const allocationFingerprint = (allocation: TradeEventAllocationData): string => [
  String(allocation.pnlId),
  allocation.leg,
  allocation.assetType,
  normalizeText(allocation.stock),
  normalizeText(allocation.market),
  normalizeText(allocation.option),
  String(allocation.expiration || '').slice(0, 10),
  (Number(allocation.strike) || 0).toFixed(8),
  String(allocation.allocationDate || '').slice(0, 10),
  normalizeText(allocation.source),
  (Number(allocation.allocatedShares) || 0).toFixed(8),
  (Number(allocation.allocatedPrice) || 0).toFixed(8),
  (Number(allocation.allocatedCommission) || 0).toFixed(8),
  (Number(allocation.allocatedTotal) || 0).toFixed(8),
].join('|');

const eventMatchesAllocation = (
  event: TradeEventData,
  allocation: TradeEventAllocationData,
): boolean => {
  if (event.eventOrigin === 'P&L Reconstruction' || event.recordStatus !== 'Recorded') return false;
  if (event.assetType !== allocation.assetType) return false;
  if (normalizeText(event.stock) !== normalizeText(allocation.stock)) return false;
  if (normalizeAction(event.action) !== normalizeAction(allocation.leg)) return false;
  if (String(event.date || '').slice(0, 10) !== String(allocation.allocationDate || '').slice(0, 10)) return false;
  if (!nearlyEqual(event.price, allocation.allocatedPrice)) return false;
  if (event.market && allocation.market && normalizeText(event.market) !== normalizeText(allocation.market)) return false;
  if (event.source && allocation.source && normalizeText(event.source) !== normalizeText(allocation.source)) return false;

  if (allocation.assetType === 'Option') {
    if (normalizeText(event.option) !== normalizeText(allocation.option)) return false;
    if (String(event.expiration || '').slice(0, 10) !== String(allocation.expiration || '').slice(0, 10)) return false;
    if (!nearlyEqual(event.strike, allocation.strike)) return false;
  }

  const eventShares = Math.abs(Number(event.shares) || 0);
  const allocatedShares = Math.abs(Number(allocation.allocatedShares) || 0);
  if (!eventShares || allocatedShares > eventShares + 0.000001) return false;

  const ratio = allocatedShares / eventShares;
  return withinAllocationTolerance(allocation.allocatedCommission, (Number(event.commission) || 0) * ratio, 0.01)
    && withinAllocationTolerance(allocation.allocatedTotal, (Number(event.total) || 0) * ratio, 0.05);
};

/**
 * Repair allocation references left behind by legacy transaction splitting.
 * Valid allocations always win over equivalent orphan rows. A remaining orphan
 * is remapped only when one raw execution matches its full proportional values
 * and still has enough unallocated shares.
 */
export const reconcileTradeAllocations = (
  allocations: TradeEventAllocationData[],
  events: TradeEventData[],
): TradeEventAllocationData[] => {
  if (allocations.length === 0 || events.length === 0) return allocations;

  const eventById = new Map(events.map(event => [String(event.id), event]));
  const byFingerprint = new Map<string, TradeEventAllocationData[]>();
  allocations.forEach(allocation => {
    const fingerprint = allocationFingerprint(allocation);
    byFingerprint.set(fingerprint, [...(byFingerprint.get(fingerprint) || []), allocation]);
  });

  const removedIds = new Set<string>();
  byFingerprint.forEach(group => {
    const linked = group.filter(allocation => eventById.has(String(allocation.tradeEventId)));
    if (linked.length > 0) {
      group
        .filter(allocation => !eventById.has(String(allocation.tradeEventId)))
        .forEach(allocation => removedIds.add(String(allocation.id)));
      return;
    }

    const hasLegacyLink = group.some(allocation => allocation.allocationSource === 'Legacy Link');
    if (hasLegacyLink) {
      group
        .filter(allocation => allocation.allocationSource === 'P&L Pairing')
        .forEach(allocation => removedIds.add(String(allocation.id)));
    }
  });

  const deduplicated = allocations.filter(allocation => !removedIds.has(String(allocation.id)));
  const allocatedSharesByEvent = new Map<string, number>();
  deduplicated.forEach(allocation => {
    const eventId = String(allocation.tradeEventId);
    if (!eventById.has(eventId)) return;
    allocatedSharesByEvent.set(
      eventId,
      (allocatedSharesByEvent.get(eventId) || 0) + Math.abs(Number(allocation.allocatedShares) || 0),
    );
  });

  let changed = removedIds.size > 0;
  const reconciled = deduplicated.map(allocation => {
    if (eventById.has(String(allocation.tradeEventId))) return allocation;

    const allocatedShares = Math.abs(Number(allocation.allocatedShares) || 0);
    const candidates = events.filter(event => {
      if (!eventMatchesAllocation(event, allocation)) return false;
      const remainingShares = Math.abs(Number(event.shares) || 0) - (allocatedSharesByEvent.get(String(event.id)) || 0);
      return remainingShares + 0.000001 >= allocatedShares;
    });

    if (candidates.length !== 1) return allocation;

    const matchedEvent = candidates[0];
    const matchedEventId = String(matchedEvent.id);
    allocatedSharesByEvent.set(
      matchedEventId,
      (allocatedSharesByEvent.get(matchedEventId) || 0) + allocatedShares,
    );
    changed = true;
    return {
      ...allocation,
      id: buildTradeAllocationId(matchedEventId, allocation.pnlId, allocation.leg),
      tradeEventId: matchedEventId,
    };
  });

  return changed ? reconciled : allocations;
};

export const removeTradeAllocationsForPnl = (
  allocations: TradeEventAllocationData[],
  pnlIds: string[],
): TradeEventAllocationData[] => {
  const idSet = new Set(pnlIds.map(String));
  return allocations.filter(allocation => !idSet.has(String(allocation.pnlId)));
};

const normalizeLegacySplitEvents = (events: TradeEventData[]): TradeEventData[] => {
  const eventIds = new Set(events.map(event => String(event.id)));
  const parentIds = new Set(events
    .filter(event => event.parentEventId && eventIds.has(String(event.parentEventId)))
    .map(event => String(event.parentEventId)));

  return events
    .filter(event => !(event.parentEventId && eventIds.has(String(event.parentEventId))))
    .map(event => parentIds.has(String(event.id)) && event.recordStatus === 'Superseded'
      ? { ...event, recordStatus: 'Recorded' }
      : event);
};

/**
 * Upsert by event ID while preserving richer original executions when a P&L
 * record can only reconstruct a historical leg. P&L links belong in
 * TradeEventAllocationData; this keeps raw broker rows unchanged.
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
        if (current?.eventOrigin === 'P&L Reconstruction') byId.delete(id);
        return;
      }
    }

    if (!current) {
      byId.set(id, event);
      return;
    }

    if (event.eventOrigin === 'P&L Reconstruction') {
      if (current.eventOrigin !== 'P&L Reconstruction') return;
      byId.set(id, {
        ...current,
        ...event,
        linkedPnlId: event.linkedPnlId || current.linkedPnlId,
        linkedPnlTradeNumber: event.linkedPnlTradeNumber ?? current.linkedPnlTradeNumber,
      });
      return;
    }

    const preserveAuditStatus = current.recordStatus === 'Deleted';
    byId.set(id, {
      ...current,
      ...event,
      recordStatus: preserveAuditStatus ? current.recordStatus : event.recordStatus,
    });
  });

  return normalizeLegacySplitEvents(Array.from(byId.values())).sort(
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
