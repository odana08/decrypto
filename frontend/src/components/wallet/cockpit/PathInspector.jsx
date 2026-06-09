import { useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { RISK_COLORS, ENTITY_COLORS, ENTITY_LABELS } from '../../../constants';
import { shortAddr, formatBtc } from '../../../adapters/walletAdapter';

function StatRow({ label, value, mono, color }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600">{label}</span>
      <span className={`text-[11px] ${mono ? 'font-mono' : ''}`} style={{ color: color ?? '#cbd5e1' }}>
        {value ?? '--'}
      </span>
    </div>
  );
}

function PathSequence({ path, centerAddress }) {
  if (!path) return null;

  if (path.mode === 'connection') {
    const steps = [
      { id: path.sourceId, label: 'From' },
      { id: path.destinationId, label: 'To' },
    ];

    return (
      <div className="flex flex-wrap items-center gap-2 py-2">
        {steps.map((step) => {
          const isCenter = step.id === centerAddress || step.id?.includes(centerAddress);
          return (
            <div
              key={step.id}
              className={`rounded-2xl px-2.5 py-1.5 text-[10px] font-mono ${
                isCenter
                  ? 'bg-violet-400/[0.10] text-violet-200'
                  : 'bg-white/[0.04] text-slate-400'
              }`}
            >
              <div className="mb-0.5 text-[8px] uppercase tracking-[0.16em] opacity-60">{step.label}</div>
              {shortAddr(step.id?.replace(/__stage_.*__/, '') ?? '')}
            </div>
          );
        })}
      </div>
    );
  }

  const steps = [
    { id: path.sourceId, label: 'Input side' },
    { id: path.routingId, label: 'Via' },
    { id: path.destinationId, label: 'Output side' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {steps.map((step) => {
        const isCenter = step.id === centerAddress || step.id?.includes(centerAddress);
        return (
          <div
            key={step.id}
            className={`rounded-2xl px-2.5 py-1.5 text-[10px] font-mono ${
              isCenter
                ? 'bg-violet-400/[0.10] text-violet-200'
                : 'bg-white/[0.04] text-slate-400'
            }`}
          >
            <div className="mb-0.5 text-[8px] uppercase tracking-[0.16em] opacity-60">{step.label}</div>
            {shortAddr(step.id?.replace(/__stage_.*__/, '') ?? '')}
          </div>
        );
      })}
    </div>
  );
}

export default function PathInspector({
  selectedNode,
  selectedPath,
  primaryPath,
  centerAddress,
  onClose,
  fullWidth = false,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const path = selectedPath ?? primaryPath;
  const node = selectedNode;
  const panelClass = fullWidth ? 'w-full' : 'w-[300px]';

  if (collapsed) {
    if (fullWidth) return null;
    return (
      <div className="flex h-full w-[72px] flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-[24px] bg-[#0d0f17]/92 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 shadow-[0_18px_42px_rgba(0,0,0,0.22)]" onClick={() => setCollapsed(false)}>
        Inspect
      </div>
    );
  }

  if (node) {
    const color = ENTITY_COLORS[node.type] ?? '#64748b';
    const riskColor = RISK_COLORS[node.riskLevel] ?? RISK_COLORS.unknown;
    const isHighRisk = node.riskLevel === 'critical' || node.riskLevel === 'high';

    return (
      <div className={`${panelClass} flex-shrink-0 rounded-[28px] bg-[#0d0f17]/92 shadow-[0_18px_42px_rgba(0,0,0,0.22)]`}>
        <div className="border-b border-white/6 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <button onClick={() => fullWidth ? onClose?.() : setCollapsed(true)} className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-400">
              {fullWidth ? 'Dismiss' : 'Hide'}
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}55` }} />
                <span className="truncate text-[11px] font-medium text-slate-200">
                  {node.entityLabel ?? ENTITY_LABELS[node.type] ?? 'Wallet'}
                </span>
              </div>
              <div className="break-all font-mono text-[10px] leading-relaxed text-slate-500">
                {node.id}
              </div>
            </div>
            <button onClick={onClose} className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-400">
              Close
            </button>
          </div>
        </div>

        {isHighRisk && node.behaviouralSummary && (
          <div
            className="flex items-start gap-2 border-b border-white/6 px-4 py-3"
            style={{ background: node.riskLevel === 'critical' ? 'rgba(220,38,38,0.05)' : 'rgba(234,88,12,0.05)' }}
          >
            <AlertTriangle size={11} className={node.riskLevel === 'critical' ? 'mt-0.5 text-red-400' : 'mt-0.5 text-orange-400'} />
            <p className="text-[10px] leading-relaxed text-slate-400">{node.behaviouralSummary}</p>
          </div>
        )}

        <div className="space-y-1 px-4 py-4">
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Inferred relationship profile</div>
          <StatRow label="Est. received" value={node.totalReceived} mono />
          <StatRow label="Est. sent" value={node.totalSent} mono />
          <StatRow label="Inferred inbound txs" value={node.inTx} />
          <StatRow label="Inferred outbound txs" value={node.outTx} />
          <StatRow label="Est. volume" value={`${Number(node.volume ?? 0).toFixed(4)} BTC`} mono />

          <div className="pt-4 text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Risk assessment</div>
          <StatRow label="Risk score" value={`${node.riskScore ?? 0}/100`} color={riskColor} />
          <StatRow label="Risk level" value={node.riskLevel ? `${node.riskLevel.charAt(0).toUpperCase()}${node.riskLevel.slice(1)}` : 'Unknown'} color={riskColor} />
          <StatRow label="Entity type" value={ENTITY_LABELS[node.type] ?? node.type} />
        </div>

        <div className="border-t border-white/6 px-4 py-3">
          <button className="flex w-full items-center justify-center gap-2 rounded-full bg-white/[0.03] py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-slate-200">
            <ExternalLink size={10} />
            Full investigation
          </button>
        </div>
      </div>
    );
  }

  if (path) {
    const isPrimary = path.primary;
    const isConnection = path.mode === 'connection';
    const txCount = isConnection
      ? (path.firstLink?.txCount ?? 0)
      : (path.firstLink?.txCount ?? 0) + (path.secondLink?.txCount ?? 0);
    const volume = isConnection
      ? (path.firstLink?.btcTotal ?? 0)
      : (path.firstLink?.btcTotal ?? 0) + (path.secondLink?.btcTotal ?? 0);
    const txIds = path.firstLink?.allTxids?.slice(0, 4) ?? [];

    return (
      <div className={`${panelClass} flex-shrink-0 rounded-[28px] bg-[#0d0f17]/92 shadow-[0_18px_42px_rgba(0,0,0,0.22)]`}>
        <div className="border-b border-white/6 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <button onClick={() => fullWidth ? onClose?.() : setCollapsed(true)} className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-400">
              {fullWidth ? 'Dismiss' : 'Hide'}
            </button>
            <div className="flex-1">
              <div className="mb-1 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600">
                {isConnection ? 'Inferred transaction link' : isPrimary ? 'Primary inferred path' : 'Selected inferred path'}
              </div>
              <div className="text-[12px] font-medium text-slate-200">
                {path.label ?? 'Inferred path'}
              </div>
            </div>
            <button onClick={onClose} className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-400">
              Close
            </button>
          </div>
        </div>

        <div className="border-b border-white/6 px-4 py-3">
          <PathSequence path={path} centerAddress={centerAddress} />
        </div>

        <div className="space-y-1 px-4 py-4">
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Inferred path metrics</div>
          <StatRow label="Observed txs" value={`${txCount} tx`} />
          <StatRow label="Estimated volume" value={formatBtc(volume)} mono />
          {isConnection ? (
            <>
              <StatRow label="Direction" value={path.direction ?? 'Connected'} />
              <StatRow label="Risk score" value={`${path.firstLink?.riskScore ?? '--'}/100`} />
            </>
          ) : (
            <>
              <StatRow label="First link txs" value={path.firstLink?.txCount ?? '--'} />
              <StatRow label="Second link txs" value={path.secondLink?.txCount ?? '--'} />
            </>
          )}

          <div className="pt-4 text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Risk assessment</div>
          <StatRow label="First link risk" value={path.firstLink?.risk ?? 'low'} color={RISK_COLORS[path.firstLink?.risk] ?? RISK_COLORS.low} />
          {!isConnection && (
            <StatRow label="Second link risk" value={path.secondLink?.risk ?? 'low'} color={RISK_COLORS[path.secondLink?.risk] ?? RISK_COLORS.low} />
          )}

          <div className="mt-4 rounded-[18px] bg-white/[0.03] px-3 py-3">
            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Interpretation</div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              {isConnection
                ? 'This view shows an inferred relationship from shared transaction inputs and outputs. Amounts are estimated for multi-input or multi-output transactions.'
                : isPrimary
                  ? 'This is the highest-priority inferred path based on model risk, observed counterparties, and estimated volume.'
                  : 'Secondary inferred path showing related transaction activity through the wallet.'}
            </p>
          </div>

          {isConnection && txIds.length > 0 && (
            <div className="mt-4 rounded-[18px] bg-white/[0.02] px-3 py-3">
              <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Source transactions</div>
              <div className="mt-2 space-y-2">
                {txIds.map((txid) => (
                  <div key={txid} className="break-all font-mono text-[10px] text-slate-400">
                    {txid}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/6 px-4 py-3">
          <button className="w-full rounded-full bg-white/[0.03] py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-slate-200">
            {isConnection ? 'Source transactions' : 'View source transactions'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${panelClass} flex-shrink-0 items-center justify-center rounded-[28px] bg-[#0d0f17]/92 px-6 text-center shadow-[0_18px_42px_rgba(0,0,0,0.22)]`}>
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600">
        Select a node or inferred path to inspect details
      </div>
    </div>
  );
}
