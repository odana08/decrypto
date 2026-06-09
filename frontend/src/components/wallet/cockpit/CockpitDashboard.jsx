import { useState, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useWalletAnalysis } from '../../../hooks/useWalletAnalysis';
import { getFeatureInsight } from '../../../adapters/walletAdapter';

import CockpitCommandBar from './CockpitCommandBar';
import CockpitSidebar from './CockpitSidebar';
import CockpitGraph from './CockpitGraph';
import PathInspector from './PathInspector';
import CockpitMetrics from './CockpitMetrics';
import AnalysisTabs from './AnalysisTabs';
import GridScanBackground from './GridScanBackground';

const pageTransition = { type: 'spring', stiffness: 140, damping: 22, mass: 0.85 };

const IMPACT_COLORS = {
  Critical: '#f87171',
  High: '#fb923c',
  Medium: '#fbbf24',
  Low: '#4ade80',
};

function EvidencePanel({ title, children }) {
  return (
    <div className="rounded-[24px] border border-white/5 bg-[#0d0f17] p-5 shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
      <div className="mb-4 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function BehaviouralSignals({ signals }) {
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

function CounterpartyRanked({ counterparties, onSelect }) {
  if (!counterparties?.length) {
    return <div className="text-[12px] text-slate-600">No inferred counterparties available.</div>;
  }

  return (
    <div className="space-y-2">
      {counterparties.slice(0, 5).map((cp, i) => (
        <button
          key={cp.address ?? i}
          className="flex w-full items-center gap-3 rounded-[14px] bg-white/[0.025] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
          onClick={() => onSelect?.(cp)}
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

function deriveSignals(walletMetrics, alerts) {
  const signals = [];
  const seen = new Set();

  walletMetrics?.topFeatures?.slice(0, 3).forEach((feature, idx) => {
    const insight = getFeatureInsight(feature);
    if (!seen.has(insight.key)) {
      seen.add(insight.key);
      const riskLevel = walletMetrics.riskLevel ?? '';
      const impact =
        riskLevel === 'critical' ? (idx === 0 ? 'Critical' : 'High')
        : riskLevel === 'high' ? 'High'
        : riskLevel === 'medium' ? (idx === 0 ? 'High' : 'Medium')
        : 'Medium';
      signals.push({ key: insight.key, label: insight.label, summary: insight.summary, impact });
    }
  });

  alerts
    ?.filter((a) => a.severity === 'critical' || a.severity === 'high')
    .slice(0, 2)
    .forEach((alert) => {
      if (!seen.has(alert.id)) {
        seen.add(alert.id);
        signals.push({
          key: alert.id,
          label: alert.title,
          summary: alert.description,
          impact: alert.severity === 'critical' ? 'Critical' : 'High',
        });
      }
    });

  return signals.slice(0, 4);
}

function buildCompactSummary(walletMetrics, entityInsights) {
  if (!walletMetrics) return 'Analysis in progress.';

  const topFeature = walletMetrics.topFeatures?.[0];
  const featureLabel = topFeature ? getFeatureInsight(topFeature).label : null;
  const exposureCount = [
    entityInsights?.sanctioned ?? 0,
    entityInsights?.mixers ?? 0,
    entityInsights?.darknet ?? 0,
    entityInsights?.highRiskServices ?? 0,
  ].reduce((sum, value) => sum + value, 0);

  const summaryParts = [
    `${walletMetrics.riskLabel} wallet with ${walletMetrics.totalTxCount ?? 0} observed transactions across ${walletMetrics.uniqueCounterparties ?? 0} inferred counterparties.`,
  ];

  if (featureLabel) {
    summaryParts.push(`Primary signal: ${featureLabel}.`);
  }

  if (exposureCount > 0) {
    summaryParts.push(`${exposureCount} higher-risk inferred link${exposureCount === 1 ? '' : 's'} surfaced in the visible graph.`);
  } else {
    summaryParts.push('No elevated exposure surfaced in the visible graph.');
  }

  return summaryParts.join(' ');
}

export default function CockpitDashboard({ address, onAnalyse, onClear, onBack }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [activeSection, setActiveSection] = useState('transactions');
  const analysisRef = useRef(null);
  const hasActiveAddress = Boolean(address);

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

  const suspiciousFeature = useMemo(
    () => (walletMetrics?.topFeatures?.length ? getFeatureInsight(walletMetrics.topFeatures[0]) : null),
    [walletMetrics]
  );

  const signals = useMemo(
    () => deriveSignals(walletMetrics, alerts),
    [walletMetrics, alerts]
  );

  const compactSummary = useMemo(
    () => buildCompactSummary(walletMetrics, entityInsights),
    [walletMetrics, entityInsights]
  );

  const highSeverityAlerts = useMemo(
    () => alerts?.filter((a) => a.severity === 'critical' || a.severity === 'high').length ?? 0,
    [alerts]
  );

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    setSelectedPath(null);
  };

  const handlePathSelect = (path) => {
    setSelectedPath(path);
    setSelectedNode(null);
  };

  const handleSectionChange = (section) => {
    setActiveSection(section);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => {
        analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const handleClear = () => {
    setSelectedNode(null);
    setSelectedPath(null);
    onClear?.();
  };

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: '#090a0f' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.015) 0%, rgba(255,255,255,0) 32%)' }}
      />

      {!hasActiveAddress && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <GridScanBackground />
        </motion.div>
      )}

      <motion.div
        layout
        transition={pageTransition}
        className={
          hasActiveAddress
            ? 'relative z-[1] mx-auto max-w-[1580px] px-5 pb-8 pt-2'
            : 'relative z-[1] mx-auto flex min-h-full max-w-[1580px] items-center justify-center px-5 py-10'
        }
      >
        <motion.div layout transition={pageTransition} className="w-full">
          <CockpitCommandBar
            address={address}
            onBack={onBack}
            onAnalyse={onAnalyse}
            onClear={handleClear}
            flaggedReason={suspiciousFeature?.label}
            flaggedSummary={suspiciousFeature?.summary}
            centered={!hasActiveAddress}
          />

          <AnimatePresence mode="wait">
            {hasActiveAddress && (
              <motion.div
                key="analysis-content"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="mt-4 space-y-4"
              >
                {/* Risk strip */}
                <CockpitMetrics
                  riskScore={walletMetrics?.riskScore}
                  riskLabel={walletMetrics?.riskLabel}
                  riskLevel={walletMetrics?.riskLevel}
                  primaryExplanation={suspiciousFeature?.summary}
                  alertCount={highSeverityAlerts}
                  totalTxs={walletMetrics?.totalTxCount}
                  counterparties={walletMetrics?.uniqueCounterparties}
                  totalVolume={walletMetrics?.totalOutgoing}
                />

                {/* Graph — full width, dominant */}
                <div>
                  <div className="mb-2.5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-600">
                    Primary Inferred Path
                  </div>
                  <div className="relative min-w-0 overflow-hidden rounded-[28px]">
                    <CockpitGraph
                      nodes={graph?.nodes ?? []}
                      links={graph?.links ?? []}
                      centerAddress={address}
                      onNodeSelect={handleNodeSelect}
                      onPathSelect={handlePathSelect}
                      selectedNodeId={selectedNode?.id}
                    />

                    {loading && (
                      <div
                        className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-[28px]"
                        style={{ background: 'rgba(8,10,15,0.84)', backdropFilter: 'blur(4px)' }}
                      >
                        <Loader2 size={24} className="animate-spin text-violet-300" />
                        <div className="mt-3 text-[12px] text-slate-300">Analysing wallet activity</div>
                        <div className="mt-1 text-[11px] text-slate-600">Inferring relationships and building risk profile...</div>
                      </div>
                    )}

                    {error && !loading && (
                      <div
                        className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-[28px]"
                        style={{ background: 'rgba(8,10,15,0.90)', backdropFilter: 'blur(4px)' }}
                      >
                        <AlertCircle size={24} className="text-red-400" />
                        <div className="mt-3 text-[12px] text-red-300">Analysis failed</div>
                        <div className="mt-1 max-w-xs text-center text-[11px] text-slate-500">{error}</div>
                        <button
                          onClick={refetch}
                          className="mt-4 flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-white"
                        >
                          <RefreshCw size={11} />
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Node / path detail — conditional, full width */}
                {(selectedNode || selectedPath) && (
                  <PathInspector
                    selectedNode={selectedNode}
                    selectedPath={selectedPath}
                    primaryPath={null}
                    centerAddress={address}
                    onClose={() => {
                      setSelectedNode(null);
                      setSelectedPath(null);
                    }}
                    fullWidth
                  />
                )}

                {/* Evidence: summary sentence + 2-col signals / counterparties */}
                <div className="space-y-3">
                  {compactSummary && (
                    <p className="px-1 text-[13px] leading-6 text-slate-500">{compactSummary}</p>
                  )}
                  <div className="grid gap-3 lg:grid-cols-2" ref={analysisRef}>
                    <EvidencePanel title="Behavioural Signals">
                      <BehaviouralSignals signals={signals} />
                    </EvidencePanel>
                    <EvidencePanel title="Top Inferred Counterparties">
                      <CounterpartyRanked
                        counterparties={counterpartyData}
                        onSelect={(counterparty) => {
                          const node = graph?.nodes?.find((n) => n.id === counterparty.address);
                          if (node) handleNodeSelect(node);
                        }}
                      />
                    </EvidencePanel>
                  </div>
                </div>

                {/* Detail nav + tabs */}
                <div className="space-y-3">
                  <CockpitSidebar
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
                    txCount={walletMetrics?.totalTxCount}
                    counterparties={walletMetrics?.uniqueCounterparties}
                    alerts={highSeverityAlerts}
                  />
                  <AnalysisTabs
                    signals={signals}
                    counterparties={counterpartyData}
                    transactions={transactions}
                    alerts={alerts}
                    timelineData={timelineData}
                    activeTab={activeSection}
                    onTabChange={handleSectionChange}
                    showTabBar={false}
                    onSelectCounterparty={(counterparty) => {
                      const node = graph?.nodes?.find((n) => n.id === counterparty.address);
                      if (node) handleNodeSelect(node);
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}
