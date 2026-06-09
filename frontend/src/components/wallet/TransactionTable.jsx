import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import EntityBadge from '../shared/EntityBadge';

const ENTITY_TYPE_MAP = {
  'Exchange Deposit': 'exchange',
  'Mixer / Obfuscation': 'mixer',
  'Sanctioned Entity': 'sanctioned',
  'Smart Contract': 'contract',
  'Layering Network': 'laundering',
  'Bridge Transfer': 'bridge',
  'Scam Cluster': 'scam_cluster',
  'Escrow / Guarantee Mkt': 'escrow',
  'Intermediary Wallet': 'wallet',
};

export default function TransactionTable({ transactions }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
        <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Source Transactions</div>
        <div className="text-[10px] font-mono text-slate-600">{transactions.length} records</div>
      </div>

      <div className="flex-shrink-0 grid text-[10px] font-mono uppercase tracking-widest text-slate-600 px-4 py-1.5"
        style={{
          gridTemplateColumns: '120px 50px 140px 90px 55px 120px auto',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
        <span>Timestamp</span>
        <span>Dir</span>
        <span>Inferred Party</span>
        <span className="text-right">Est. Amount</span>
        <span>Token</span>
        <span>Category</span>
        <span>Risk Flag</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="grid px-4 py-1.5 hover:bg-white/[0.02] transition-colors border-b border-white/[0.025] items-center"
            style={{ gridTemplateColumns: '120px 50px 140px 90px 55px 120px auto' }}
          >
            <span className="text-[10px] font-mono text-slate-500">{tx.timestamp || 'Pending'}</span>
            <div className="flex items-center">
              {tx.direction === 'in' ? (
                <ArrowDownLeft size={12} className="text-green-400" />
              ) : (
                <ArrowUpRight size={12} className="text-red-400" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-mono text-slate-400 truncate">{tx.counterparty}</span>
              <span className="text-[10px] text-slate-600 truncate">{tx.counterpartyLabel}</span>
            </div>
            <span className={`text-[11px] font-mono text-right ${tx.direction === 'in' ? 'text-green-400' : 'text-red-400'}`}>
              {tx.direction === 'in' ? '+' : '-'}{tx.amount}
            </span>
            <span className="text-[10px] font-mono text-slate-500">{tx.token}</span>
            <div>
              <EntityBadge type={ENTITY_TYPE_MAP[tx.category] || 'wallet'} size="xs" />
            </div>
            <div>
              {tx.riskFlag ? (
                <span className={`text-[10px] font-mono ${
                  tx.riskLevel === 'critical' ? 'text-red-400'
                    : tx.riskLevel === 'high' ? 'text-orange-400'
                      : tx.riskLevel === 'medium' ? 'text-yellow-400' : 'text-slate-500'
                }`}>
                  Flag {tx.riskFlag}
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-700">-</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
