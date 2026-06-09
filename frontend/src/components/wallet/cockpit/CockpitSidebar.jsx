import {
  Rows3,
  Users,
  Activity,
  AlertTriangle,
} from 'lucide-react';

const NAV_SECTIONS = [
  { key: 'transactions', label: 'Source Txs', icon: Rows3, countKey: 'txCount' },
  { key: 'counterparties', label: 'Inferred Parties', icon: Users, countKey: 'counterparties' },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'alerts', label: 'Alerts', icon: AlertTriangle, countKey: 'alerts' },
];

function NavItem({ section, active, count, onClick }) {
  const Icon = section.icon;
  const hasCount = count !== undefined && count > 0;

  return (
    <button
      onClick={() => onClick(section.key)}
      className={`flex items-center justify-between gap-3 rounded-full px-4 py-2.5 text-left transition-colors ${
        active
          ? 'bg-white/[0.08] text-slate-100'
          : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon size={14} className={`flex-shrink-0 ${active ? 'text-slate-200' : ''}`} />
        <span className="truncate text-[12px] font-medium">
          {section.label}
        </span>
      </div>
      {hasCount && (
        <span className={`min-w-[2rem] text-right text-[12px] ${section.key === 'alerts' ? 'text-rose-300' : 'text-slate-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function CockpitSidebar({
  activeSection,
  onSectionChange,
  txCount,
  counterparties,
  alerts,
}) {
  const counts = { txCount, counterparties, alerts };

  return (
    <div className="sticky top-3 z-30 rounded-[20px] border border-white/5 bg-[#0d0f17]/96 px-3 py-3 shadow-[0_8px_18px_rgba(0,0,0,0.14)] backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        {NAV_SECTIONS.map((section) => (
          <NavItem
            key={section.key}
            section={section}
            active={activeSection === section.key}
            count={counts[section.countKey]}
            onClick={onSectionChange}
          />
        ))}
      </div>
    </div>
  );
}
