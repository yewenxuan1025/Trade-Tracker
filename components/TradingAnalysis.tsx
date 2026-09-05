import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Newspaper,
  RefreshCw,
  Server,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { LookupSheetData, MarketConstants, PnLData, TradeEventData } from '../types';
import {
  AIAnalysisPeriod,
  AIAnalysisResult,
  AICredentialMode,
  AIProvider,
  AI_PROVIDER_DEFAULT_MODELS,
  AI_PROVIDER_LABELS,
  AI_PROVIDER_MODELS,
  DEFAULT_AI_GATEWAY_URL,
  buildTradingAnalysisPayload,
  requestTradingAnalysis,
} from '../services/aiAnalysis';
import TradeEventsTable from './TradeEventsTable';

interface TradingAnalysisProps {
  events: TradeEventData[];
  pnlData: PnLData[];
  lookupData: LookupSheetData | null;
  marketConstants: MarketConstants;
  onUploadHistory: (file: File) => void;
  onExportHistory: () => void;
}

type PeriodPreset = 'Week' | 'Month' | 'Year' | 'Custom';

const parseDateOnly = (value?: string): Date | null => {
  const matched = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) return null;
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const shiftUtcMonths = (date: Date, months: number): Date => {
  const shifted = new Date(date);
  const originalDay = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(originalDay, lastDay));
  return shifted;
};

const buildPeriod = (
  preset: PeriodPreset,
  referenceDate: Date,
  customStartDate: string,
  customEndDate: string,
): AIAnalysisPeriod => {
  const endDate = formatDateOnly(referenceDate);
  if (preset === 'Week') {
    const start = new Date(referenceDate);
    start.setUTCDate(start.getUTCDate() - 6);
    return { startDate: formatDateOnly(start), endDate, label: 'Last 7 Days' };
  }
  if (preset === 'Month') {
    return { startDate: formatDateOnly(shiftUtcMonths(referenceDate, -1)), endDate, label: 'Last 1 Month' };
  }
  if (preset === 'Year') {
    return { startDate: formatDateOnly(shiftUtcMonths(referenceDate, -12)), endDate, label: 'Last 1 Year' };
  }
  return { startDate: customStartDate, endDate: customEndDate, label: 'Custom Range' };
};

const renderInline = (text: string): React.ReactNode[] => text
  .split(/(\*\*[^*]+\*\*)/g)
  .filter(Boolean)
  .map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={`${part}-${index}`} className="font-black text-slate-800">{part.slice(2, -2)}</strong>
    : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>);

const ReportContent: React.FC<{ report: string }> = ({ report }) => (
  <div className="space-y-2.5 text-sm leading-6 text-slate-600">
    {report.split('\n').map((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return <div key={`space-${index}`} className="h-1" />;
      if (line.startsWith('### ')) return <h4 key={index} className="pt-2 text-sm font-black text-slate-800">{renderInline(line.slice(4))}</h4>;
      if (line.startsWith('## ')) return <h3 key={index} className="pt-3 text-base font-black text-slate-900">{renderInline(line.slice(3))}</h3>;
      if (line.startsWith('# ')) return <h2 key={index} className="pt-3 text-lg font-black text-slate-900">{renderInline(line.slice(2))}</h2>;
      if (/^[-*]\s/.test(line)) {
        return <div key={index} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" /><p>{renderInline(line.slice(2))}</p></div>;
      }
      if (/^\d+[.)]\s/.test(line)) return <p key={index} className="pl-1">{renderInline(line)}</p>;
      return <p key={index}>{renderInline(line)}</p>;
    })}
  </div>
);

const TradingAnalysis: React.FC<TradingAnalysisProps> = ({
  events,
  pnlData,
  lookupData,
  marketConstants,
  onUploadHistory,
  onExportHistory,
}) => {
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [model, setModel] = useState(AI_PROVIDER_DEFAULT_MODELS.openai);
  const [credentialMode, setCredentialMode] = useState<AICredentialMode>('shared');
  const [apiKey, setApiKey] = useState('');
  const [gatewayAccessToken, setGatewayAccessToken] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_AI_GATEWAY_URL);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('Week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [includeMarketContext, setIncludeMarketContext] = useState(true);
  const [includeNews, setIncludeNews] = useState(false);
  const [analysisFocus, setAnalysisFocus] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const referenceDate = useMemo(() => {
    const configured = parseDateOnly(marketConstants.date);
    if (configured) return configured;
    const latest = events
      .map(event => parseDateOnly(event.date))
      .filter((date): date is Date => date !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0];
    return latest || new Date();
  }, [events, marketConstants.date]);

  useEffect(() => {
    if (!customEndDate) setCustomEndDate(formatDateOnly(referenceDate));
  }, [customEndDate, referenceDate]);

  const period = useMemo(
    () => buildPeriod(periodPreset, referenceDate, customStartDate, customEndDate),
    [customEndDate, customStartDate, periodPreset, referenceDate],
  );

  const payload = useMemo(() => buildTradingAnalysisPayload(
    events,
    pnlData,
    lookupData,
    marketConstants,
    period,
    includeMarketContext,
  ), [events, includeMarketContext, lookupData, marketConstants, period, pnlData]);

  const handleProviderChange = (nextProvider: AIProvider) => {
    setProvider(nextProvider);
    setModel(AI_PROVIDER_DEFAULT_MODELS[nextProvider]);
    setError('');
  };

  const handleAnalyze = async () => {
    setError('');
    setCopied(false);
    if (!period.startDate || !period.endDate) {
      setError('Please select both start and end dates for the analysis.');
      return;
    }
    if (period.startDate > period.endDate) {
      setError('The analysis start date must be before the end date.');
      return;
    }
    if (payload.summary.eventCount === 0) {
      setError('No recorded trades were found in the selected period.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await requestTradingAnalysis({
        gatewayUrl,
        provider,
        model,
        credentialMode,
        apiKey,
        gatewayAccessToken,
        includeMarketContext,
        includeNews,
        analysisFocus,
      }, payload);
      setAnalysisResult(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate the AI analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopy = async () => {
    if (!analysisResult?.report) return;
    await navigator.clipboard.writeText(analysisResult.report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const modelGroups = useMemo(() => {
    const groups = new Map<string, (typeof AI_PROVIDER_MODELS)[AIProvider]>();
    AI_PROVIDER_MODELS[provider].forEach(option => {
      const values = groups.get(option.generation) || [];
      values.push(option);
      groups.set(option.generation, values);
    });
    return Array.from(groups.entries());
  }, [provider]);
  const isPresetModel = AI_PROVIDER_MODELS[provider].some(option => option.id === model);

  return (
    <div className="space-y-6 pb-2">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-5 text-white">
          <div>
            <div className="mb-1 flex items-center gap-2 text-blue-300">
              <Sparkles size={16} />
              <span className="text-[11px] font-black uppercase tracking-[0.18em]">AI Trade Review</span>
            </div>
            <h2 className="text-2xl font-black">Trading Analysis</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
              Analyze selected Trading History and realized P&amp;L. Reports and API keys stay only in this page session and are never written to localStorage.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Analysis as of</p>
            <p className="font-mono text-sm font-black text-white">{formatDateOnly(referenceDate)}</p>
          </div>
        </div>

        <div className="grid xl:grid-cols-[430px_minmax(0,1fr)]">
          <div className="space-y-5 border-b border-slate-200 p-5 xl:border-b-0 xl:border-r">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Provider</span>
                <div className="relative">
                  <select
                    value={provider}
                    onChange={event => handleProviderChange(event.target.value as AIProvider)}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                  >
                    {(Object.keys(AI_PROVIDER_LABELS) as AIProvider[]).map(value => (
                      <option key={value} value={value}>{AI_PROVIDER_LABELS[value]}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Model</span>
                <div className="relative">
                  <select
                    aria-label="AI model"
                    value={isPresetModel ? model : '__custom__'}
                    onChange={event => setModel(event.target.value === '__custom__' ? '' : event.target.value)}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                  >
                    {modelGroups.map(([generation, options]) => (
                      <optgroup key={generation} label={generation}>
                        {options.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}{option.accessNote ? ` — ${option.accessNote}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__custom__">Custom model ID…</option>
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                {!isPresetModel && (
                  <input
                    value={model}
                    onChange={event => setModel(event.target.value)}
                    autoComplete="off"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-700 outline-none focus:border-blue-500"
                    placeholder="Enter a custom model ID"
                  />
                )}
              </label>
            </div>

            <div>
              <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">API access</span>
              <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setCredentialMode('shared')}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-black ${credentialMode === 'shared' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <Server size={13} /> Shared API
                </button>
                <button
                  type="button"
                  onClick={() => setCredentialMode('personal')}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-black ${credentialMode === 'personal' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <KeyRound size={13} /> My API Key
                </button>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">AI Gateway URL</span>
              <input
                type="url"
                value={gatewayUrl}
                onChange={event => setGatewayUrl(event.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-700 outline-none focus:border-blue-500"
                placeholder="https://your-ai-gateway.example.com/analyze"
              />
              <span className="mt-1 block text-[10px] leading-4 text-slate-400">
                The GitHub Pages app calls this gateway; provider secrets should live on the gateway.
              </span>
            </label>

            {credentialMode === 'personal' && (
              <label className="block rounded-lg border border-amber-200 bg-amber-50 p-3">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-amber-700">Personal API key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={event => setApiKey(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-700 outline-none focus:border-amber-500"
                  placeholder="Only sent to the gateway for this request"
                />
                <span className="mt-1 block text-[10px] leading-4 text-amber-700/80">Never saved in localStorage or IndexedDB.</span>
              </label>
            )}

            {credentialMode === 'shared' && (
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Shared access code</span>
                <input
                  type="password"
                  value={gatewayAccessToken}
                  onChange={event => setGatewayAccessToken(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-700 outline-none focus:border-blue-500"
                  placeholder="Required when enabled on the gateway"
                />
                <span className="mt-1 block text-[10px] leading-4 text-slate-400">Share this code only with the two app users. It is not saved.</span>
              </label>
            )}

            <div>
              <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">Analysis period</span>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['Week', 'Last 7 Days'],
                  ['Month', 'Last 1 Month'],
                  ['Year', 'Last 1 Year'],
                  ['Custom', 'Custom Range'],
                ] as [PeriodPreset, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriodPreset(value)}
                    className={`rounded-lg border px-2 py-2 text-xs font-black ${periodPreset === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {periodPreset === 'Custom' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    aria-label="AI analysis start date"
                    value={customStartDate}
                    max={customEndDate || undefined}
                    onChange={event => setCustomStartDate(event.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-600"
                  />
                  <input
                    type="date"
                    aria-label="AI analysis end date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={event => setCustomEndDate(event.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-600"
                  />
                </div>
              )}
              <p className="mt-2 text-center font-mono text-[10px] font-bold text-slate-400">
                {period.startDate || 'Start date'} — {period.endDate || 'End date'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIncludeMarketContext(value => !value)}
                className={`rounded-lg border p-3 text-left ${includeMarketContext ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}
              >
                <TrendingUp size={16} className={includeMarketContext ? 'text-blue-600' : 'text-slate-400'} />
                <p className="mt-2 text-xs font-black text-slate-700">Market context</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">Uploaded data plus transaction-date market search.</p>
              </button>
              <button
                type="button"
                onClick={() => setIncludeNews(value => !value)}
                className={`rounded-lg border p-3 text-left ${includeNews ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}
              >
                <Newspaper size={16} className={includeNews ? 'text-blue-600' : 'text-slate-400'} />
                <p className="mt-2 text-xs font-black text-slate-700">News context</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">Dated event and news search for traded tickers.</p>
              </button>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Focus (optional)</span>
              <textarea
                value={analysisFocus}
                onChange={event => setAnalysisFocus(event.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs leading-5 text-slate-700 outline-none focus:border-blue-500"
                placeholder="Example: Focus on position sizing and repeated entry mistakes."
              />
            </label>

            {error && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
            >
              {isAnalyzing ? <LoaderCircle size={17} className="animate-spin" /> : <Bot size={17} />}
              {isAnalyzing ? 'Analyzing trades…' : `Analyze ${payload.summary.eventCount} Selected Executions`}
            </button>
            <p className="text-center text-[10px] leading-4 text-slate-400">
              All {payload.executions.length.toLocaleString()} selected executions and all {payload.realizedTrades.length.toLocaleString()} realized P&amp;L records are included. No app-level transaction limit.
            </p>
          </div>

          <div className="min-h-[630px] p-5">
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Executions', payload.summary.eventCount.toLocaleString()],
                ['Tickers', payload.summary.uniqueTickers.toLocaleString()],
                ['Realized', payload.summary.realizedTradeCount.toLocaleString()],
                ['P&L (USD)', payload.summary.realizedPnlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-1 font-mono text-sm font-black text-slate-700">{value}</p>
                </div>
              ))}
            </div>

            {analysisResult ? (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-black text-slate-800"><Sparkles size={15} className="text-blue-600" /> AI Analysis Report</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {AI_PROVIDER_LABELS[analysisResult.provider]} · {analysisResult.model} · {analysisResult.period.startDate} — {analysisResult.period.endDate}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                      {copied ? <Check size={13} className="text-emerald-600" /> : <Clipboard size={13} />} {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={() => setAnalysisResult(null)} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50" aria-label="Clear AI report"><X size={14} /></button>
                  </div>
                </div>
                {analysisResult.warning && (
                  <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {analysisResult.warning}
                  </div>
                )}
                <ReportContent report={analysisResult.report} />
                {analysisResult.sources && analysisResult.sources.length > 0 && (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Sources</p>
                    <div className="space-y-1.5">
                      {analysisResult.sources.map((source, index) => (
                        <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                          <ExternalLink size={11} /> {source.title || source.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[500px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
                <div className="max-w-md">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600"><Bot size={24} /></div>
                  <h3 className="mt-4 text-base font-black text-slate-800">Ready for an AI trade review</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Select a provider and period, then generate a report from the recorded executions and realized P&amp;L shown above.
                  </p>
                  {!gatewayUrl && (
                    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700">
                      Add an AI Gateway URL before the first request. The included gateway template keeps shared provider keys off GitHub Pages.
                    </p>
                  )}
                  <button type="button" onClick={() => setAnalysisResult(null)} className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                    <RefreshCw size={12} /> Reports are session-only
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <TradeEventsTable
        events={events}
        asOfDate={marketConstants.date}
        onUpload={onUploadHistory}
        onExport={onExportHistory}
      />
    </div>
  );
};

export default TradingAnalysis;
