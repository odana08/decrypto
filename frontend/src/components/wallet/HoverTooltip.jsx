import { ENTITY_COLORS, RISK_COLORS, ENTITY_LABELS } from '../../constants';

const getId = (ref) => (ref && typeof ref === 'object') ? ref.id : ref;

function getNodeInterpretation(node) {
  if (node.isCenter) return 'Primary investigation target. Relationships are inferred from observed transaction inputs and outputs.';

  const lines = {
    mixer:
      'Possible obfuscation-related entity type in the visible graph. Review the source transactions before drawing conclusions.',
    sanctioned:
      'Matched a configured high-risk entity type or local watchlist signal. Confirm externally before treating this as a sanctions finding.',
    exchange:
      'Centralised exchange-style entity type. Relationship is inferred from observed transaction structure.',
    bridge:
      'Bridge-style entity type. Relationship is inferred from observed transaction structure.',
    darknet:
      'Darknet-related entity type in the visible graph. Treat as a screening signal for review.',
    ransomware:
      'Ransomware-related entity type in the visible graph. Treat as a screening signal for review.',
    scam_cluster:
      'Fraud-related entity type in the visible graph. Treat as a screening signal for review.',
    laundering:
      'Multi-hop routing pattern in the visible graph. This indicates review priority, not proof of laundering.',
    high_risk_service:
      'High-risk service entity type in the visible graph. Confirm with source evidence before escalation.',
    escrow:
      'Escrow-style entity type in the visible graph.',
    contract:
      'Contract-style entity type in the visible graph.',
    wallet:
      node.riskScore > 70
        ? 'Higher-risk wallet based on model and graph signals. Review source transactions.'
        : 'Wallet observed in inferred relationships. Insufficient context for a strong conclusion.',
  };

  return lines[node.type] || 'Unknown entity type. Further manual investigation required.';
}

function getRiskFlags(node) {
  const flags = [];
  if (node.type === 'mixer') flags.push('Mixer interaction');
  if (node.type === 'sanctioned') flags.push('Sanctions exposure');
  if (node.type === 'darknet') flags.push('Darknet attribution');
  if (node.type === 'ransomware') flags.push('Ransomware nexus');
  if (node.type === 'scam_cluster') flags.push('Fraud cluster');
  if (node.type === 'laundering') flags.push('Layering detected');
  if (node.type === 'high_risk_service') flags.push('Unregistered service');
  if (node.riskScore >= 80) flags.push('Critical risk score');
  if (node.behaviouralFlags) flags.push(...node.behaviouralFlags.slice(0, 2));
  // De-duplicate
  return [...new Set(flags)].slice(0, 4);
}

export default function HoverTooltip({ node, link, mousePos, containerDims, graphMode, depths }) {
  const TOOLTIP_W = 250;
  const TOOLTIP_MAX_H = 260;

  let x = mousePos.x + 18;
  let y = mousePos.y - 22;

  // Prevent overflow on right edge
  if (x + TOOLTIP_W > containerDims.width - 8) x = mousePos.x - TOOLTIP_W - 10;
  // Prevent going above top
  if (y < 8) y = mousePos.y + 22;
  // Prevent going below bottom
  if (y + TOOLTIP_MAX_H > containerDims.height - 8) {
    y = containerDims.height - TOOLTIP_MAX_H - 8;
  }

  // ── Node tooltip ──────────────────────────────────────────────
  if (node) {
    const depth = depths.get(node.id);
    const depthLabel =
      depth === 0
        ? 'Primary target'
        : depth === 1
        ? 'Direct connection (1st degree)'
        : '2nd-degree connection';

    const color = ENTITY_COLORS[node.type] || '#64748b';
    const riskColor = RISK_COLORS[node.riskLevel] || '#64748b';
    const interpretation = getNodeInterpretation(node);
    const flags = getRiskFlags(node);
    const entityLabel = ENTITY_LABELS?.[node.type] || node.type || 'Unknown';

    return (
      <div
        className="absolute z-30 pointer-events-none text-[11px] font-mono"
        style={{
          left: x,
          top: y,
          width: TOOLTIP_W,
          background: 'rgba(9,10,18,0.97)',
          border: `1px solid ${color}40`,
          animation: 'fadeIn 0.1s ease',
        }}
      >
        {/* Header: entity type dot + name */}
        <div className="flex items-start gap-2 mb-2.5">
          <span
            className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
          />
          <div className="min-w-0">
            <div className="text-slate-200 font-semibold text-[11px] leading-snug">
              {node.entityLabel || node.shortLabel || 'Unknown Entity'}
            </div>
            <div className="text-slate-600 text-[9px] truncate mt-0.5">
              {node.id.slice(0, 22)}…
            </div>
          </div>
        </div>

        {/* Depth label */}
        <div
          className="text-[8px] uppercase tracking-[0.1em] mb-1.5 px-1.5 py-0.5 rounded inline-block"
          style={{ background: color + '15', color: color + 'cc' }}
        >
          {depthLabel}
        </div>

        {/* Role interpretation */}
        <div className="text-slate-400 leading-relaxed text-[10px] mb-2.5">
          {interpretation}
        </div>

        {/* Risk flags */}
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {flags.map((f) => (
              <span
                key={f}
                className="text-[8px] px-1.5 py-0.5 rounded"
                style={{ background: riskColor + '18', color: riskColor + 'dd' }}
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Risk score row */}
        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: riskColor }} className="text-[10px] font-semibold">
              {node.riskLevel?.toUpperCase() || 'UNKNOWN'}
            </span>
            <span className="text-slate-600 text-[9px]">{entityLabel}</span>
          </div>
          <span className="text-slate-500 text-[10px]">
            {node.riskScore != null ? `${node.riskScore}/100` : '—'}
          </span>
        </div>

        {/* Volume + tx count (if available in graphMode) */}
        {node.volume != null && (
          <div
            className="flex items-center justify-between mt-1.5 text-[9px] text-slate-600"
          >
            <span>
              Vol:{' '}
              <span className="text-slate-400">
                {Number(node.volume ?? 0).toFixed(4)} BTC
              </span>
            </span>
            {node.txCount != null && (
              <span>
                {node.txCount} transactions
              </span>
            )}
          </div>
        )}

        {/* Behavioural summary */}
        {node.behaviouralSummary && graphMode !== 'flow' && (
          <div
            className="mt-2 pt-2 text-[9px] text-slate-600 italic leading-relaxed border-t"
            style={{ borderColor: 'rgba(255,255,255,0.05)' }}
          >
            {node.behaviouralSummary}
          </div>
        )}

        {/* Click hint */}
        <div
          className="mt-2 pt-1.5 text-[9px] text-slate-700 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.05)' }}
        >
          Click to open full investigation panel
        </div>
      </div>
    );
  }

  // ── Link (edge) tooltip ───────────────────────────────────────
  if (link) {
    const srcNode = typeof link.source === 'object' ? link.source : null;
    const tgtNode = typeof link.target === 'object' ? link.target : null;

    const srcLabel = srcNode?.shortLabel || srcNode?.entityLabel || getId(link.source).slice(0, 10) + '…';
    const tgtLabel = tgtNode?.shortLabel || tgtNode?.entityLabel || getId(link.target).slice(0, 10) + '…';

    const color = RISK_COLORS[link.risk] || '#475569';

    return (
      <div
        className="absolute z-30 pointer-events-none text-[11px] font-mono"
        style={{
          left: x,
          top: y,
          width: 220,
          background: 'rgba(9,10,18,0.97)',
          border: `1px solid ${color}40`,
          borderRadius: '9px',
          padding: '11px 13px',
          backdropFilter: 'blur(16px)',
          boxShadow: `0 8px 36px rgba(0,0,0,0.6)`,
          animation: 'fadeIn 0.1s ease',
        }}
      >
        {/* Risk level + direction */}
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-0.5 rounded flex-shrink-0" style={{ backgroundColor: color }} />
          <span
            className="text-[9px] uppercase tracking-widest"
            style={{ color }}
          >
            {link.risk || 'unknown'} risk
          </span>
        </div>

        {/* Flow direction */}
        <div className="text-slate-300 text-[10px] mb-1.5 flex items-center gap-1.5">
          <span className="text-slate-500">{srcLabel}</span>
          <span className="text-slate-700">→</span>
          <span className="text-slate-400">{tgtLabel}</span>
        </div>

        {/* Label / description */}
        {link.label && (
          <div className="text-slate-500 text-[10px] mb-1.5">{link.label}</div>
        )}

        {link.value != null && (
          <div className="text-slate-600 text-[9px]">
            Volume:{' '}
            <span className="text-slate-400">{Number(link.value ?? 0).toFixed(4)} BTC</span>
          </div>
        )}
      </div>
    );
  }

  return null;
}
