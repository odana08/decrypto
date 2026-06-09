import { AlertTriangle } from 'lucide-react';
import { ENTITY_COLORS, RISK_COLORS } from '../../../constants';

const IMPACT_COLORS = {
  Critical: '#f87171',
  High: '#fb923c',
  Medium: '#fbbf24',
  Low: '#4ade80',
};

const TABS = [
  { key: 'transactions', label: 'Source Txs' },
  { key: 'counterparties', label: 'Inferred Counterparties' },
  { key: 'activity', label: 'Activity' },
  { key: 'alerts', label: 'Alerts' },
];

function TabButton({ tab, active, alertCount, onClick }) {
  const showBadge = tab.key === 'alerts' && alertCount > 0;

  return (
    <button
      onClick={() => onClick(tab.key)}
      className={`rounded-full px-4 py-2 text-[12px] font-medium transition-colors ${
        active
          ? 'bg-white/[0.07] text-slate-100'
          : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'
      }`}
    >
      {tab.label}
      {showBadge && <span className="ml-2 text-rose-300">{alertCount}</span>}
    </button>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-[20px] border border-white/5 bg-[#10131b] p-5">
      <div className="mb-4 text-[13px] font-medium text-slate-300">{title}</div>
      {children}
    </div>
  );
}

function BehaviouralSignalsPanel({ signals }) {
  if (!signals?.length) {
    return <div className="text-[12px] text-slate-600">No elevated risk signals detected.</div>;
  }

  return (
    <div className="space-y-2.5">
      {signals.slice(0, 4).map((signal, i) => {
        const label = typeof signal === 'string' ? signal : signal.label;
        const summary = typeof signal === 'string' ? null : signal.summary;
        const impact = typeof signal === 'string' ? null : signal.impact;
        const color = IMPACT_COLORS[impact] ?? null;

        return (
          <div
            key={typeof signal === 'object' ? (signal.key ?? i) : i}
            className="rounded-[14px] bg-white/[0.025] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] font-medium text-slate-200">{label}</span>
              {impact && color && (
                <span
                  className="flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em]"
                  style={{ color, background: `${color}18` }}
                >
                  {impact}
                </span>
              )}
            </div>
            {summary && (
              <p className="mt-1.5 text-[12px] leading-5 text-slate-500">{summary}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CounterpartyRankedList({ counterparties, onSelectCounterparty }) {
  if (!counterparties?.length) {
    return <div className="text-[12px] text-slate-600">No counterparties available.</div>;
  }

  return (
    <div className="space-y-2">
      {counterparties.slice(0, 5).map((cp, i) => (
        <button
          key={cp.address ?? i}
          className="flex w-full items-center gap-3 rounded-[14px] bg-white/[0.025] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
          onClick={() => onSelectCounterparty?.(cp)}
        >
          <span className="w-5 flex-shrink-0 text-center text-[11px] font-mono text-slate-600">#{i + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12px] font-medium text-slate-300">{cp.name}</span>
            <span className="truncate font-mono text-[10px] text-slate-600">{cp.address}</span>
          </div>
          <span className="flex-shrink-0 font-mono text-[12px]" style={{ color: cp.color }}>
            {cp.btcTotalFormatted}
          </span>
        </button>
      ))}
    </div>
  );
}

function OverviewContent({ signals, counterparties, onSelectCounterparty }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Behavioural Signals">
        <BehaviouralSignalsPanel signals={signals} />
      </Panel>
      <Panel title="Top Inferred Counterparties">
        <CounterpartyRankedList counterparties={counterparties} onSelectCounterparty={onSelectCounterparty} />
      </Panel>
    </div>
  );
}

function TransactionsContent({ transactions }) {
  if (!transactions?.length) {
    return <div className="p-2 text-[12px] text-slate-600">No source transactions available.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/6">
            <th className="px-2 py-2 text-left font-mono font-normal uppercase tracking-[0.16em] text-slate-600">Time</th>
            <th className="px-2 py-2 text-left font-mono font-normal uppercase tracking-[0.16em] text-slate-600">Dir</th>
            <th className="px-2 py-2 text-left font-mono font-normal uppercase tracking-[0.16em] text-slate-600">Inferred counterparty</th>
            <th className="px-2 py-2 text-right font-mono font-normal uppercase tracking-[0.16em] text-slate-600">Est. amount</th>
            <th className="px-2 py-2 text-left font-mono font-normal uppercase tracking-[0.16em] text-slate-600">Type</th>
            <th className="px-2 py-2 text-left font-mono font-normal uppercase tracking-[0.16em] text-slate-600">Risk</th>
          </tr>
        </thead>
        <tbody>
          {transactions.slice(0, 20).map((tx) => (
            <tr key={tx.id} className="border-b border-white/4 hover:bg-white/[0.02]">
              <td className="px-2 py-2 font-mono text-slate-500">{tx.timestamp ?? 'Pending'}</td>
              <td className="px-2 py-2">
                <span className={`text-[10px] font-mono uppercase ${tx.direction === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.direction === 'in' ? 'In' : 'Out'}
                </span>
              </td>
              <td className="px-2 py-2">
                <div className="max-w-[140px] truncate font-mono text-slate-400">{tx.counterparty}</div>
              </td>
              <td className={`px-2 py-2 text-right font-mono ${tx.direction === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                {tx.direction === 'in' ? '+' : '-'}{tx.amount}
              </td>
              <td className="px-2 py-2">
                <span
                  className="rounded-full px-2 py-1 text-[9px] font-mono"
                  style={{
                    color: ENTITY_COLORS[tx.entityType] ?? '#64748b',
                    background: `${ENTITY_COLORS[tx.entityType] ?? '#64748b'}12`,
                  }}
                >
                  {tx.category ?? 'Wallet'}
                </span>
              </td>
              <td className="px-2 py-2">
                {tx.riskFlag ? (
                  <span style={{ color: RISK_COLORS[tx.riskLevel] ?? '#64748b' }}>{tx.riskFlag}</span>
                ) : (
                  <span className="text-slate-700">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CounterpartiesContent({ counterparties, onSelectCounterparty }) {
  if (!counterparties?.length) {
    return <div className="p-2 text-[12px] text-slate-600">No inferred counterparties available.</div>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {counterparties.map((cp, i) => (
        <button
          key={i}
          className="rounded-[18px] bg-white/[0.02] p-4 text-left transition-colors hover:bg-white/[0.04]"
          onClick={() => onSelectCounterparty?.(cp)}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-slate-300">{cp.name}</span>
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: cp.color ?? '#64748b' }} />
          </div>
          <div className="mb-2 truncate font-mono text-[10px] text-slate-600">{cp.address}</div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">{cp.txCount ?? 0} txs</span>
            <span className="font-mono" style={{ color: cp.color }}>{cp.btcTotalFormatted}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function AlertsContent({ alerts }) {
  if (!alerts?.length) {
    return <div className="p-2 text-[12px] text-slate-600">No alerts for this wallet.</div>;
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const color = RISK_COLORS[alert.severity] ?? '#64748b';
        return (
          <div key={alert.id} className="rounded-[18px] bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={12} style={{ color }} />
              <span
                className="rounded-full px-2 py-1 text-[9px] font-mono uppercase"
                style={{ color, background: `${color}12`, border: `1px solid ${color}20` }}
              >
                {alert.severity}
              </span>
              <span className="text-[12px] font-medium text-slate-300">{alert.title}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">{alert.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function ActivityContent({ timelineData }) {
  if (!timelineData?.length) {
    return <div className="p-2 text-[12px] text-slate-600">No activity data available.</div>;
  }

  const maxValue = Math.max(...timelineData.map((d) => Math.max(d.incoming ?? 0, d.outgoing ?? 0)), 1);

  return (
    <div className="p-2">
      <div className="flex h-36 items-end gap-1">
        {timelineData.map((d, i) => {
          const inHeight = ((d.incoming ?? 0) / maxValue) * 100;
          const outHeight = ((d.outgoing ?? 0) / maxValue) * 100;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 items-end gap-0.5">
                <div className="w-2 rounded-t bg-green-500/60" style={{ height: `${inHeight}%`, minHeight: d.incoming > 0 ? 2 : 0 }} />
                <div className="w-2 rounded-t bg-red-500/60" style={{ height: `${outHeight}%`, minHeight: d.outgoing > 0 ? 2 : 0 }} />
              </div>
              <span className="text-[8px] font-mono text-slate-600">{d.month}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded bg-green-500/60" />
          <span className="text-[10px] text-slate-500">Inbound</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded bg-red-500/60" />
          <span className="text-[10px] text-slate-500">Outbound</span>
        </div>
      </div>
    </div>
  );
}

export default function AnalysisTabs({
  signals,
  counterparties,
  transactions,
  alerts,
  timelineData,
  onSelectCounterparty,
  activeTab = 'overview',
  onTabChange,
  showTabBar = true,
}) {
  const alertCount = alerts?.filter((a) => a.severity === 'critical' || a.severity === 'high').length ?? 0;
  const selectedTab = TABS.some((tab) => tab.key === activeTab) ? activeTab : TABS[0].key;

  return (
    <div className="rounded-[24px] border border-white/5 bg-[#0d0f17] p-4 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
      {showTabBar && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              active={selectedTab === tab.key}
              alertCount={alertCount}
              onClick={onTabChange}
            />
          ))}
        </div>
      )}

      <div className="min-h-[320px]">
        {selectedTab === 'overview' && (
          <OverviewContent
            signals={signals}
            counterparties={counterparties}
            onSelectCounterparty={onSelectCounterparty}
          />
        )}
        {selectedTab === 'transactions' && <TransactionsContent transactions={transactions} />}
        {selectedTab === 'counterparties' && (
          <CounterpartiesContent counterparties={counterparties} onSelectCounterparty={onSelectCounterparty} />
        )}
        {selectedTab === 'activity' && <ActivityContent timelineData={timelineData} />}
        {selectedTab === 'alerts' && <AlertsContent alerts={alerts} />}
      </div>
    </div>
  );
}
