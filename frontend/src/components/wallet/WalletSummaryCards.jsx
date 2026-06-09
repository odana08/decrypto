import MetricCard from '../shared/MetricCard';
import {
  TrendingUp, TrendingDown, Shield, AlertTriangle, Users, RefreshCw, Layers, Activity
} from 'lucide-react';

export default function WalletSummaryCards({ metrics }) {
  return (
    <div className="flex-shrink-0 grid grid-cols-8 gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <MetricCard
        label="Risk Score"
        value={`${metrics.riskScore}/100`}
        sub={metrics.riskLevel.toUpperCase()}
        accent="red"
        icon={AlertTriangle}
      />
      <MetricCard
        label="Total Incoming"
        value={metrics.totalIncoming}
        sub={`${metrics.incomingTxCount} transactions`}
        accent="green"
        icon={TrendingDown}
      />
      <MetricCard
        label="Total Outgoing"
        value={metrics.totalOutgoing}
        sub={`${metrics.outgoingTxCount} transactions`}
        accent="red"
        icon={TrendingUp}
      />
      <MetricCard
        label="Feature Source"
        value={metrics.featureSource}
        sub="model input"
        accent="yellow"
        icon={RefreshCw}
      />
      <MetricCard
        label="Inferred Parties"
        value={metrics.uniqueCounterparties}
        sub="unique addresses"
        accent="blue"
        icon={Users}
      />
      <MetricCard
        label="Watchlist Match"
        value={metrics.watchlistMatch ? 'Yes' : 'None'}
        sub="local list"
        accent={metrics.watchlistMatch ? 'red' : 'slate'}
        icon={Shield}
      />
      <MetricCard
        label="Graph Links"
        value={metrics.graphLinkCount ?? 0}
        sub="inferred"
        accent="orange"
        icon={Layers}
      />
      <MetricCard
        label="Sample Coverage"
        value={metrics.historyContext?.sample_coverage != null ? `${Math.round(metrics.historyContext.sample_coverage * 100)}%` : '—'}
        sub="tx history"
        accent="purple"
        icon={Activity}
      />
    </div>
  );
}
