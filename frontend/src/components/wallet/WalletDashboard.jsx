import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCheck,
  Copy,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import WalletGraph from './WalletGraph';
import SidePanel from './SidePanel';
import TransactionTable from './TransactionTable';
import TimelineChart from './TimelineChart';
import CounterpartyChart from './CounterpartyChart';
import RiskBadge from '../shared/RiskBadge';
import { ENTITY_COLORS } from '../../constants';
import { useWalletAnalysis } from '../../hooks/useWalletAnalysis';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'transactions', label: 'Source Txs' },
  { key: 'counterparties', label: 'Inferred Parties' },
  { key: 'activity', label: 'Activity' },
  { key: 'alerts', label: 'Alerts' },
];

function SurfaceCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-[20px] border border-white/6 bg-[#0b0d16] ${className}`}
      style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.24)' }}
    >
      {children}
    </div>
  );
}

function SummaryCard({ label, value, accent, summary, items = [] }) {
  return (
    <SurfaceCard className="p-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-2 text-sm leading-relaxed text-slate-400">{summary}</div>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item} className="text-[12px] text-slate-500">
            {item}
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function InsightList({ title, items, emptyLabel = 'No signals detected.' }) {
  return (
    <SurfaceCard className="p-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">{title}</div>
      <div className="mt-4 space-y-3">
        {items.length ? items.map((item) => (
          <div key={item} className="flex items-start gap-3">
            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-500/60" />
            <span className="text-sm leading-relaxed text-slate-300">{item}</span>
          </div>
        )) : (
          <div className="text-sm text-slate-500">{emptyLabel}</div>
        )}
      </div>
    </SurfaceCard>
  );
}

function OverviewTab({ walletMetrics, counterpartyData = [], entityInsights, alerts = [] }) {
  const topSignals = [
    ...(walletMetrics?.topFeatures ?? []).slice(0, 3).map((feature) => {
      const label = typeof feature === 'string' ? feature : feature.feature;
      return `Model signal: ${label}`;
    }),
    ...alerts
      .filter((alert) => alert.severity === 'critical' || alert.severity === 'high')
      .slice(0, 2)
      .map((alert) => alert.title),
  ].slice(0, 5);

  const exposureItems = [
    { label: 'Sanctioned entities', count: entityInsights?.sanctioned ?? 0, color: ENTITY_COLORS.sanctioned },
    { label: 'Mixers', count: entityInsights?.mixers ?? 0, color: ENTITY_COLORS.mixer },
    { label: 'Darknet links', count: entityInsights?.darknet ?? 0, color: ENTITY_COLORS.darknet },
    { label: 'High-risk services', count: entityInsights?.highRiskServices ?? 0, color: ENTITY_COLORS.high_risk_service },
    { label: 'Exchanges', count: entityInsights?.exchanges ?? 0, color: ENTITY_COLORS.exchange },
  ].filter((item) => item.count > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SurfaceCard className="p-5">
        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Investigation summary</div>
        <div className="mt-4 text-sm leading-relaxed text-slate-300">
          {walletMetrics?.behaviouralSummary ?? 'Behavioural context is still being assembled from observed transactions and inferred relationships.'}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600">Classification</div>
            <div className="mt-2 text-lg font-medium text-slate-100">{walletMetrics?.riskLabel ?? 'Pending'}</div>
          </div>
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600">Feature source</div>
            <div className="mt-2 text-lg font-medium text-slate-100">{walletMetrics?.featureSource ?? 'live'}</div>
          </div>
        </div>
      </SurfaceCard>

      <InsightList title="Key signals" items={topSignals} emptyLabel="No elevated risk signals surfaced yet." />

      <SurfaceCard className="p-5">
        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Exposure breakdown</div>
        <div className="mt-4 space-y-3">
          {exposureItems.length ? exposureItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-slate-300">{item.label}</span>
              </div>
              <span className="text-sm font-medium" style={{ color: item.color }}>{item.count}</span>
            </div>
          )) : (
            <div className="text-sm text-slate-500">No entity exposure has been detected in the current staged graph.</div>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Top inferred counterparties</div>
        <div className="mt-4 space-y-3">
          {counterpartyData.slice(0, 5).map((counterparty) => (
            <div key={counterparty.address} className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
              <div>
                <div className="text-sm text-slate-200">{counterparty.name}</div>
                <div className="mt-1 text-[11px] font-mono text-slate-500">{counterparty.address}</div>
              </div>
              <div className="text-sm font-medium" style={{ color: counterparty.color }}>
                {counterparty.btcTotalFormatted}
              </div>
            </div>
          ))}
          {!counterpartyData.length && (
            <div className="text-sm text-slate-500">Inferred counterparty details will appear once graph links are available.</div>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}

function AlertsTab({ alerts = [] }) {
  return (
    <div className="grid gap-4">
      {alerts.map((alert) => {
        const color = alert.severity === 'critical'
          ? '#f87171'
          : alert.severity === 'high'
            ? '#fb923c'
            : alert.severity === 'medium'
              ? '#fbbf24'
              : '#60a5fa';

        return (
          <SurfaceCard key={alert.id} className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.18em]"
                style={{ color, background: `${color}14`, border: `1px solid ${color}30` }}
              >
                {alert.severity}
              </span>
              <span className="text-sm font-medium text-slate-200">{alert.title}</span>
            </div>
            <div className="mt-3 text-sm leading-relaxed text-slate-400">{alert.description}</div>
          </SurfaceCard>
        );
      })}

      {!alerts.length && (
        <SurfaceCard className="p-5 text-sm text-slate-500">
          No alerts are available for this wallet.
        </SurfaceCard>
      )}
    </div>
  );
}

export default function WalletDashboard({ address, onBack }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const {
    walletMetrics,
    graph,
    transactions,
    entityInsights,
    counterpartyData,
    timelineData,
    alerts,
    loading,
    error,
    refetch,
  } = useWalletAnalysis(address);

  const displayAddress = address ?? '';
  const shortAddress = displayAddress.length > 18
    ? `${displayAddress.slice(0, 10)}...${displayAddress.slice(-6)}`
    : displayAddress;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayAddress).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const highSeverityAlerts = (alerts ?? []).filter((alert) => alert.severity === 'critical' || alert.severity === 'high').length;
  const exposureCount = [
    entityInsights?.sanctioned ?? 0,
    entityInsights?.mixers ?? 0,
    entityInsights?.darknet ?? 0,
    entityInsights?.highRiskServices ?? 0,
    entityInsights?.ransomware ?? 0,
  ].reduce((sum, value) => sum + value, 0);

  const summaryCards = useMemo(() => ([
    {
      label: 'Risk',
      value: walletMetrics ? `${walletMetrics.riskScore}/100` : '—',
      accent: walletMetrics?.riskColor ?? '#f87171',
      summary: walletMetrics?.riskLabel ?? 'Risk pending',
      items: [
        `${highSeverityAlerts} high-severity alerts`,
        `Feature source: ${walletMetrics?.featureSource ?? 'live'}`,
      ],
    },
    {
      label: 'Activity',
      value: walletMetrics ? `${walletMetrics.totalTxCount} txs` : '—',
      accent: '#c4b5fd',
      summary: `Volume ${walletMetrics?.totalVolume ?? '—'}`,
      items: [
        `${walletMetrics?.uniqueCounterparties ?? 0} inferred counterparties`,
        `${walletMetrics?.chain ?? 'Bitcoin'} network`,
      ],
    },
    {
      label: 'Activity',
      value: walletMetrics?.totalOutgoing ?? '—',
      accent: '#5eead4',
      summary: `Outgoing total, with ${walletMetrics?.totalIncoming ?? '—'} inbound`,
      items: [
        `Fees ${walletMetrics?.feesTotal ?? '—'}`,
        `${graph?.links?.length ?? 0} inferred graph relationships`,
      ],
    },
    {
      label: 'Exposure',
      value: `${exposureCount} entities`,
      accent: '#fbbf24',
      summary: 'Flagged or sensitive inferred parties surfaced in the visible graph.',
      items: [
        `${entityInsights?.mixers ?? 0} mixers`,
        `${entityInsights?.sanctioned ?? 0} sanctioned links`,
      ],
    },
  ]), [entityInsights, exposureCount, graph?.links?.length, highSeverityAlerts, walletMetrics]);

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#08090e' }}>
      <div className="mx-auto max-w-[1480px] px-5 py-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-slate-300"
              >
                <ArrowLeft size={13} />
                Back to search
              </button>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Wallet investigation</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-100">{shortAddress}</h1>
                  <RiskBadge level={walletMetrics?.riskLevel} score={walletMetrics?.riskScore} size="sm" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>{walletMetrics?.chain ?? 'Bitcoin network'}</span>
                  <span className="h-1 w-1 rounded-full bg-slate-700" />
                  <span>{walletMetrics?.riskLabel ?? 'Risk assessment loading'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 transition-colors hover:text-slate-200"
              >
                {copied ? <CheckCheck size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy address'}
              </button>
            </div>
          </div>

          <div className="relative">
            <WalletGraph
              nodes={graph?.nodes ?? []}
              links={graph?.links ?? []}
              onNodeClick={setSelectedNode}
              selectedNodeId={selectedNode?.id}
              centerAddress={address}
            />

            {selectedNode && (
              <>
                <div className="absolute inset-y-5 right-5 z-30 hidden xl:block">
                  <SidePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
                </div>
                <div className="mt-4 xl:hidden">
                  <SidePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
                </div>
              </>
            )}

            {loading && (
              <div
                className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-[24px]"
                style={{ background: 'rgba(8,10,15,0.82)', backdropFilter: 'blur(6px)' }}
              >
                <Loader2 size={24} className="animate-spin text-purple-400" />
                <div className="mt-4 text-sm text-slate-200">Analysing wallet activity</div>
                <div className="mt-2 text-[12px] text-slate-500">Building inferred graph links and risk summary from on-chain activity.</div>
              </div>
            )}

            {error && !loading && (
              <div
                className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-[24px]"
                style={{ background: 'rgba(8,10,15,0.88)', backdropFilter: 'blur(6px)' }}
              >
                <AlertCircle size={24} className="text-red-400" />
                <div className="mt-4 text-sm text-red-300">Analysis failed</div>
                <div className="mt-2 max-w-md text-center text-[12px] leading-relaxed text-slate-500">{error}</div>
                <button
                  onClick={refetch}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-300 transition-colors hover:text-white"
                >
                  <RefreshCw size={12} />
                  Retry analysis
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                const isAlertTab = tab.key === 'alerts';

                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors ${
                      active ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
                    }`}
                    style={{
                      background: active ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.03)',
                      border: active ? '1px solid rgba(139,92,246,0.34)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {tab.label}
                    {isAlertTab && highSeverityAlerts > 0 ? ` (${highSeverityAlerts})` : ''}
                  </button>
                );
              })}
            </div>

            <div className="min-h-[340px]">
              {activeTab === 'overview' && (
                <OverviewTab
                  walletMetrics={walletMetrics}
                  counterpartyData={counterpartyData}
                  entityInsights={entityInsights}
                  alerts={alerts}
                />
              )}

              {activeTab === 'transactions' && (
                <SurfaceCard className="min-h-[340px] overflow-hidden">
                  <TransactionTable transactions={transactions} />
                </SurfaceCard>
              )}

              {activeTab === 'counterparties' && (
                <SurfaceCard className="min-h-[340px] overflow-hidden">
                  <CounterpartyChart data={counterpartyData} />
                </SurfaceCard>
              )}

              {activeTab === 'activity' && (
                <SurfaceCard className="min-h-[340px] overflow-hidden">
                  <TimelineChart data={timelineData} />
                </SurfaceCard>
              )}

              {activeTab === 'alerts' && <AlertsTab alerts={alerts} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
