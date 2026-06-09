import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  GitBranch,
  Maximize2,
  Minimize2,
  Workflow,
} from 'lucide-react';
import { ENTITY_LABELS } from '../../../constants';
import { formatBtc, shortAddr } from '../../../adapters/walletAdapter';

const VIEWBOX = { width: 820, height: 470 };
const COLUMN_X = { source: 120, routing: 410, destination: 700 };
const CENTER_POINT = { x: VIEWBOX.width / 2, y: 238 };
const HIGH_RISK_TYPES = new Set([
  'sanctioned', 'laundering', 'ransomware', 'darknet', 'high_risk_service', 'scam_cluster',
]);

const RISK_WEIGHT = { critical: 4.5, high: 3.2, medium: 2, low: 1 };

const LEGEND_ITEMS = [
  { label: 'Input side', color: '#f8fafc' },
  { label: 'Investigated', color: '#93c5fd' },
  { label: 'Exchange', color: '#fbbf24' },
  { label: 'Mixer', color: '#c084fc' },
  { label: 'Flagged', color: '#f87171' },
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
  if (node.aliasOf === centerAddress || node.id === centerAddress) return 'Investigated';
  if (node.type === 'exchange' || node.type === 'bridge') return 'Exchange';
  if (node.type === 'mixer') return 'Mixer';
  if (isHighRiskNode(node)) return 'Flagged';
  if (column === 'source') return 'Input side';
  if (column === 'routing') return 'Routing';
  if (column === 'center') return 'Investigated';
  return ENTITY_LABELS[node.type] ?? 'Output side';
}

function getNodeVisual(node, column, centerAddress) {
  if (node?.type === 'exchange' || node?.type === 'bridge') {
    return { fill: '#fbbf24', ring: 'rgba(251,191,36,0.24)', text: '#fde68a', icon: 'E' };
  }
  if (node?.type === 'mixer') {
    return { fill: '#c084fc', ring: 'rgba(192,132,252,0.24)', text: '#ddd6fe', icon: 'M' };
  }
  if (isHighRiskNode(node)) {
    return { fill: '#f87171', ring: 'rgba(248,113,113,0.26)', text: '#fecaca', icon: '!' };
  }
  if (node?.id === centerAddress || node?.aliasOf === centerAddress || column === 'center') {
    return { fill: '#93c5fd', ring: 'rgba(96,165,250,0.28)', text: '#bfdbfe', icon: 'I' };
  }
  if (column === 'source') {
    return { fill: '#f8fafc', ring: 'rgba(248,250,252,0.16)', text: '#e2e8f0', icon: 'S' };
  }
  return { fill: '#60a5fa', ring: 'rgba(96,165,250,0.20)', text: '#bfdbfe', icon: 'D' };
}

function getLinkColor(level, primary = false) {
  if (level === 'critical') return '#fb7185';
  if (level === 'high') return '#f97316';
  if (level === 'medium') return primary ? '#fbbf24' : '#5eead4';
  return primary ? '#60a5fa' : '#5eead4';
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
    id: centerAddress, label: centerAddress, type: 'wallet',
    riskScore: 0, riskLevel: 'low', volume: 0, txCount: 0,
  };
  nodeMap.set(aliasId, {
    ...centerNode, id: aliasId, aliasOf: centerAddress, isAlias: true, isCenter: false,
  });
}

function buildStarPaths(nodeMap, links, centerAddress) {
  const incomingLinks = links.filter((l) => (l.btcReceived ?? 0) > 0).sort(sortLinksByPriority).slice(0, 3);
  const outgoingLinks = links.filter((l) => (l.btcSent ?? 0) > 0).sort(sortLinksByPriority).slice(0, 3);
  const paths = [];

  if (incomingLinks.length && outgoingLinks.length) {
    incomingLinks.forEach((inLink) => {
      outgoingLinks.forEach((outLink) => {
        const sourceId = getId(inLink.target);
        const destinationId = getId(outLink.target);
        if (!sourceId || !destinationId || sourceId === destinationId) return;
        paths.push({
          id: `flow-${sourceId}-${centerAddress}-${destinationId}`,
          sourceId, routingId: centerAddress, destinationId,
          firstLink: inLink, secondLink: outLink,
          score: scorePath(nodeMap.get(sourceId), nodeMap.get(centerAddress), nodeMap.get(destinationId), inLink, outLink, centerAddress),
        });
      });
    });
  }

  if (!paths.length && outgoingLinks.length) {
    const sourceAliasId = `__stage_source__${centerAddress}`;
    ensureAliasNode(nodeMap, centerAddress, sourceAliasId);
    outgoingLinks.forEach((outLink) => {
      const destinationId = getId(outLink.target);
      if (!destinationId) return;
      paths.push({
        id: `flow-${sourceAliasId}-${centerAddress}-${destinationId}`,
        sourceId: sourceAliasId, routingId: centerAddress, destinationId,
        firstLink: outLink, secondLink: outLink, singleEdge: true,
        score: scorePath(nodeMap.get(sourceAliasId), nodeMap.get(centerAddress), nodeMap.get(destinationId), outLink, outLink, centerAddress),
      });
    });
  }

  if (!paths.length && incomingLinks.length) {
    const destAliasId = `__stage_destination__${centerAddress}`;
    ensureAliasNode(nodeMap, centerAddress, destAliasId);
    incomingLinks.forEach((inLink) => {
      const sourceId = getId(inLink.target);
      if (!sourceId) return;
      paths.push({
        id: `flow-${sourceId}-${centerAddress}-${destAliasId}`,
        sourceId, routingId: centerAddress, destinationId: destAliasId,
        firstLink: inLink, secondLink: inLink, singleEdge: true,
        score: scorePath(nodeMap.get(sourceId), nodeMap.get(centerAddress), nodeMap.get(destAliasId), inLink, inLink, centerAddress),
      });
    });
  }

  if (!paths.length && links.length) {
    const sourceAliasId = `__stage_source__${centerAddress}`;
    ensureAliasNode(nodeMap, centerAddress, sourceAliasId);
    links.slice().sort(sortLinksByPriority).slice(0, 4).forEach((link) => {
      const destinationId = getId(link.target);
      if (!destinationId) return;
      paths.push({
        id: `flow-${sourceAliasId}-${centerAddress}-${destinationId}`,
        sourceId: sourceAliasId, routingId: centerAddress, destinationId,
        firstLink: link, secondLink: link, singleEdge: true,
        score: scorePath(nodeMap.get(sourceAliasId), nodeMap.get(centerAddress), nodeMap.get(destinationId), link, link, centerAddress),
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
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const rankedPaths = buildStarPaths(nodeMap, links, centerAddress);
  const stagedPaths = arrangePaths(rankedPaths).map((path, i) => ({
    ...path, primary: i === 1 || (rankedPaths.length === 1 && i === 0),
  }));
  if (!stagedPaths.some((p) => p.primary) && stagedPaths[0]) stagedPaths[0].primary = true;

  const sourceIds = [...new Set(stagedPaths.map((p) => p.sourceId))];
  const routingIds = [...new Set(stagedPaths.map((p) => p.routingId))];
  const destinationIds = [...new Set(stagedPaths.map((p) => p.destinationId))];

  const sourceY = distribute(sourceIds.length, 150, 370);
  const routingY = distribute(routingIds.length, 204, 316);
  const destinationY = distribute(destinationIds.length, 150, 370);

  const positions = new Map();
  sourceIds.forEach((id, i) => positions.set(id, { x: COLUMN_X.source, y: sourceY[i], column: 'source' }));
  routingIds.forEach((id, i) => positions.set(id, { x: COLUMN_X.routing, y: routingY[i], column: 'routing' }));
  destinationIds.forEach((id, i) => positions.set(id, { x: COLUMN_X.destination, y: destinationY[i], column: 'destination' }));

  const usedNodeIds = new Set([...sourceIds, ...routingIds, ...destinationIds]);

  const paths = stagedPaths.map((path, index) => {
    const source = positions.get(path.sourceId);
    const routing = positions.get(path.routingId);
    const destination = positions.get(path.destinationId);
    const startControlX = source.x + 100;
    const midControlX = routing.x - 100;
    const routingControlX = routing.x + 100;
    const bend = clamp((destination.y - source.y) * 0.1, -24, 24);

    return {
      ...path,
      index,
      mode: 'path',
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
    nodes: [...usedNodeIds].map((id) => ({ ...nodeMap.get(id), ...positions.get(id) })),
    items: paths,
    hiddenNodeCount: Math.max(0, nodes.length - usedNodeIds.size),
    hiddenLinkCount: Math.max(0, links.length - paths.length * 2),
  };
}

function buildConnectionGraph(nodes, links, centerAddress, showAllNodes) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const centerId = nodeMap.has(centerAddress) ? centerAddress : nodes.find((node) => node.isCenter)?.id ?? nodes[0]?.id;
  const rankedNodes = nodes
    .filter((node) => node.id !== centerId)
    .sort((left, right) => (
      riskWeight(right.riskLevel) - riskWeight(left.riskLevel) ||
      (right.volume ?? 0) - (left.volume ?? 0) ||
      (right.txCount ?? 0) - (left.txCount ?? 0)
    ));

  const visiblePeripheralNodes = showAllNodes ? rankedNodes : rankedNodes.slice(0, 10);
  const visibleIds = new Set([centerId, ...visiblePeripheralNodes.map((node) => node.id)]);
  const rankedLinks = links
    .filter((link) => visibleIds.has(getId(link.source)) && visibleIds.has(getId(link.target)))
    .sort(sortLinksByPriority);
  const visibleLinks = showAllNodes ? rankedLinks : rankedLinks.slice(0, 14);

  const positions = new Map();
  positions.set(centerId, { ...CENTER_POINT, column: 'center' });

  visiblePeripheralNodes.forEach((node, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / Math.max(visiblePeripheralNodes.length, 1));
    positions.set(node.id, {
      x: CENTER_POINT.x + (Math.cos(angle) * 270),
      y: CENTER_POINT.y + (Math.sin(angle) * 156),
      column: 'orbit',
      angle,
    });
  });

  const displayNodes = [...visibleIds]
    .map((id) => ({ ...nodeMap.get(id), ...positions.get(id) }))
    .filter(Boolean);

  const items = visibleLinks.map((link, index) => {
    const sourceId = getId(link.source);
    const destinationId = getId(link.target);
    const source = positions.get(sourceId);
    const destination = positions.get(destinationId);
    if (!source || !destination) return null;

    const dx = destination.x - source.x;
    const dy = destination.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const midpointX = (source.x + destination.x) / 2;
    const midpointY = (source.y + destination.y) / 2;
    const curveSize = sourceId === centerId || destinationId === centerId ? 24 : 40;
    const direction = index % 2 === 0 ? 1 : -1;
    const controlX = midpointX + (normalX * curveSize * direction);
    const controlY = midpointY + (normalY * curveSize * direction);

    return {
      id: `connection-${sourceId}-${destinationId}-${index}`,
      mode: 'connection',
      sourceId,
      destinationId,
      source,
      destination,
      firstLink: link,
      secondLink: link,
      primary: index === 0,
      txCount: link.txCount ?? 0,
      volume: link.btcTotal ?? 0,
      risk: link.risk ?? 'low',
      direction: sourceId === centerId ? 'Outbound' : destinationId === centerId ? 'Inbound' : 'Lateral',
      d: `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${destination.x} ${destination.y}`,
      label: `${link.txCount ?? 1} tx | ${formatBtc(link.btcTotal ?? 0)}`,
    };
  }).filter(Boolean);

  return {
    nodes: displayNodes,
    items,
    hiddenNodeCount: Math.max(0, nodes.length - displayNodes.length),
    hiddenLinkCount: Math.max(0, rankedLinks.length - items.length),
  };
}

function ModeButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-white/[0.08] text-slate-100'
          : 'border border-white/8 bg-[#101320]/92 text-slate-400 hover:text-white'
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

export default function CockpitGraph({
  nodes = [],
  links = [],
  centerAddress,
  onNodeSelect,
  onPathSelect,
  selectedNodeId,
}) {
  const reducedMotion = useReducedMotion();
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredPathId, setHoveredPathId] = useState(null);
  const [lockedNodeId, setLockedNodeId] = useState(null);
  const [lockedPathId, setLockedPathId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [graphMode, setGraphMode] = useState('paths');
  const [showHiddenNodes, setShowHiddenNodes] = useState(false);

  const structuredGraph = useMemo(() => buildStructuredGraph(nodes, links, centerAddress), [nodes, links, centerAddress]);
  const connectionGraph = useMemo(
    () => buildConnectionGraph(nodes, links, centerAddress, showHiddenNodes),
    [nodes, links, centerAddress, showHiddenNodes]
  );
  const isConnectionsView = graphMode === 'connections' || showHiddenNodes;
  const graph = isConnectionsView ? connectionGraph : structuredGraph;
  const primaryItem = graph.items.find((item) => item.primary) ?? graph.items[0] ?? null;
  const containerClassName = expanded
    ? 'fixed inset-4 z-[90] overflow-hidden rounded-[28px] bg-[#0c0e16] shadow-[0_28px_120px_rgba(0,0,0,0.55)]'
    : 'relative h-full min-h-[520px] overflow-hidden rounded-[28px] bg-[#0c0e16] shadow-[0_24px_60px_rgba(0,0,0,0.24)]';

  const activeItemIds = useMemo(() => {
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
      graph.items.forEach((item) => {
        const nodeIds = item.mode === 'connection'
          ? [item.sourceId, item.destinationId]
          : [item.sourceId, item.routingId, item.destinationId];
        if (nodeIds.includes(focusedNodeId)) ids.add(item.id);
      });
      if (ids.size) return ids;
    }
    if (primaryItem) ids.add(primaryItem.id);
    return ids;
  }, [graph.items, hoveredNodeId, hoveredPathId, lockedNodeId, lockedPathId, primaryItem, selectedNodeId]);

  const focusedNode = graph.nodes.find((node) => node.id === (lockedNodeId || selectedNodeId || hoveredNodeId)) ?? null;

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

  useEffect(() => {
    setHoveredPathId(null);
    setLockedPathId(null);
    onPathSelect?.(null);
  }, [graphMode, onPathSelect, showHiddenNodes]);

  const handleNodeClick = (node) => {
    const shouldRelease = lockedNodeId === node.id || selectedNodeId === node.id;
    const payload = node.aliasOf ? { ...node, id: node.aliasOf, aliasOf: undefined } : node;
    setLockedNodeId((current) => (current === node.id ? null : node.id));
    setLockedPathId(null);
    onPathSelect?.(null);
    onNodeSelect?.(shouldRelease ? null : payload);
  };

  const handlePathClick = (item) => {
    const nextIsSame = lockedPathId === item.id;
    setLockedPathId((current) => (current === item.id ? null : item.id));
    setLockedNodeId(null);
    onNodeSelect?.(null);
    onPathSelect?.(nextIsSame ? null : item);
  };

  const headerTitle = isConnectionsView ? 'Inferred transaction links' : 'Readable inferred paths';
  const headerSummary = isConnectionsView
    ? (
      showHiddenNodes
        ? `Showing ${graph.nodes.length} nodes and ${graph.items.length} inferred links from observed vin/vout data.`
        : `Showing ${graph.items.length} strongest inferred links with ${graph.hiddenNodeCount} additional nodes available.`
    )
    : `Showing ${graph.items.length} key inferred path${graph.items.length === 1 ? '' : 's'} and hiding ${graph.hiddenNodeCount} low-priority nodes.`;

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
        className={containerClassName}
        style={expanded ? { minHeight: 'calc(100vh - 2rem)' } : undefined}
        onMouseLeave={() => {
          setHoveredNodeId(null);
          setHoveredPathId(null);
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at center, rgba(139,92,246,0.04) 0%, rgba(9,11,18,0) 54%)' }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 26%, rgba(9,11,18,0.92) 100%)' }} />

        <div className="absolute left-6 top-6 z-10 max-w-[420px]">
          <div className="text-[11px] font-medium text-slate-500">Wallet relationship inference</div>
          <div className="mt-1 text-lg font-medium text-slate-100">{headerTitle}</div>
          <div className="mt-1 text-sm leading-6 text-slate-500">{headerSummary}</div>
        </div>

        <div className="absolute right-6 top-6 z-20 flex flex-wrap justify-end gap-2">
          <ModeButton
            active={!isConnectionsView}
            icon={GitBranch}
            label="Key paths"
            onClick={() => {
              setGraphMode('paths');
              setShowHiddenNodes(false);
            }}
          />
          <ModeButton
            active={graphMode === 'connections' && !showHiddenNodes}
            icon={Workflow}
            label="Links"
            onClick={() => setGraphMode('connections')}
          />
          <button
            type="button"
            onClick={() => {
              setGraphMode('connections');
              setShowHiddenNodes((current) => !current);
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-medium transition-colors ${
              showHiddenNodes
                ? 'border-white/12 bg-white/[0.08] text-slate-100'
                : 'border-white/8 bg-[#101320]/92 text-slate-400 hover:text-white'
            }`}
          >
            {showHiddenNodes ? <EyeOff size={12} /> : <Eye size={12} />}
            {showHiddenNodes ? 'Hide extras' : `Show ${Math.max(graph.hiddenNodeCount, structuredGraph.hiddenNodeCount)} hidden`}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#101320]/92 px-3 py-2 text-[11px] font-medium text-slate-300 transition-colors hover:text-white"
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          {!isConnectionsView && (
            <>
              <text x={COLUMN_X.source - 24} y="116" fontSize="11" fontFamily="'JetBrains Mono', monospace" fill="rgba(148,163,184,0.64)">
                Input side
              </text>
              <text x={COLUMN_X.routing} y="116" textAnchor="middle" fontSize="11" fontFamily="'JetBrains Mono', monospace" fill="rgba(148,163,184,0.64)">
                Routing layer
              </text>
              <text x={COLUMN_X.destination + 40} y="116" textAnchor="end" fontSize="11" fontFamily="'JetBrains Mono', monospace" fill="rgba(148,163,184,0.64)">
                Output side
              </text>
            </>
          )}

          <g>
            {graph.items.map((item) => {
              const isActive = activeItemIds.has(item.id);
              const stroke = getLinkColor(item.risk, item.primary);
              const width = item.primary ? 3.6 : item.mode === 'connection' ? 2.2 : 2;
              const opacity = isActive ? (item.primary ? 1 : 0.68) : item.mode === 'connection' ? 0.24 : 0.14;

              return (
                <g key={item.id}>
                  <motion.path
                    d={item.d}
                    fill="none"
                    stroke={stroke}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity }}
                    transition={{ duration: 0.65, ease: 'easeOut' }}
                    style={{ strokeWidth: width }}
                  />
                  {!reducedMotion && isActive && (
                    <motion.circle r={item.primary ? 2.8 : 2} fill={stroke} opacity={0.82}>
                      <animateMotion dur={item.primary ? '2s' : '3s'} repeatCount="indefinite" path={item.d} />
                    </motion.circle>
                  )}
                  <path
                    d={item.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    strokeLinecap="round"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPathId(item.id)}
                    onClick={() => handlePathClick(item)}
                  />
                </g>
              );
            })}
          </g>

          <g>
            {graph.nodes.map((node) => {
              const visual = getNodeVisual(node, node.column, centerAddress);
              const isHighlighted = graph.items.some((item) => {
                const nodeIds = item.mode === 'connection'
                  ? [item.sourceId, item.destinationId]
                  : [item.sourceId, item.routingId, item.destinationId];
                return activeItemIds.has(item.id) && nodeIds.includes(node.id);
              });
              const isActive = focusedNode?.id === node.id || isHighlighted;
              const isSelected = selectedNodeId === node.id || lockedNodeId === node.id;
              const nodeRadius = node.column === 'center' ? 11 : isSelected ? 11 : isActive ? 9.5 : 8;
              const meaning = getNodeMeaning(node, node.column, centerAddress);
              const address = shortAddr(node.aliasOf ?? node.id);
              const isConnectionNode = isConnectionsView;
              const labelAnchor = isConnectionNode ? 'middle' : node.column === 'destination' ? 'end' : node.column === 'source' ? 'start' : 'middle';
              const labelX = isConnectionNode ? node.x : node.column === 'destination' ? node.x - 18 : node.column === 'source' ? node.x + 18 : node.x;
              const labelY = isConnectionNode
                ? (node.column === 'center' ? node.y - 20 : node.y + 24)
                : (node.column === 'routing' ? node.y + 22 : node.y - 6);
              const sublabelY = isConnectionNode
                ? (node.column === 'center' ? node.y - 8 : node.y + 36)
                : (node.column === 'routing' ? node.y + 34 : node.y + 8);

              return (
                <g key={node.id} className="cursor-pointer" onMouseEnter={() => setHoveredNodeId(node.id)} onClick={() => handleNodeClick(node)}>
                  {(isSelected || focusedNode?.id === node.id) && (
                    <circle cx={node.x} cy={node.y} r={nodeRadius + 10} fill={visual.ring} opacity={0.45} />
                  )}
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={nodeRadius}
                    fill={visual.fill}
                    stroke={isSelected ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.10)'}
                    strokeWidth={isSelected ? 2 : 1}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1, opacity: isActive ? 1 : 0.5 }}
                    transition={{ duration: 0.24 }}
                  />
                  <text x={node.x} y={node.y + 3.5} textAnchor="middle" fontSize="9" fontWeight="600" fill="rgba(0,0,0,0.68)">
                    {visual.icon}
                  </text>
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor={labelAnchor}
                    fontSize="10"
                    fontFamily="'JetBrains Mono', monospace"
                    fill="rgba(226,232,240,0.84)"
                  >
                    {address}
                  </text>
                  <text
                    x={labelX}
                    y={sublabelY}
                    textAnchor={labelAnchor}
                    fontSize="9"
                    fill={visual.text}
                    opacity="0.7"
                  >
                    {meaning}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-4 left-6 right-6 z-10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div>
            Hover to inspect. Click to lock focus. Links are inferred from transaction inputs and outputs. {graph.hiddenLinkCount} supporting link{graph.hiddenLinkCount === 1 ? '' : 's'} hidden.
          </div>
        </div>
      </div>
    </>
  );
}
