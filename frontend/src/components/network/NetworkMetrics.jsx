import MetricCard from '../shared/MetricCard';
import { Radar, Flag, TrendingUp, ShieldOff, Building2, Wrench, GitBranch, AlertTriangle } from 'lucide-react';

export default function NetworkMetrics({ metrics }) {
  return (
    <div className="flex-shrink-0 grid grid-cols-3 md:grid-cols-6 xl:grid-cols-9 gap-2 px-4 py-2"
      style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
      <MetricCard
        label="Wallets Scanned"
        value={metrics.walletsScan}
        sub="Elliptic dataset"
        accent="cyan"
        icon={Radar}
      />
      <MetricCard
        label="Flagged Wallets"
        value={metrics.flaggedWallets}
        sub={`${metrics.flaggedPct} model-classified`}
        accent="orange"
        icon={Flag}
      />
      <MetricCard
        label="Unknown Wallets"
        value={metrics.unknownWallets}
        sub="unlabelled addresses"
        accent="yellow"
        icon={TrendingUp}
      />
      <MetricCard
        label="Flagged-Wallet Txs"
        value={metrics.suspiciousTxCount}
        sub="dataset activity"
        accent="yellow"
        icon={TrendingUp}
      />
      <MetricCard
        label="Counterparty Links"
        value={metrics.counterpartyExposure}
        sub="dataset edge exposure"
        accent="red"
        icon={ShieldOff}
      />
      <MetricCard
        label="Repeated Routes"
        value={metrics.repeatCounterpartyWallets.toLocaleString()}
        sub="wallets with repeats"
        accent="blue"
        icon={Building2}
      />
      <MetricCard
        label="Median Flagged Vol."
        value={metrics.medianFlaggedVolume}
        sub="per flagged wallet"
        accent="orange"
        icon={Wrench}
      />
      <MetricCard
        label="Graph Edges"
        value={metrics.graphEdgeCount}
        sub="sampled dataset links"
        accent="purple"
        icon={GitBranch}
      />
      <MetricCard
        label="Network Risk Index"
        value={`${metrics.networkRiskIndex}/10`}
        sub="overall score"
        accent="red"
        icon={AlertTriangle}
      />
    </div>
  );
}
