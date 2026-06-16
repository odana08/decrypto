import { useEffect, useState } from "react";

// ── 1. Graph Intelligence — animated transaction trace ────────────────────────
const FLOW_SOURCES = [
  { id: "s1", x: 56, y: 46 },
  { id: "s2", x: 56, y: 80 },
  { id: "s3", x: 56, y: 114 },
  { id: "s4", x: 56, y: 148 },
];

const FLOW_ROUTING = [
  { id: "r1", x: 188, y: 64 },
  { id: "r2", x: 204, y: 96, active: true },
  { id: "r3", x: 188, y: 128 },
];

const FLOW_DESTINATION = { x: 350, y: 96 };

const FLOW_PATHS = [
  {
    id: "p1",
    d: "M56 46 C110 46 150 52 188 64 S284 84 350 96",
    color: "#5eead4",
    particle: "#5eead4",
    primary: false,
  },
  {
    id: "p2",
    d: "M56 80 C116 78 158 86 204 96 S286 102 350 96",
    color: "#fb7185",
    particle: "#fb7185",
    primary: true,
  },
  {
    id: "p3",
    d: "M56 114 C118 114 158 106 204 96 S290 94 350 96",
    color: "#60a5fa",
    particle: "#60a5fa",
    primary: false,
  },
  {
    id: "p4",
    d: "M56 148 C108 148 148 138 188 128 S282 114 350 96",
    color: "#5eead4",
    particle: "#5eead4",
    primary: false,
  },
];

export const GraphDemo = () => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "18px 18px 16px",
      }}
    >
      <svg
        viewBox="0 0 400 180"
        width="100%"
        height="100%"
        role="img"
        aria-label="Transaction inputs and outputs are parsed around a target Bitcoin address."
      >
        <text
          x="64"
          y="24"
          fontSize="8"
          letterSpacing="0.12em"
          fontFamily="Inter, sans-serif"
          fill="rgba(226,232,240,0.72)"
        >
          VIN
        </text>
        <text
          x="200"
          y="24"
          textAnchor="middle"
          fontSize="8"
          letterSpacing="0.12em"
          fontFamily="Inter, sans-serif"
          fill="rgba(241,245,249,0.86)"
        >
          TARGET
        </text>
        <text
          x="336"
          y="24"
          textAnchor="middle"
          fontSize="8"
          letterSpacing="0.12em"
          fontFamily="Inter, sans-serif"
          fill="rgba(226,232,240,0.72)"
        >
          VOUT
        </text>

        <g>
          {FLOW_PATHS.map((path) => (
            <g key={path.id}>
              <path
                d={path.d}
                fill="none"
                stroke={path.color}
                strokeLinecap="round"
                strokeWidth={path.primary ? 2.5 : 1.2}
                opacity={path.primary ? 0.95 : 0.42}
              />
              <circle r={path.primary ? 2.4 : 1.8} fill={path.particle} opacity={path.primary ? 0.95 : 0.45}>
                <animateMotion
                  dur={path.primary ? "2.1s" : "3.1s"}
                  repeatCount="indefinite"
                  rotate="auto"
                  path={path.d}
                />
              </circle>
            </g>
          ))}
        </g>

        <g>
          {FLOW_SOURCES.map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r="4.8"
              fill="#d9e7f0"
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="1"
              opacity="0.92"
            />
          ))}

          {FLOW_ROUTING.map((node) => (
            <g key={node.id}>
              {node.active && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="16"
                  fill="rgba(251,113,133,0.12)"
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r="5.2"
                fill="#d9e7f0"
                stroke={node.active ? "rgba(251,113,133,0.36)" : "rgba(148,163,184,0.35)"}
                strokeWidth="1"
                opacity="0.94"
              />
            </g>
          ))}

          <circle
            cx={FLOW_DESTINATION.x}
            cy={FLOW_DESTINATION.y}
            r="23"
            fill="rgba(251,113,133,0.14)"
          />
          <circle
            cx={FLOW_DESTINATION.x}
            cy={FLOW_DESTINATION.y}
            r="7.6"
            fill="#fb7185"
            stroke="rgba(251,113,133,0.58)"
            strokeWidth="1.2"
          />
        </g>
      </svg>
    </div>
  );
};

// ── 2. Entity Clustering — three animated cluster groups ─────────────────────
export const ClusteringDemo = () => {
  const groups = [
    { label: "Incoming", color: "#6366f1", cx: 80, cy: 92, dots: [{x:57,y:74},{x:86,y:63},{x:106,y:83},{x:74,y:108},{x:54,y:100}] },
    { label: "Repeated", color: "#ef4444", cx: 210, cy: 98, dots: [{x:191,y:80},{x:218,y:73},{x:236,y:94},{x:220,y:118},{x:195,y:115}] },
    { label: "Outgoing", color: "#6b7280", cx: 340, cy: 92, dots: [{x:319,y:78},{x:350,y:70},{x:366,y:94},{x:350,y:115},{x:321,y:108}] },
  ];

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg viewBox="0 0 420 170" width="100%" height="100%">
        {groups.map(g => (
          <g key={g.label}>
            <ellipse cx={g.cx} cy={g.cy} rx={45} ry={40} fill="none"
              stroke={g.color} strokeWidth="1" strokeDasharray="3 3" opacity="0.2" />
            {g.dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={4.5} fill={g.color} fillOpacity={0.65}
                style={{
                  animation: `${["fltA","fltB","fltC","fltA","fltB"][i]} ${[3,3.5,2.8,4,3.2][i]}s ease-in-out infinite`,
                  animationDelay: `${i * 0.35}s`,
                }}
              />
            ))}
            <text x={g.cx} y={g.cy + 58} textAnchor="middle"
              fontSize="8.5" fill={g.color} fillOpacity="0.55" fontFamily="Inter,sans-serif">
              {g.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// ── 3. Real-Time Risk Scoring — animated arc gauge ────────────────────────────
export const RiskScoreDemo = () => {
  const [score, setScore] = useState(0);
  const TARGET = 73;

  useEffect(() => {
    let timeout;
    let val = 0;
    const tick = () => {
      if (val >= TARGET) {
        timeout = setTimeout(() => { val = 0; setScore(0); timeout = setTimeout(tick, 200); }, 2200);
        return;
      }
      val += 2;
      setScore(Math.min(val, TARGET));
      timeout = setTimeout(tick, 35);
    };
    timeout = setTimeout(tick, 500);
    return () => clearTimeout(timeout);
  }, []);

  const R = 52;
  const circ = 2 * Math.PI * R;
  const filled = (score / 100) * circ;
  const color = score < 40 ? "#22c55e" : score < 70 ? "#f59e0b" : "#ef4444";
  const riskLabel = score < 40 ? "LOW" : score < 70 ? "MEDIUM" : "HIGH";
  const metrics = [
    ["ROC AUC", "0.995"],
    ["Accuracy", "0.992"],
    ["Recall", "0.906"],
    ["F1", "0.944"],
  ];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px" }}>
      <div style={{ position: "relative" }}>
        <svg width="118" height="118" viewBox="0 0 134 134">
          <circle cx="67" cy="67" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <circle cx="67" cy="67" r={R} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 67 67)"
            style={{ transition: "stroke 0.6s" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "2rem", fontWeight: 700, color: "#f1f0f4", letterSpacing: "-0.04em", lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: "9px", fontWeight: 700, color, letterSpacing: "0.1em", marginTop: "4px" }}>{riskLabel}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "5px", width: "150px" }}>
        {metrics.map(([metric, value]) => (
          <div
            key={metric}
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "4px",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(148,163,184,0.74)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "8px",
              letterSpacing: "0.04em",
              padding: "3px 5px",
              textAlign: "center",
            }}
          >
            <div>{metric}</div>
            <div style={{ color: "rgba(226,232,240,0.9)", fontSize: "10px", marginTop: "1px" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── 4. Watchlist Screening — animated address scan ────────────────────────────
export const WatchlistDemo = () => {
  const rows = [
    { addr: "bc1q…9x8f", result: "clear" },
    { addr: "1Feex…sb6u", result: "flagged", match: "WATCHLIST" },
    { addr: "1Boat…tpyT", result: "clear" },
    { addr: "3J98…WNLy", result: "flagged", match: "MODEL RISK" },
    { addr: "bc1p…4k2m", result: "clear" },
  ];

  const [checked, setChecked] = useState(0);

  useEffect(() => {
    let timeout;
    let count = 0;
    const advance = () => {
      count = count < rows.length ? count + 1 : 0;
      setChecked(count);
      timeout = setTimeout(advance, count === 0 ? 500 : count === rows.length ? 2200 : 700);
    };
    timeout = setTimeout(advance, 400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div style={{ padding: "14px 18px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "9px" }}>
      {rows.map((row, i) => {
        const revealed = i < checked;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.22)", flexShrink: 0 }}>
              {row.addr}
            </span>
            <span style={{
              fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em",
              padding: "2px 8px", borderRadius: "3px", flexShrink: 0,
              opacity: revealed ? 1 : 0.2,
              background: revealed ? (row.result === "flagged" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.08)") : "rgba(255,255,255,0.03)",
              border: `1px solid ${revealed ? (row.result === "flagged" ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.25)") : "rgba(255,255,255,0.06)"}`,
              color: revealed ? (row.result === "flagged" ? "#ef4444" : "#4ade80") : "#374151",
              transition: "all 0.4s ease",
            }}>
              {revealed ? (row.result === "flagged" ? row.match : "CLEAR") : "···"}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── 5. Dataset Coverage — animated coverage bars ─────────────────────────────
export const DatasetDemo = () => {
  const chains = [
    { name: "FEATS", pct: 88 },
    { name: "LABELS", pct: 71 },
    { name: "EDGES", pct: 79 },
    { name: "SCORED", pct: 62 },
    { name: "SAMPLE", pct: 55 },
  ];

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ padding: "16px 22px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "11px" }}>
      {chains.map((c, i) => (
        <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: "44px", fontSize: "9px", fontWeight: 600, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{c.name}</span>
          <div style={{ flex: 1, height: "3px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: loaded ? `${c.pct}%` : "0%",
              background: "rgba(139,92,246,0.6)",
              borderRadius: "2px",
              transition: `width 0.9s cubic-bezier(0.4,0,0.2,1) ${i * 0.12}s`,
            }} />
          </div>
          <span style={{ width: "26px", fontSize: "9px", color: "#374151", textAlign: "right", flexShrink: 0 }}>{c.pct}%</span>
        </div>
      ))}
    </div>
  );
};

// ── 6. Audit Reporting — animated report generation ──────────────────────────
export const AuditDemo = () => {
  const lines = [
    { key: "Address",    val: "bc1q…k2m7" },
    { key: "Risk Score", val: "73 — HIGH",        accent: "#ef4444" },
    { key: "Watchlist",  val: "No match" },
    { key: "Exposure",   val: "0.84 BTC est." },
    { key: "Paths",      val: "3 inferred" },
    { key: "Top Driver", val: "SHAP ranked",       accent: "#a78bfa" },
    { key: "Source Txs", val: "18 observed" },
    { key: "Status",     val: "Review ready",      accent: "#4ade80" },
  ];

  const [count, setCount] = useState(0);

  useEffect(() => {
    let timeout;
    let i = 0;
    const advance = () => {
      i = i < lines.length ? i + 1 : 0;
      setCount(i);
      timeout = setTimeout(advance, i === 0 ? 500 : i === lines.length ? 2500 : 280);
    };
    timeout = setTimeout(advance, 300);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div style={{ padding: "14px 18px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: "9px", letterSpacing: "0.1em", color: "#374151", marginBottom: "12px" }}>
        {count >= lines.length ? "SUMMARY READY" : "BUILDING SUMMARY..."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
        {lines.slice(0, count).map((l, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", animation: "fadeSl 0.2s ease" }}>
            <span style={{ fontSize: "9px", color: "#374151", width: "64px", flexShrink: 0 }}>{l.key}</span>
            <span style={{ fontSize: "10px", color: l.accent || "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{l.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
