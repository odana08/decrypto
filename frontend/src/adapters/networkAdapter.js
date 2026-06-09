import { riskScoreToLevel, riskScoreToDisplay, riskLevelToColor, shortAddr } from './walletAdapter';

function formatBtc(value) {
  return `${Number(value ?? 0).toFixed(4)} BTC`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'Now';
  return new Date(timestamp * 1000).toLocaleString();
}

export function normalizeNetworkSummary(response) {
  if (!response || response.data_source === 'unavailable') {
    return {
      unavailable: true,
      message: response?.message ?? 'Network data is not available.',
      walletsScan: 0,
      flaggedWallets: 0,
      flaggedPct: '0.0%',
      unknownWallets: 0,
      suspiciousTxCount: 0,
      counterpartyExposure: 0,
      repeatCounterpartyWallets: 0,
      medianFlaggedVolume: '0.0000 BTC',
      graphEdgeCount: 0,
      networkRiskIndex: '0.0',
      networkRiskLevel: 'low',
      networkRiskColor: riskLevelToColor('low'),
      scanTimestamp: null,
      dataSource: 'unavailable',
    };
  }

  const riskLevel = riskScoreToLevel(response.network_risk_index ?? 0);

  return {
    unavailable: false,
    walletsScan: response.wallets_scanned ?? 0,
    flaggedWallets: response.flagged_wallets ?? 0,
    flaggedPct: `${Number(response.flagged_pct ?? 0).toFixed(1)}%`,
    unknownWallets: response.unknown_wallets ?? 0,
    suspiciousTxCount: response.suspicious_tx_count ?? 0,
    counterpartyExposure: response.counterparty_exposure ?? 0,
    repeatCounterpartyWallets: response.repeat_counterparty_wallets ?? 0,
    medianFlaggedVolume: formatBtc(response.median_flagged_volume_btc),
    graphEdgeCount: response.graph?.edges?.length ?? 0,
    networkRiskIndex: ((response.network_risk_index ?? 0) * 10).toFixed(1),
    networkRiskLevel: riskLevel,
    networkRiskColor: riskLevelToColor(riskLevel),
    scanTimestamp: response.scan_timestamp ?? null,
    dataSource: response.data_source ?? 'local_dataset',
    message: response.message ?? null,
  };
}

export function normalizeRankedEntities(entities) {
  if (!Array.isArray(entities)) return [];

  return entities.map((entity, index) => {
    const level = riskScoreToLevel(entity.risk_score ?? 0);
    const address = entity.address ?? entity.wallet_address ?? `unknown-${index}`;

    return {
      rank: index + 1,
      address,
      label: shortAddr(address),
      type: entity.entity_type ?? 'wallet',
      primaryFlag: entity.primary_flag ?? 'Observed high-risk behaviour',
      volume: formatBtc(entity.volume_btc ?? 0),
      riskScore: riskScoreToDisplay(entity.risk_score),
      riskLevel: level,
      riskColor: riskLevelToColor(level),
      riskLabel: entity.risk_label ?? level,
    };
  });
}

export function deriveNetworkAlerts(networkMetrics, rankedEntities) {
  if (networkMetrics.unavailable) return [];

  const alerts = [];
  const criticalEntities = rankedEntities.filter((entity) => entity.riskLevel === 'critical');

  if (Number(networkMetrics.networkRiskIndex) >= 7) {
    alerts.push({
      id: 'network-risk',
      severity: networkMetrics.networkRiskLevel,
      title: `Network risk index elevated at ${networkMetrics.networkRiskIndex}/10`,
      description: `${networkMetrics.flaggedPct} of scanned wallets are model-classified as illicit, with ${networkMetrics.suspiciousTxCount.toLocaleString()} transactions associated with those wallets in the local dataset.`,
      timestamp: formatTimestamp(networkMetrics.scanTimestamp),
      category: 'Dataset summary',
      wallets: networkMetrics.flaggedWallets,
      volume: networkMetrics.medianFlaggedVolume,
      icon: 'shield-alert',
    });
  }

  if (criticalEntities.length > 0) {
    const topEntity = criticalEntities[0];
    alerts.push({
      id: 'critical-wallets',
      severity: 'critical',
      title: `${criticalEntities.length} critical-risk wallet${criticalEntities.length === 1 ? '' : 's'} in top-ranked entities`,
      description: `${topEntity.address} is currently the highest-ranked wallet, flagged for ${topEntity.primaryFlag.toLowerCase()}.`,
      timestamp: formatTimestamp(networkMetrics.scanTimestamp),
      category: 'Ranked entities',
      wallets: criticalEntities.length,
      volume: topEntity.volume,
      icon: 'git-branch',
    });
  }

  if (networkMetrics.counterpartyExposure > 0) {
    alerts.push({
      id: 'counterparty-exposure',
      severity: Number(networkMetrics.networkRiskIndex) >= 5 ? 'high' : 'medium',
      title: `${networkMetrics.counterpartyExposure.toLocaleString()} dataset counterparty links tied to model-flagged wallets`,
      description: `${networkMetrics.repeatCounterpartyWallets.toLocaleString()} model-flagged wallets repeatedly interacted with the same counterparties in the dataset edge list.`,
      timestamp: formatTimestamp(networkMetrics.scanTimestamp),
      category: 'Counterparty exposure',
      wallets: networkMetrics.repeatCounterpartyWallets,
      volume: networkMetrics.medianFlaggedVolume,
      icon: 'repeat',
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: 'network-ok',
      severity: 'medium',
      title: 'Network scan completed successfully',
      description: `${networkMetrics.walletsScan.toLocaleString()} wallets were analysed and ranked for follow-up investigation.`,
      timestamp: formatTimestamp(networkMetrics.scanTimestamp),
      category: 'Scan status',
      wallets: networkMetrics.walletsScan,
      volume: networkMetrics.medianFlaggedVolume,
      icon: 'filter',
    });
  }

  return alerts;
}

export function normalizeNetworkGraph(graphData, entities) {
  if (!graphData) return { nodes: [], links: [] };

  const entityMap = Object.fromEntries(entities.map((entity) => [entity.address, entity]));

  const nodes = (graphData.nodes ?? []).map((node) => {
    const entity = entityMap[node.id];
    return {
      id: node.id,
      label: node.label ?? shortAddr(node.id),
      shortLabel: shortAddr(node.id),
      type: node.type ?? 'wallet',
      volume: node.volume_btc ?? 0,
      riskScore: entity?.riskScore ?? riskScoreToDisplay(node.risk_score ?? 0),
      riskLevel: entity?.riskLevel ?? riskScoreToLevel(node.risk_score ?? 0),
      isHub: node.is_hub ?? false,
    };
  });

  const links = (graphData.edges ?? []).map((edge) => ({
    source: edge.source,
    target: edge.target,
    txCount: edge.tx_count ?? 1,
    risk: edge.risk ?? 'medium',
    value: edge.value ?? 0,
  }));

  return { nodes, links };
}
