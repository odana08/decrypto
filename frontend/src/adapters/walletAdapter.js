import { ENTITY_COLORS, ENTITY_LABELS, RISK_COLORS } from '../constants';

export function riskScoreToLevel(score) {
  if (score >= 0.75) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.25) return 'medium';
  return 'low';
}

export function riskScoreToDisplay(score) {
  return Math.round((score ?? 0) * 100);
}

export function riskLevelToColor(level) {
  return RISK_COLORS[level] ?? RISK_COLORS.low;
}

export function formatBtc(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '0.000000 BTC';
  return `${Number(amount).toFixed(6)} BTC`;
}

export function shortAddr(address) {
  if (!address || address.length <= 14) return address ?? '';
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

export function detectChain(address) {
  if (!address) return 'Bitcoin';
  if (address.startsWith('bc1')) return 'Bitcoin (SegWit)';
  return 'Bitcoin';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function titleCase(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const FEATURE_COPY = {
  fees_as_share_max: {
    label: 'High fee spike',
    summary: 'One or more transfers paid unusually high fees relative to the amount moved.',
  },
  total_out: {
    label: 'Large outbound flow',
    summary: 'The wallet sends out a large amount of BTC, which can indicate rapid distribution of funds.',
  },
  total_in: {
    label: 'Large inbound flow',
    summary: 'The wallet receives a large amount of BTC in a concentrated pattern.',
  },
  unique_counterparties: {
    label: 'Broad counterparty spread',
    summary: 'Funds move across many distinct counterparties, which can suggest routing or layering behavior.',
  },
  tx_count: {
    label: 'High transaction frequency',
    summary: 'The wallet is unusually active compared with typical low-volume personal use.',
  },
  fees_total: {
    label: 'High cumulative fees',
    summary: 'The wallet has spent a notable amount on fees, which can reflect aggressive movement of funds.',
  },
  blocks_btwn_txs_mean: {
    label: 'Rapid transaction cadence',
    summary: 'Transactions are happening with relatively little time between them.',
  },
  transacted_w_address_total: {
    label: 'Wide address exposure',
    summary: 'The wallet interacts with a large number of unique addresses.',
  },
};

export function getFeatureInsight(feature) {
  const name = typeof feature === 'string' ? feature : feature?.feature;
  const fallbackLabel = titleCase(name ?? 'Risk signal');
  const fallbackSummary = 'This pattern was one of the stronger contributors to the wallet risk score.';
  const mapped = FEATURE_COPY[name];

  return {
    key: name ?? 'unknown_feature',
    label: mapped?.label ?? fallbackLabel,
    summary: mapped?.summary ?? fallbackSummary,
  };
}

function summariseCounterparty(type, riskLevel, volume, txCount) {
  const entityLabel = ENTITY_LABELS[type] ?? 'Wallet';
  const volumeText = formatBtc(volume);
  const txText = `${txCount ?? 0} tx${txCount === 1 ? '' : 's'}`;

  if (riskLevel === 'critical' || riskLevel === 'high') {
    return `${entityLabel} with elevated inferred exposure: ${txText} totalling an estimated ${volumeText}. Review the underlying transactions.`;
  }

  return `${entityLabel} observed across ${txText} with an estimated ${volumeText} in related transaction activity.`;
}

function deriveEdgeRisk(edge, walletRiskScore, maxVolume, maxTxCount) {
  const volumeSignal = (edge.btc_total ?? 0) / maxVolume;
  const txSignal = (edge.tx_count ?? 0) / maxTxCount;
  const roundTripSignal = edge.btc_sent > 0 && edge.btc_received > 0 ? 0.15 : 0;
  const raw = clamp(
    (volumeSignal * 0.5) + (txSignal * 0.25) + (walletRiskScore * 0.25) + roundTripSignal,
    0.08,
    0.98,
  );

  return {
    raw,
    level: riskScoreToLevel(raw),
  };
}

export function normalizeWalletRisk(response, address) {
  const level = riskScoreToLevel(response.risk_score ?? 0);
  const stats = response.stats ?? {};

  return {
    address: response.wallet_address ?? address,
    riskScore: riskScoreToDisplay(response.risk_score),
    riskLevel: level,
    riskLabel: titleCase(response.risk_label ?? level),
    riskColor: riskLevelToColor(level),
    totalTxCount: stats.total_txs ?? 0,
    outgoingTxCount: stats.num_txs_as_sender ?? 0,
    incomingTxCount: stats.num_txs_as_receiver ?? 0,
    totalOutgoing: formatBtc(stats.btc_sent_total),
    totalIncoming: formatBtc(stats.btc_received_total),
    totalVolume: formatBtc(stats.btc_transacted_total),
    uniqueCounterparties: stats.transacted_w_address_total ?? 0,
    feesTotal: formatBtc(stats.fees_total),
    feesShareMax: stats.fees_as_share_max != null
      ? `${(stats.fees_as_share_max * 100).toFixed(2)}%`
      : '-',
    blocksBetweenTxs: stats.blocks_btwn_txs_mean != null
      ? Number(stats.blocks_btwn_txs_mean).toFixed(1)
      : '-',
    chain: detectChain(response.wallet_address ?? address),
    featureSource: response.feature_source ?? 'live',
    behaviouralSummary: response.ai_summary ?? null,
    topFeatures: response.top_features ?? [],
    historyContext: response.history_context ?? null,
    analysisNotes: response.analysis_notes ?? [],
    watchlistMatch: response.watchlist_match ?? null,
    rawRiskScore: response.risk_score ?? 0,
    primaryFeature: getFeatureInsight(response.top_features?.[0]),
  };
}

export function normalizeGraph(graphResponse, walletRisk) {
  const walletRiskScore = walletRisk?.risk_score ?? 0;
  const centerAddress = graphResponse.center_wallet ?? walletRisk?.wallet_address ?? '';
  const edges = graphResponse.edges ?? [];
  const maxVolume = Math.max(...edges.map((edge) => edge.btc_total ?? 0), 1);
  const maxTxCount = Math.max(...edges.map((edge) => edge.tx_count ?? 0), 1);
  const aggregates = {};

  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    const txCount = edge.tx_count ?? 0;
    const btcSent = edge.btc_sent ?? 0;
    const btcReceived = edge.btc_received ?? 0;
    const btcTotal = edge.btc_total ?? 0;

    if (!aggregates[source]) {
      aggregates[source] = { volume: 0, totalSent: 0, totalReceived: 0, txCount: 0, inTx: 0, outTx: 0 };
    }
    if (!aggregates[target]) {
      aggregates[target] = { volume: 0, totalSent: 0, totalReceived: 0, txCount: 0, inTx: 0, outTx: 0 };
    }

    aggregates[source].volume += btcTotal;
    aggregates[source].totalSent += btcSent;
    aggregates[source].totalReceived += btcReceived;
    aggregates[source].txCount += txCount;
    if (btcSent > 0) aggregates[source].outTx += txCount;
    if (btcReceived > 0) aggregates[source].inTx += txCount;

    aggregates[target].volume += btcTotal;
    aggregates[target].totalReceived += btcSent;
    aggregates[target].totalSent += btcReceived;
    aggregates[target].txCount += txCount;
    if (btcSent > 0) aggregates[target].inTx += txCount;
    if (btcReceived > 0) aggregates[target].outTx += txCount;
  }

  const nodes = (graphResponse.nodes ?? []).map((node) => {
    const summary = aggregates[node.id] ?? { volume: 0, totalSent: 0, totalReceived: 0, txCount: 0, inTx: 0, outTx: 0 };
    const rawRisk = node.is_center
      ? walletRiskScore
      : clamp(
        (summary.volume / maxVolume) * 0.5 + (summary.txCount / maxTxCount) * 0.3 + walletRiskScore * 0.2,
        0.08,
        0.92,
      );
    const riskLevel = riskScoreToLevel(rawRisk);

    return {
      id: node.id,
      label: shortAddr(node.label ?? node.id),
      shortLabel: shortAddr(node.id),
      type: node.type ?? 'wallet',
      isCenter: node.is_center ?? false,
      entityLabel: node.is_center ? 'Investigated Wallet' : (ENTITY_LABELS[node.type] ?? 'Counterparty Wallet'),
      riskScore: riskScoreToDisplay(rawRisk),
      riskLevel,
      volume: Number(summary.volume ?? 0),
      txCount: summary.txCount ?? 0,
      inTx: summary.inTx ?? 0,
      outTx: summary.outTx ?? 0,
      totalSent: formatBtc(summary.totalSent),
      totalReceived: formatBtc(summary.totalReceived),
      behaviouralSummary: node.is_center
        ? (walletRisk?.ai_summary ?? 'Primary investigation target.')
        : summariseCounterparty(node.type ?? 'wallet', riskLevel, summary.volume ?? 0, summary.txCount ?? 0),
      behaviouralFlags: [
        summary.txCount > 3 ? 'Repeated transfers' : null,
        (summary.volume ?? 0) > 1 ? 'High BTC throughput' : null,
      ].filter(Boolean),
    };
  });

  const links = edges.map((edge) => {
    const { raw, level } = deriveEdgeRisk(edge, walletRiskScore, maxVolume, maxTxCount);

    return {
      source: edge.source,
      target: edge.target,
      txCount: edge.tx_count ?? 1,
      btcSent: edge.btc_sent ?? 0,
      btcReceived: edge.btc_received ?? 0,
      btcTotal: edge.btc_total ?? 0,
      topTransaction: edge.top_transaction ?? null,
      allTxids: edge.all_txids ?? [],
      risk: level,
      riskScore: riskScoreToDisplay(raw),
      value: edge.btc_total ?? 0,
      label: `${edge.tx_count ?? 1} tx${(edge.tx_count ?? 1) === 1 ? '' : 's'} · ${formatBtc(edge.btc_total ?? 0)}`,
    };
  });

  return { nodes, links, centerAddress };
}

const ENTITY_TYPE_MAP = {
  exchange: 'exchanges',
  mixer: 'mixers',
  sanctioned: 'sanctioned',
  bridge: 'bridges',
  darknet: 'darknet',
  high_risk_service: 'highRiskServices',
  ransomware: 'ransomware',
  laundering: 'laundering',
};

export function deriveEntityInsights(nodes) {
  const counts = {
    exchanges: 0,
    mixers: 0,
    sanctioned: 0,
    bridges: 0,
    darknet: 0,
    highRiskServices: 0,
    ransomware: 0,
    laundering: 0,
    wallets: 0,
  };

  for (const node of nodes) {
    if (node.isCenter) continue;
    const key = ENTITY_TYPE_MAP[node.type];
    if (key) counts[key] += 1;
    else counts.wallets += 1;
  }

  return counts;
}

export function deriveCounterpartyData(nodes, links, centerAddress) {
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const aggregate = {};

  for (const link of links) {
    const counterparty = link.source === centerAddress ? link.target : link.source;
    if (counterparty === centerAddress) continue;

    if (!aggregate[counterparty]) {
      aggregate[counterparty] = {
        address: counterparty,
        label: nodeMap[counterparty]?.shortLabel ?? shortAddr(counterparty),
        type: nodeMap[counterparty]?.type ?? 'wallet',
        txCount: 0,
        btcSent: 0,
        btcReceived: 0,
        btcTotal: 0,
        riskLevel: nodeMap[counterparty]?.riskLevel ?? 'low',
      };
    }

    aggregate[counterparty].txCount += link.txCount;
    aggregate[counterparty].btcSent += link.btcSent;
    aggregate[counterparty].btcReceived += link.btcReceived;
    aggregate[counterparty].btcTotal += link.btcTotal;
  }

  return Object.values(aggregate)
    .sort((a, b) => b.btcTotal - a.btcTotal)
    .slice(0, 10)
    .map((counterparty) => ({
      ...counterparty,
      name: counterparty.label,
      volume: counterparty.btcTotal,
      color: ENTITY_COLORS[counterparty.type] ?? ENTITY_COLORS.wallet ?? '#94a3b8',
      btcTotalFormatted: formatBtc(counterparty.btcTotal),
    }));
}

export function deriveTransactionsFromEdges(links, centerAddress) {
  const rows = [];

  for (const link of links) {
    if (!link.topTransaction) continue;

    const tx = link.topTransaction;
    const isOutgoing = link.source === centerAddress;
    const timestampUnix = tx.timestamp ?? null;

    rows.push({
      id: tx.txid ?? `${link.source}_${link.target}`,
      txid: tx.txid ?? '',
      direction: isOutgoing ? 'out' : 'in',
      counterparty: isOutgoing ? link.target : link.source,
      counterpartyLabel: isOutgoing ? shortAddr(link.target) : shortAddr(link.source),
      amount: formatBtc(isOutgoing ? link.btcSent : link.btcReceived),
      amountRaw: isOutgoing ? link.btcSent : link.btcReceived,
      totalVolume: formatBtc(link.btcTotal),
      txCount: link.txCount,
      blockHeight: tx.block_height ?? null,
      timestampUnix,
      timestamp: timestampUnix
        ? new Date(timestampUnix * 1000).toISOString().replace('T', ' ').slice(0, 16)
        : 'Pending',
      token: 'BTC',
      riskFlag: titleCase(link.risk ?? 'low'),
      riskLevel: link.risk ?? 'low',
      category: 'Intermediary Wallet',
    });
  }

  return rows.sort((a, b) => {
    if (b.timestampUnix && a.timestampUnix) return b.timestampUnix - a.timestampUnix;
    return b.amountRaw - a.amountRaw;
  });
}

export function deriveAlerts(walletRiskRaw) {
  const alerts = [];
  const score = walletRiskRaw?.risk_score ?? 0;
  const features = walletRiskRaw?.top_features ?? [];
  const level = riskScoreToLevel(score);
  const watchlistMatch = walletRiskRaw?.watchlist_match ?? null;
  const analysisNotes = walletRiskRaw?.analysis_notes ?? [];

  if (watchlistMatch) {
    alerts.push({
      id: 'watchlist-match',
      severity: watchlistMatch.severity ?? 'critical',
      title: watchlistMatch.label ?? 'Known flagged wallet',
      description: watchlistMatch.reason ?? 'This address matched the local analyst watchlist.',
      timestamp: new Date().toISOString(),
    });
  }

  if (level === 'critical' || level === 'high') {
    alerts.push({
      id: 'risk-classification',
      severity: level,
      title: `Wallet classified as ${titleCase(walletRiskRaw.risk_label ?? level)}`,
      description: `ML risk score ${riskScoreToDisplay(score)}/100 based on the available wallet features. Treat this as a screening result, not proof of wrongdoing.`,
      timestamp: new Date().toISOString(),
    });
  }

  for (const [index, feature] of features.entries()) {
    const name = feature.feature ?? feature;
    if (name === 'watchlist_match') continue;
    const insight = getFeatureInsight(feature);
    const importance = feature.importance != null
      ? ` (importance ${(feature.importance * 100).toFixed(1)}%)`
      : '';

    alerts.push({
      id: `feature-${index}`,
      severity: index === 0 ? 'high' : 'medium',
      title: insight.label,
      description: `${insight.summary}${importance}`,
      timestamp: new Date().toISOString(),
    });
  }

  analysisNotes.forEach((note, index) => {
    alerts.push({
      id: `analysis-note-${index}`,
      severity: 'info',
      title: 'Analysis scope note',
      description: note,
      timestamp: new Date().toISOString(),
    });
  });

  if (!alerts.length) {
    alerts.push({
      id: 'no-alerts',
      severity: 'info',
      title: 'No high-risk indicators detected',
      description: 'The available model features do not show strong elevated-risk indicators.',
      timestamp: new Date().toISOString(),
    });
  }

  return alerts;
}

export function deriveTimelineData(txRows) {
  if (!txRows.length) return [];

  const byMonth = {};
  for (const tx of txRows) {
    if (!tx.timestampUnix) continue;

    const date = new Date(tx.timestampUnix * 1000);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleString('en-US', { month: 'short', year: '2-digit' });

    if (!byMonth[key]) {
      byMonth[key] = { key, month: label, incoming: 0, outgoing: 0 };
    }

    if (tx.direction === 'in') byMonth[key].incoming += tx.amountRaw ?? 0;
    else byMonth[key].outgoing += tx.amountRaw ?? 0;
  }

  return Object.values(byMonth)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => {
      const { key: _timelineKey, ...rest } = item;
      return rest;
    });
}
