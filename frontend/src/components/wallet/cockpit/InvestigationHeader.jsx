export default function InvestigationHeader({
  address,
  suspiciousFeature,
  primaryFinding,
}) {
  return (
    <div className="px-2 pb-1 sm:px-3">
      <div className="rounded-[20px] border border-white/5 bg-[#0d0f17] px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.16)]">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-400">
            {suspiciousFeature ? `Suspicious feature: ${suspiciousFeature}` : 'Wallet investigation'}
          </div>

          <h1
            className="mt-2 break-all font-mono text-[18px] font-medium leading-7 text-slate-100 sm:text-[20px] sm:leading-8"
            title={address}
          >
            {address}
          </h1>

          <p className="mt-2 max-w-3xl text-[14px] leading-6 text-slate-500">
            {primaryFinding ?? 'Scoring wallet behavior, ranking inferred counterparties, and estimating relationships from live on-chain transaction inputs and outputs.'}
          </p>
        </div>
      </div>
    </div>
  );
}
