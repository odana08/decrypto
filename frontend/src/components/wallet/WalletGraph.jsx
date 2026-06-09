import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Maximize2, Minimize2 } from 'lucide-react';
import { ENTITY_LABELS } from '../../constants';
import { formatBtc, shortAddr } from '../../adapters/walletAdapter';

const VIEWBOX = { width: 920, height: 500 };
const COLUMN_X = { source: 136, routing: 456, destination: 782 };
const HIGH_RISK_TYPES = new Set([
  'sanctioned',
  'laundering',
  'ransomware',
  'darknet',
  'high_risk_service',
  'scam_cluster',
]);

const RISK_WEIGHT = {
  critical: 4.5,
  high: 3.2,
  medium: 2,
  low: 1,
};

const LEGEND_ITEMS = [
  { label: 'Input side', color: '#f8fafc' },
  { label: 'Intermediate', color: '#60a5fa' },
  { label: 'Exchange', color: '#fbbf24' },
  { label: 'Mixer', color: '#c084fc' },
  { label: 'High risk', color: '#f87171' },
];

function getId(ref) {
  return ref && typeof ref === 'object' ? ref.id : ref;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function riskWeight(level) {
  return RISK_WEIGHT[level] ?? 1;
}

function isHighRiskNode(node) {
  if (!node) return false;
  return HIGH_RISK_TYPES.has(node.type) || node.riskLevel === 'critical' || node.riskLevel === 'high';
}

function sortLinksByPriority(left, right) {
  return riskWeight(right.risk) - riskWeight(left.risk) || (right.value ?? 0) - (left.value ?? 0);
}

function getNodeMeaning(node, column, centerAddress) {
  if (!node) return 'Wallet';
  if (node.aliasOf === centerAddress || node.id === centerAddress) return 'Investigated wallet';
  if (node.type === 'exchange' || node.type === 'bridge') return 'Exchange';
  if (node.type === 'mixer') return 'Mixer';
  if (isHighRiskNode(node)) return 'Flagged wallet';
  if (column === 'source') return 'Input-side wallet';
  if (column === 'routing') return 'Intermediate wallet';
  return ENTITY_LABELS[node.type] ?? 'Output-side wallet';
}

function getNodeVisual(node, column, centerAddress) {
  if (node?.type === 'exchange' || node?.type === 'bridge') {
    return { fill: '#fbbf24', ring: 'rgba(251,191,36,0.26)', text: '#fde68a' };
  }
  if (node?.type === 'mixer') {
    return { fill: '#c084fc', ring: 'rgba(192,132,252,0.26)', text: '#ddd6fe' };
  }
  if (isHighRiskNode(node)) {
    return { fill: '#f87171', ring: 'rgba(248,113,113,0.28)', text: '#fecaca' };
  }
  if (column === 'source') {
    return { fill: '#f8fafc', ring: 'rgba(248,250,252,0.18)', text: '#e2e8f0' };
  }
  if (node?.id === centerAddress || node?.aliasOf === centerAddress) {
    return { fill: '#93c5fd', ring: 'rgba(96,165,250,0.34)', text: '#bfdbfe' };
  }
  return { fill: '#60a5fa', ring: 'rgba(96,165,250,0.22)', text: '#bfdbfe' };
}

function distribute(count, min, max) {
  if (count <= 0) return [];
  if (count === 1) return [(min + max) / 2];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function scorePath(sourceNode, routingNode, destinationNode, firstLink, secondLink, centerAddress) {
  const volume = (firstLink.value ?? firstLink.btcTotal ?? 0) + (secondLink.value ?? secondLink.btcTotal ?? 0);
  const nodeRiskScore =
    ((sourceNode?.riskScore ?? 0) + (routingNode?.riskScore ?? 0) + (destinationNode?.riskScore ?? 0)) / 100;
  const centerBoost = [sourceNode?.id, routingNode?.id, destinationNode?.id].includes(centerAddress) ? 3.4 : 0;
  const destinationBoost = isHighRiskNode(destinationNode) ? 2.4 : destinationNode?.type === 'exchange' ? 1.2 : 0;
  const routingBoost = routingNode?.type === 'mixer' ? 1.9 : routingNode?.id === centerAddress ? 1.4 : 0.6;

  return (
    riskWeight(firstLink.risk) * 1.1 +
    riskWeight(secondLink.risk) * 1.25 +
    destinationBoost +
    routingBoost +
    centerBoost +
    nodeRiskScore +
    Math.log10(volume + 1)
  );
}

function dedupePaths(paths) {
  const seen = new Set();
  return paths.filter((path) => {
    const key = `${path.sourceId}|${path.routingId}|${path.destinationId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureAliasNode(nodeMap, centerAddress, aliasId) {
  if (nodeMap.has(aliasId)) return;

  const centerNode = nodeMap.get(centerAddress) ?? {
    id: centerAddress,
    label: centerAddress,
    type: 'wallet',
    riskScore: 0,
    riskLevel: 'low',
    volume: 0,
    txCount: 0,
  };

  nodeMap.set(aliasId, {
    ...centerNode,
    id: aliasId,
    aliasOf: centerAddress,
    isAlias: true,
    isCenter: false,
  });
}

function buildStarPaths(nodeMap, links, centerAddress) {
  const incomingLinks = links
    .filter((link) => (link.btcReceived ?? 0) > 0)
    .sort(sortLinksByPriority)
    .slice(0, 3);
  const outgoingLinks = links
    .filter((link) => (link.btcSent ?? 0) > 0)
    .sort(sortLinksByPriority)
    .slice(0, 3);

  const paths = [];

  if (incomingLinks.length && outgoingLinks.length) {
    incomingLinks.forEach((incomingLink) => {
      outgoingLinks.forEach((outgoingLink) => {
        const sourceId = getId(incomingLink.target);
        const destinationId = getId(outgoingLink.target);
        if (!sourceId || !destinationId || sourceId === destinationId) return;

        paths.push({
          id: `flow-${sourceId}-${centerAddress}-${destinationId}`,
          sourceId,
          routingId: centerAddress,
          destinationId,
          firstLink: incomingLink,
          secondLink: outgoingLink,
          score: scorePath(
            nodeMap.get(sourceId),
            nodeMap.get(centerAddress),
            nodeMap.get(destinationId),
            incomingLink,
            outgoingLink,
            centerAddress,
          ),
        });
      });
    });
  }

  if (!paths.length && outgoingLinks.length) {
    const sourceAliasId = `__stage_source__${centerAddress}`;
    ensureAliasNode(nodeMap, centerAddress, sourceAliasId);

    outgoingLinks.forEach((outgoingLink) => {
      const destinationId = getId(outgoingLink.target);
      if (!destinationId) return;

      paths.push({
        id: `flow-${sourceAliasId}-${centerAddress}-${destinationId}`,
        sourceId: sourceAliasId,
        routingId: centerAddress,
        destinationId,
        firstLink: outgoingLink,
        secondLink: outgoingLink,
        singleEdge: true,
        score: scorePath(
          nodeMap.get(sourceAliasId),
          nodeMap.get(centerAddress),
          nodeMap.get(destinationId),
          outgoingLink,
          outgoingLink,
          centerAddress,
        ),
      });
    });
  }

  if (!paths.length && incomingLinks.length) {
    const destinationAliasId = `__stage_destination__${centerAddress}`;
    ensureAliasNode(nodeMap, centerAddress, destinationAliasId);

    incomingLinks.forEach((incomingLink) => {
      const sourceId = getId(incomingLink.target);
      if (!sourceId) return;

      paths.push({
        id: `flow-${sourceId}-${centerAddress}-${destinationAliasId}`,
        sourceId,
        routingId: centerAddress,
        destinationId: destinationAliasId,
        firstLink: incomingLink,
        secondLink: incomingLink,
        singleEdge: true,
        score: scorePath(
          nodeMap.get(sourceId),
          nodeMap.get(centerAddress),
          nodeMap.get(destinationAliasId),
          incomingLink,
          incomingLink,
          centerAddress,
        ),
      });
    });
  }

  if (!paths.length && links.length) {
    const sourceAliasId = `__stage_source__${centerAddress}`;
    ensureAliasNode(nodeMap, centerAddress, sourceAliasId);

    links
      .slice()
      .sort(sortLinksByPriority)
      .slice(0, 4)
      .forEach((link) => {
        const destinationId = getId(link.target);
        if (!destinationId) return;

        paths.push({
          id: `flow-${sourceAliasId}-${centerAddress}-${destinationId}`,
          sourceId: sourceAliasId,
          routingId: centerAddress,
          destinationId,
          firstLink: link,
          secondLink: link,
          singleEdge: true,
          score: scorePath(
            nodeMap.get(sourceAliasId),
            nodeMap.get(centerAddress),
            nodeMap.get(destinationId),
            link,
            link,
            centerAddress,
          ),
        });
      });
  }

  return dedupePaths(paths).sort((a, b) => b.score - a.score).slice(0, 4);
}

function arrangePaths(paths) {
  if (paths.length <= 1) return paths;
  const [primary, ...rest] = paths;
  if (paths.length === 2) return [primary, rest[0]];
  if (paths.length === 3) return [rest[0], primary, rest[1]];
  return [rest[0], primary, rest[1], rest[2]];
}

function buildStructuredGraph(nodes, links, centerAddress) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const rankedPaths = buildStarPaths(nodeMap, links, centerAddress);

  const stagedPaths = arrangePaths(rankedPaths).map((path, index) => ({
    ...path,
    primary: index === 1 || (rankedPaths.length === 1 && index === 0),
  }));

  if (!stagedPaths.some((path) => path.primary) && stagedPaths[0]) {
    stagedPaths[0].primary = true;
  }

  const sourceIds = [...new Set(stagedPaths.map((path) => path.sourceId))];
  const routingIds = [...new Set(stagedPaths.map((path) => path.routingId))];
  const destinationIds = [...new Set(stagedPaths.map((path) => path.destinationId))];

  const sourceY = distribute(sourceIds.length, 116, 392);
  const routingY = distribute(routingIds.length, 176, 328);
  const destinationY = distribute(destinationIds.length, 116, 392);

  const positions = new Map();
  sourceIds.forEach((id, index) => positions.set(id, { x: COLUMN_X.source, y: sourceY[index], column: 'source' }));
  routingIds.forEach((id, index) => positions.set(id, { x: COLUMN_X.routing, y: routingY[index], column: 'routing' }));
  destinationIds.forEach((id, index) => positions.set(id, { x: COLUMN_X.destination, y: destinationY[index], column: 'destination' }));

  const usedLinkKeys = new Set();
  const usedNodeIds = new Set([...sourceIds, ...routingIds, ...destinationIds]);

  const paths = stagedPaths.map((path, index) => {
    const source = positions.get(path.sourceId);
    const routing = positions.get(path.routingId);
    const destination = positions.get(path.destinationId);

    usedLinkKeys.add(`${getId(path.firstLink.source)}-${getId(path.firstLink.target)}-${path.firstLink.txCount ?? 0}`);
    usedLinkKeys.add(`${getId(path.secondLink.source)}-${getId(path.secondLink.target)}-${path.secondLink.txCount ?? 0}`);

    const startControlX = source.x + 110;
    const midControlX = routing.x - 110;
    const routingControlX = routing.x + 112;
    const bend = clamp((destination.y - source.y) * 0.1, -28, 28);

    return {
      ...path,
      index,
      source,
      routing,
      destination,
      d: [
        `M ${source.x} ${source.y}`,
        `C ${startControlX} ${source.y}, ${midControlX} ${routing.y + bend}, ${routing.x} ${routing.y}`,
        `S ${routingControlX} ${routing.y - bend}, ${destination.x} ${destination.y}`,
      ].join(' '),
      label: path.singleEdge
        ? `${path.firstLink.txCount ?? 1} tx | ${formatBtc(path.firstLink.btcTotal ?? 0)}`
        : `${path.firstLink.txCount ?? 1} + ${path.secondLink.txCount ?? 1} tx | ${formatBtc((path.firstLink.btcTotal ?? 0) + (path.secondLink.btcTotal ?? 0))}`,
    };
  });

  return {
    nodes: [...usedNodeIds].map((id) => ({
      ...nodeMap.get(id),
      ...positions.get(id),
    })),
    paths,
    hiddenNodeCount: Math.max(0, nodes.length - usedNodeIds.size),
    hiddenLinkCount: Math.max(0, links.length - usedLinkKeys.size),
  };
}

function formatFocusMetric(value, fallback = '0') {
  return value != null && value !== '' ? value : fallback;
}

function NodeLabel({ node, column, centerAddress }) {
  const visual = getNodeVisual(node, column, centerAddress);
  const address = shortAddr(node.aliasOf ?? node.id);
  const meaning = getNodeMeaning(node, column, centerAddress);
  const textAnchor = column === 'destination' ? 'end' : column === 'routing' ? 'middle' : 'start';
  const textX = column === 'source' ? node.x + 22 : column === 'destination' ? node.x - 22 : node.x;
  const baseY = column === 'routing' ? node.y + 26 : node.y - 8;

  return (
    <>
      <text
        x={textX}
        y={baseY}
        textAnchor={textAnchor}
        fontSize="11"
        fontFamily="'JetBrains Mono', monospace"
        fill="rgba(226,232,240,0.86)"
      >
        {address}
      </text>
      <text
        x={textX}
        y={baseY + 14}
        textAnchor={textAnchor}
        fontSize="9.5"
        fontFamily="Inter, sans-serif"
        fill={visual.text}
      >
        {meaning}
      </text>
    </>
  );
}

function FocusCard({ focusedNode, focusedPath, centerAddress, locked, className = '' }) {
  const title = focusedNode
    ? shortAddr(focusedNode.aliasOf ?? focusedNode.id)
    : focusedPath
      ? `${shortAddr(focusedPath.source.aliasOf ?? focusedPath.sourceId)} -> ${shortAddr(focusedPath.destination.aliasOf ?? focusedPath.destinationId)}`
      : 'Primary inferred path';

  const subtitle = focusedNode
    ? getNodeMeaning(focusedNode, focusedNode.column, centerAddress)
    : focusedPath
      ? focusedPath.label
      : 'Key path highlighted by default';

  return (
    <div
      className={`absolute right-5 z-20 w-64 rounded-xl border border-white/8 bg-[#0b0d16]/92 p-4 backdrop-blur ${className}`}
      style={{ boxShadow: '0 18px 48px rgba(0,0,0,0.28)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
            {locked ? 'Locked focus' : 'Focus detail'}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-100">{title}</div>
        </div>
        {locked && (
          <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.18em] text-slate-400">
            click again to release
          </span>
        )}
      </div>

      <div className="mt-3 text-[12px] leading-relaxed text-slate-400">{subtitle}</div>

      {focusedNode && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2">
            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Risk</div>
            <div className="mt-1 text-slate-200">{focusedNode.riskScore ?? 0}/100</div>
          </div>
          <div className="rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2">
            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Activity</div>
            <div className="mt-1 text-slate-200">{formatFocusMetric(focusedNode.txCount, 0)} tx</div>
          </div>
          <div className="col-span-2 rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2">
            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-slate-600">Volume</div>
            <div className="mt-1 text-slate-200">{formatBtc(focusedNode.volume ?? 0)}</div>
          </div>
        </div>
      )}

      {!focusedNode && focusedPath && (
        <div className="mt-4 rounded-lg border border-white/6 bg-white/[0.03] px-3 py-3 text-[11px] text-slate-300">
          <div className="font-mono uppercase tracking-[0.16em] text-slate-600">Path summary</div>
          <div className="mt-2">{focusedPath.label}</div>
          <div className="mt-1 text-slate-500">
            {shortAddr(focusedPath.source.aliasOf ?? focusedPath.sourceId)} via {shortAddr(focusedPath.routing.aliasOf ?? focusedPath.routingId)} to {shortAddr(focusedPath.destination.aliasOf ?? focusedPath.destinationId)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WalletGraph({ nodes = [], links = [], onNodeClick, selectedNodeId, centerAddress }) {
  const ref = useRef(null);
  const reducedMotion = useReducedMotion();
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredPathId, setHoveredPathId] = useState(null);
  const [lockedNodeId, setLockedNodeId] = useState(null);
  const [lockedPathId, setLockedPathId] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const graph = useMemo(() => buildStructuredGraph(nodes, links, centerAddress), [nodes, links, centerAddress]);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 88%', 'end 22%'],
  });

  const sourceOpacity = useTransform(scrollYProgress, [0, 0.14], [0, 1]);
  const sourceRadius = useTransform(scrollYProgress, [0, 0.14], [6, 9]);
  const edgeDraw = useTransform(scrollYProgress, [0.12, 0.34], [0, 1]);
  const routingOpacity = useTransform(scrollYProgress, [0.24, 0.46], [0, 1]);
  const routingRadius = useTransform(scrollYProgress, [0.24, 0.46], [6, 9.5]);
  const destinationOpacity = useTransform(scrollYProgress, [0.38, 0.6], [0, 1]);
  const destinationRadius = useTransform(scrollYProgress, [0.38, 0.6], [6.5, 10.5]);
  const highlightHaloOpacity = useTransform(scrollYProgress, [0.58, 0.82], [0, 0.28]);
  const labelReveal = useTransform(scrollYProgress, [0.2, 0.5], [0, 1]);

  const primaryPath = graph.paths.find((path) => path.primary) ?? graph.paths[0] ?? null;

  const activePathIds = useMemo(() => {
    const ids = new Set();
    const focusedNodeId = lockedNodeId || selectedNodeId || hoveredNodeId;

    if (lockedPathId) {
      ids.add(lockedPathId);
      return ids;
    }

    if (hoveredPathId) {
      ids.add(hoveredPathId);
      return ids;
    }

    if (focusedNodeId) {
      graph.paths.forEach((path) => {
        if ([path.sourceId, path.routingId, path.destinationId].includes(focusedNodeId)) {
          ids.add(path.id);
        }
      });
      if (ids.size) return ids;
    }

    if (primaryPath) ids.add(primaryPath.id);
    return ids;
  }, [graph.paths, hoveredNodeId, hoveredPathId, lockedNodeId, lockedPathId, primaryPath, selectedNodeId]);

  const focusedNode =
    graph.nodes.find((node) => node.id === (lockedNodeId || selectedNodeId || hoveredNodeId)) ?? null;
  const focusedPath = graph.paths.find((path) => path.id === (lockedPathId || hoveredPathId)) ?? primaryPath ?? null;
  const isLocked = Boolean(lockedNodeId || lockedPathId);
  const containerClassName = expanded
    ? 'fixed inset-4 z-[90] overflow-hidden rounded-[24px] border border-white/8 bg-[#0a0c14] shadow-[0_28px_120px_rgba(0,0,0,0.55)]'
    : 'relative overflow-hidden rounded-[24px] border border-white/6 bg-[#0a0c14]';

  useEffect(() => {
    if (!expanded) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expanded]);

  return (
    <>
      {expanded && (
        <button
          type="button"
          aria-label="Close expanded graph"
          className="fixed inset-0 z-[89] bg-black/72 backdrop-blur-[2px]"
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        ref={ref}
        className={containerClassName}
        style={{ minHeight: expanded ? 'calc(100vh - 2rem)' : '560px' }}
        onMouseLeave={() => {
          setHoveredNodeId(null);
          setHoveredPathId(null);
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle at center, rgba(17,24,39,0) 0%, rgba(8,10,15,0.88) 100%)' }}
        />

        <div className="absolute left-6 top-5 z-20">
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Relationship inference</div>
          <div className="mt-2 text-lg font-medium text-slate-100">Observed transactions arranged into inferred paths</div>
          <div className="mt-1 text-sm text-slate-500">
            Showing {graph.paths.length} key inferred path{graph.paths.length === 1 ? '' : 's'} and hiding {graph.hiddenNodeCount} low-priority nodes for clarity.
          </div>
        </div>

        <div className="absolute right-5 top-5 z-30">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0b0d16]/92 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-300 transition-colors hover:text-white"
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        <FocusCard
          focusedNode={focusedNode}
          focusedPath={focusedPath}
          centerAddress={centerAddress}
          locked={isLocked}
          className="top-[4.5rem]"
        />

        <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} width="100%" height="100%" role="img" aria-label="Structured investigation graph">
          <motion.text
            x={COLUMN_X.source - 36}
            y="82"
            fontSize="11"
            fontFamily="'JetBrains Mono', monospace"
            fill="rgba(148,163,184,0.72)"
            style={{ opacity: labelReveal }}
          >
            Input side
          </motion.text>
          <motion.text
            x={COLUMN_X.routing}
            y="82"
            textAnchor="middle"
            fontSize="11"
            fontFamily="'JetBrains Mono', monospace"
            fill="rgba(148,163,184,0.72)"
            style={{ opacity: labelReveal }}
          >
            Routing layer
          </motion.text>
          <motion.text
            x={COLUMN_X.destination + 14}
            y="82"
            textAnchor="end"
            fontSize="11"
            fontFamily="'JetBrains Mono', monospace"
            fill="rgba(148,163,184,0.72)"
            style={{ opacity: labelReveal }}
          >
            Output side
          </motion.text>

          <g>
            {graph.paths.map((path) => {
              const isActive = activePathIds.has(path.id);
              const stroke = path.primary ? '#f87171' : '#5eead4';
              const width = path.primary ? 4.2 : 2.2;
              const opacity = isActive ? (path.primary ? 1 : 0.72) : 0.18;

              return (
                <g key={path.id}>
                  <motion.path
                    d={path.d}
                    fill="none"
                    stroke={stroke}
                    strokeLinecap="round"
                    style={{
                      pathLength: edgeDraw,
                      opacity,
                      strokeWidth: width,
                    }}
                  />

                  {!reducedMotion && (
                    <motion.circle
                      r={path.primary ? 3.2 : 2.2}
                      fill={stroke}
                      style={{ opacity: isActive ? (path.primary ? 0.95 : 0.45) : 0 }}
                    >
                      <animateMotion
                        dur={path.primary ? '2.1s' : '3.2s'}
                        repeatCount="indefinite"
                        rotate="auto"
                        path={path.d}
                      />
                    </motion.circle>
                  )}

                  <path
                    d={path.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="18"
                    strokeLinecap="round"
                    onMouseEnter={() => setHoveredPathId(path.id)}
                    onClick={() => {
                      setLockedPathId((current) => (current === path.id ? null : path.id));
                      setLockedNodeId(null);
                    }}
                  />
                </g>
              );
            })}
          </g>

          <g>
            {graph.nodes.map((node) => {
              const visual = getNodeVisual(node, node.column, centerAddress);
              const isHighlightedByPath = graph.paths.some(
                (path) =>
                  activePathIds.has(path.id) &&
                  [path.sourceId, path.routingId, path.destinationId].includes(node.id),
              );
              const isActive = focusedNode?.id === node.id ? true : isHighlightedByPath;
              const isSelected = selectedNodeId === node.id || lockedNodeId === node.id;
              const revealOpacity =
                node.column === 'source'
                  ? sourceOpacity
                  : node.column === 'routing'
                    ? routingOpacity
                    : destinationOpacity;
              const radius =
                node.column === 'source'
                  ? sourceRadius
                  : node.column === 'routing'
                    ? routingRadius
                    : destinationRadius;
              const haloOpacity = isSelected || focusedNode?.id === node.id ? highlightHaloOpacity : 0;

              return (
                <g key={node.id}>
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r="22"
                    fill={visual.ring}
                    style={{ opacity: haloOpacity }}
                  />
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={visual.fill}
                    stroke={isSelected ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.12)'}
                    strokeWidth={isSelected ? '2' : '1.1'}
                    style={{ opacity: isActive ? revealOpacity : 0.42 }}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onClick={() => {
                      const shouldRelease = lockedNodeId === node.id || selectedNodeId === node.id;
                      const payload = node.aliasOf ? { ...node, id: node.aliasOf, aliasOf: undefined } : node;
                      setLockedNodeId((current) => (current === node.id ? null : node.id));
                      setLockedPathId(null);
                      onNodeClick?.(shouldRelease ? null : payload);
                    }}
                  />
                  <motion.g style={{ opacity: labelReveal }}>
                    <NodeLabel node={node} column={node.column} centerAddress={centerAddress} />
                  </motion.g>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-5 left-6 right-6 z-20 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-slate-500">
            Hover to inspect, click to lock focus, {graph.hiddenLinkCount} supporting links hidden by default.
          </div>
        </div>
      </div>
    </>
  );
}
