import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion";
import {
  ShieldAlert, ChevronDown,
} from "lucide-react";
import LetterGlitch from "./LetterGlitch";
import HorizontalScrollCarousel from "./ui/horizontal-scroll-carousel";
import { GraphDemo, ClusteringDemo, RiskScoreDemo, WatchlistDemo, DatasetDemo, AuditDemo } from "./ui/capability-demos";

const PROBLEMS = [
  {
    id: 1,
    title: "Source",
    value: "Live",
    subtitle: "mempool.space wallet data",
    bullets: [
      "The backend fetches recent Bitcoin address transactions from mempool.space.",
      "Address summary fields and raw vin/vout records become the evidence base.",
    ],
  },
  {
    id: 2,
    title: "Features",
    value: "49",
    subtitle: "Model input columns",
    bullets: [
      "Transaction counts, BTC amounts, fees, timing gaps, and counterparty breadth are computed.",
      "Cached dataset rows are used when available; otherwise live features are built.",
    ],
  },
  {
    id: 3,
    title: "Graph",
    value: "Inferred",
    subtitle: "Links from transaction structure",
    bullets: [
      "Inputs and outputs are inspected to infer wallets that appear around the target.",
      "Edges are aggregated observations, not proof of ownership or intent.",
    ],
  },
  {
    id: 4,
    title: "Output",
    value: "Screening",
    subtitle: "Model score plus evidence",
    bullets: [
      "The classifier returns a risk score and label for follow-up review.",
      "The UI shows source transactions, feature drivers, warnings, and inferred parties.",
    ],
  },
];

const FEATURES = [
  {
    Demo: GraphDemo,
    label: "Transaction Parsing",
    desc: "Reads recent mempool.space transactions and separates target-side inputs, outputs, fees, and BTC amounts.",
  },
  {
    Demo: ClusteringDemo,
    label: "Inferred Counterparties",
    desc: "Aggregates nearby addresses from vin/vout structure by direction, transaction count, and estimated BTC volume.",
  },
  {
    Demo: RiskScoreDemo,
    label: "Model Risk Score",
    desc: "Evaluated on 73,495 labelled rows: ROC AUC 0.995, accuracy 0.992, illicit recall 0.906, F1 0.944, with SHAP-ranked feature drivers.",
  },
  {
    Demo: WatchlistDemo,
    label: "Local Watchlist",
    desc: "Checks the configured backend watchlist and keeps it separate from model risk or external legal conclusions.",
  },
  {
    Demo: DatasetDemo,
    label: "Dataset Network Scan",
    desc: "When local Elliptic-style files exist, scores dataset wallets and samples stored address-to-address edges.",
  },
  {
    Demo: AuditDemo,
    label: "Analysis Summary",
    desc: "Returns model output, SHAP-ranked feature drivers, source transaction context, inferred links, warnings, and optional AI notes.",
  },
];

const STEPS = [
  { n: "01", title: "Input",  desc: "Paste a Bitcoin wallet address. The backend validates it before analysis." },
  { n: "02", title: "Observe",  desc: "Recent wallet transactions are fetched from mempool.space and parsed into inputs and outputs." },
  { n: "03", title: "Infer", desc: "Counterparties and path links are inferred from shared transaction structure and estimated amounts." },
  { n: "04", title: "Output", desc: "Model score, feature signals, source transactions, and an analyst summary are returned." },
];

/* ─── Step 1: Wallet Input Visual ──────────────────────────────────────────── */
function Step1Visual() {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "14px", padding: "16px 20px",
    }}>
      {/* URL / chain bar */}
      <div style={{
        width: "100%", maxWidth: "300px",
        display: "flex", alignItems: "center", gap: "7px",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "6px", padding: "6px 10px",
      }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", fontFamily: "monospace", letterSpacing: "0.03em" }}>
          bitcoin mainnet
        </span>
      </div>

      {/* Main input field */}
      <div style={{
        width: "100%", maxWidth: "300px",
        background: "rgba(139,92,246,0.05)",
        border: "1px solid rgba(139,92,246,0.3)",
        borderRadius: "8px", padding: "10px 14px",
        boxShadow: "0 0 16px rgba(139,92,246,0.08)",
      }}>
        <div style={{ fontSize: "9px", color: "rgba(139,92,246,0.55)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "6px" }}>
          Wallet Address
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ fontSize: "11px", color: "#c4b5fd", fontFamily: "monospace", letterSpacing: "0.02em" }}>
            bc1q9x8f...k2m7
          </span>
          <span style={{
            display: "inline-block", width: "1px", height: "13px",
            background: "#a78bfa",
            animation: "decryptoBlink 1.1s step-end infinite",
          }} />
        </div>
      </div>

      {/* Validation + button row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", maxWidth: "300px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "5px",
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)",
          borderRadius: "20px", padding: "3px 9px",
        }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ fontSize: "10px", color: "#4ade80", fontFamily: "monospace" }}>valid BTC</span>
        </div>
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px",
          background: "linear-gradient(135deg, rgba(139,92,246,0.55), rgba(99,102,241,0.45))",
          border: "1px solid rgba(139,92,246,0.4)", borderRadius: "6px",
          padding: "5px 12px", cursor: "pointer",
        }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "#f1f0f4" }}>Analyse</span>
          <span style={{ fontSize: "10px", color: "#c4b5fd" }}>→</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 2: Transaction Trace Visual ─────────────────────────────────────── */
function Step2TraceVisual() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  const hops = [
    { addr: "bc1q9x...k2m7", label: "Input side", dot: "#a78bfa" },
    { addr: "1Boat...tpyT", label: "Target wallet", dot: "#818cf8" },
    { addr: "3J98...WNLy", label: "Inferred party", dot: "#f97316" },
    { addr: "bc1p4k...v8n2", label: "Output side", dot: "#818cf8" },
  ];
  const amounts = ["0.82 BTC", "0.61 BTC", "0.44 BTC"];

  return (
    <div ref={ref} style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "12px 20px",
    }}>
      <div style={{
        fontSize: "9px", color: "rgba(139,92,246,0.5)", letterSpacing: "0.14em",
        textTransform: "uppercase", marginBottom: "14px",
      }}>Observed transaction structure</div>

      {hops.map((hop, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: inView ? 1 : 0, x: inView ? 0 : -10 }}
          transition={{ duration: 0.38, delay: i * 0.13, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "270px" }}
        >
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", width: "100%",
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "6px", padding: "7px 10px",
          }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: hop.dot, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>{hop.addr}</div>
              <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.22)", marginTop: "1px" }}>{hop.label}</div>
            </div>
          </div>
          {i < hops.length - 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0" }}>
              <div style={{ width: "1px", height: "8px", background: "rgba(139,92,246,0.25)" }} />
              <span style={{ fontSize: "9px", color: "rgba(139,92,246,0.45)", fontFamily: "monospace", lineHeight: 1 }}>{amounts[i]}</span>
              <div style={{ width: "1px", height: "6px", background: "rgba(139,92,246,0.25)" }} />
              <span style={{ fontSize: "9px", color: "rgba(139,92,246,0.3)" }}>↓</span>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Step 3: Graph Exploration Visual (inferred links) ─────────────────────── */
function Step2Visual() {
  // Static node layout: [cx, cy, isSuspect, radius]
  const nodes = [
    [100, 110, false, 4.5],
    [60,  70,  false, 3.5],
    [160, 60,  true,  5],
    [220, 90,  true,  5.5],
    [260, 50,  true,  4],
    [190, 150, false, 3.5],
    [120, 170, false, 4],
    [50,  150, false, 3],
    [290, 130, true,  4.5],
    [240, 170, false, 3.5],
  ];
  const edges = [
    [0,1,false],[0,2,false],[2,3,true],[3,4,true],[3,8,true],
    [0,6,false],[1,7,false],[3,9,false],[0,5,false],[2,5,false],
  ];

  return (
    <svg width="100%" height="100%" viewBox="0 0 340 220" style={{ overflow: "visible" }}>
      {/* Dim overlay for non-suspect nodes */}
      <defs>
        <radialGradient id="suspectGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
        <filter id="gf" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Edges */}
      {edges.map(([a, b, isSuspect], i) => {
        const [x1,y1] = nodes[a];
        const [x2,y2] = nodes[b];
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isSuspect ? "#ef4444" : "rgba(255,255,255,0.1)"}
            strokeWidth={isSuspect ? 1.5 : 1}
            strokeDasharray={isSuspect ? "5,3" : undefined}
            style={isSuspect ? { animation: "dashMove 0.7s linear infinite" } : undefined}
            opacity={isSuspect ? 0.85 : 0.4}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map(([cx, cy, isSuspect, r], i) => (
        <g key={i}>
          {isSuspect && (
            <circle cx={cx} cy={cy} r={r + 6} fill="url(#suspectGlow)" filter="url(#gf)" />
          )}
          <circle cx={cx} cy={cy} r={r}
            fill={isSuspect ? "#ef4444" : "#2a1f3d"}
            stroke={isSuspect ? "#f87171" : "rgba(139,92,246,0.3)"}
            strokeWidth={isSuspect ? 1.5 : 1}
            opacity={isSuspect ? 1 : 0.5}
            style={isSuspect ? { animation: "pulseSuspect 1.8s ease-in-out infinite", animationDelay: `${i*0.2}s` } : undefined}
          />
        </g>
      ))}

      {/* "Inferred path" label */}
      <rect x="148" y="4" width="104" height="16" rx="4"
        fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.3)" strokeWidth="1" />
      <text x="200" y="15" textAnchor="middle"
        style={{ fontSize: "8px", fill: "#f87171", fontFamily: "monospace", letterSpacing: "0.08em" }}>
        INFERRED LINK
      </text>
    </svg>
  );
}

/* ─── Step 4: Risk / Report Visual ─────────────────────────────────────────── */
function Step3Visual() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  const score = 73;
  const r = 32, circ = 2 * Math.PI * r;
  const filled = inView ? (score / 100) * circ : 0;

  const findings = [
    { dot: "#ef4444", label: "Model Risk", value: "73/100", valueColor: "#f87171" },
    { dot: "#f97316", label: "Inferred Path", value: "3 hops", valueColor: "#fb923c" },
    { dot: "#a78bfa", label: "Est. Exposure", value: "18.4%", valueColor: "#c4b5fd" },
  ];

  return (
    <div ref={ref} style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "stretch",
      gap: "10px", padding: "14px 16px",
    }}>
      {/* Left: risk meter */}
      <div style={{
        flex: "0 0 auto", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
        borderRadius: "8px", padding: "14px 18px",
      }}>
        <div style={{ position: "relative", width: "84px", height: "84px" }}>
          <svg width="84" height="84" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
            <circle cx="42" cy="42" r={r} fill="none"
              stroke="#ef4444" strokeWidth="5"
              strokeDasharray={`${filled} ${circ - filled}`}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 4px rgba(239,68,68,0.6))", transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1) 0.2s" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: "22px", fontWeight: 800, color: "#f87171", lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: "8px", color: "rgba(239,68,68,0.6)", letterSpacing: "0.1em", marginTop: "2px" }}>RISK</span>
          </div>
        </div>
      </div>

      {/* Right: findings list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", justifyContent: "center" }}>
        {findings.map(({ dot, label, value, valueColor }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: inView ? 1 : 0, x: inView ? 0 : 8 }}
            transition={{ duration: 0.36, delay: 0.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "6px", padding: "6px 10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: dot }} />
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{label}</span>
            </div>
            <span style={{ fontSize: "10px", fontWeight: 600, color: valueColor, fontFamily: "monospace" }}>{value}</span>
          </motion.div>
        ))}

        {/* Export button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.3, delay: 0.7 }}
          style={{
            display: "flex", alignItems: "center", gap: "5px", justifyContent: "center",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px", padding: "6px 0", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>Export Report</span>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>↓</span>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Context Graph ─────────────────────────────────────────────────────────── */
// Evolves through 3 states to visualise the context narrative
const CX_NODES = [
  { id: 0, x: 55,  y: 130, type: "source"     },
  { id: 1, x: 140, y: 75                       },
  { id: 2, x: 140, y: 185                      },
  { id: 3, x: 225, y: 45                       },
  { id: 4, x: 225, y: 130, type: "path"        },
  { id: 5, x: 225, y: 210                      },
  { id: 6, x: 320, y: 80,  type: "suspect"     },
  { id: 7, x: 320, y: 175                      },
  { id: 8, x: 405, y: 50,  type: "watchlist"  },
  { id: 9, x: 405, y: 130, type: "suspect"     },
];
const CX_EDGES = [
  { a: 0, b: 1, path: false },
  { a: 0, b: 2, path: false },
  { a: 1, b: 3, path: false },
  { a: 1, b: 4, path: true  },
  { a: 2, b: 5, path: false },
  { a: 4, b: 6, path: true  },
  { a: 4, b: 7, path: false },
  { a: 6, b: 8, path: true  },
  { a: 6, b: 9, path: true  },
  { a: 3, b: 7, path: false },
];

function ContextGraph({ state }) {
  // state 0: neutral graph  |  state 1: trace path lit  |  state 2: risk nodes highlighted
  const showTrace = state >= 1;
  const showRisk  = state >= 2;

  const nodeColor = (n) => {
    if (n.type === "source")     return "rgba(167,139,250,0.75)";
    if (n.type === "watchlist") return showRisk ? "#ef4444" : "rgba(255,255,255,0.08)";
    if (n.type === "suspect")    return showRisk ? "#f97316" : "rgba(255,255,255,0.08)";
    if (n.type === "path")       return showTrace ? "#818cf8"  : "rgba(255,255,255,0.1)";
    return "rgba(255,255,255,0.08)";
  };
  const nodeStroke = (n) => {
    if (n.type === "source")     return "rgba(167,139,250,0.35)";
    if (n.type === "watchlist") return showRisk ? "rgba(239,68,68,0.5)"   : "rgba(255,255,255,0.07)";
    if (n.type === "suspect")    return showRisk ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.07)";
    if (n.type === "path")       return showTrace ? "rgba(129,140,248,0.35)" : "rgba(255,255,255,0.07)";
    return "rgba(255,255,255,0.07)";
  };
  const edgeStroke = (e) => {
    if (!e.path || !showTrace) return "rgba(255,255,255,0.05)";
    return showRisk ? "rgba(249,115,22,0.55)" : "rgba(124,58,237,0.6)";
  };

  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" style={{ overflow: "visible" }}>
      <defs>
        <filter id="cxGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* Glow halos on risk nodes */}
      {showRisk && CX_NODES.filter(n => n.type === "watchlist" || n.type === "suspect").map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={20}
          fill={n.type === "watchlist" ? "rgba(239,68,68,0.22)" : "rgba(249,115,22,0.18)"}
          filter="url(#cxGlow)"
          style={{ transition: "opacity 0.7s" }}
        />
      ))}

      {/* Edges */}
      {CX_EDGES.map((e, i) => {
        const na = CX_NODES[e.a], nb = CX_NODES[e.b];
        return (
          <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={edgeStroke(e)}
            strokeWidth={e.path && showTrace ? 1.5 : 0.8}
            strokeDasharray={e.path && showTrace ? "4,3" : undefined}
            style={{ transition: "stroke 0.6s, stroke-width 0.5s" }}
          />
        );
      })}

      {/* Nodes */}
      {CX_NODES.map((n) => (
        <circle key={n.id} cx={n.x} cy={n.y}
          r={n.id === 0 ? 5.5 : n.type === "watchlist" ? 5 : 4}
          fill={nodeColor(n)} stroke={nodeStroke(n)} strokeWidth={1.2}
          style={{ transition: "fill 0.55s, stroke 0.55s" }}
        />
      ))}

      {/* Risk label */}
      {showRisk && (
        <g style={{ animation: "fadeSl 0.35s ease both" }}>
          <rect x={CX_NODES[8].x - 24} y={CX_NODES[8].y - 21} width={48} height={13} rx={3}
            fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.28)" strokeWidth={0.8} />
          <text x={CX_NODES[8].x} y={CX_NODES[8].y - 11} textAnchor="middle"
            style={{ fontSize: "6.5px", fill: "#f87171", fontFamily: "monospace", letterSpacing: "0.08em" }}>
            RISK
          </text>
        </g>
      )}

      {/* Risk score badge */}
      {showRisk && (
        <g style={{ animation: "fadeSl 0.4s ease 0.15s both" }}>
          <rect x={8} y={8} width={68} height={26} rx={4}
            fill="rgba(239,68,68,0.07)" stroke="rgba(239,68,68,0.18)" strokeWidth={0.8} />
          <text x={42} y={18} textAnchor="middle"
            style={{ fontSize: "6.5px", fill: "rgba(239,68,68,0.55)", fontFamily: "monospace", letterSpacing: "0.1em" }}>
            RISK SCORE
          </text>
          <text x={42} y={29} textAnchor="middle"
            style={{ fontSize: "10px", fontWeight: "700", fill: "#f87171", fontFamily: "monospace" }}>
            73
          </text>
        </g>
      )}
    </svg>
  );
}

/* ─── Context Section ────────────────────────────────────────────────────────── */
const CONTEXT_PARAGRAPHS = [
  {
    num: "01",
    heading: "Public data still needs structure",
    body: "Bitcoin transaction data is public, but a wallet view is easier to reason about after transactions are parsed into inputs, outputs, fees, timing gaps, and observed counterparties.",
    graphState: 0,
  },
  {
    num: "02",
    heading: "Links are inferred from transactions",
    body: "The app does not know wallet ownership. It infers relationships by checking where the target address appears in transaction inputs and outputs, then aggregating nearby addresses as observed counterparties.",
    graphState: 1,
  },
  {
    num: "03",
    heading: "The model is a screening layer",
    body: "The classifier scores the available feature row and returns a risk label for review. A high score is an investigation signal, not a legal conclusion or proof of wrongdoing.",
    graphState: 2,
  },
];

function ContextSection({ scrollContainer }) {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    container: scrollContainer,
    offset: ["start start", "end end"],
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const derivedIdx = useTransform(
    scrollYProgress,
    [0, 0.32, 0.34, 0.64, 0.66, 1.0],
    [0, 0,    1,    1,    2,    2]
  );

  useEffect(() => {
    return derivedIdx.on("change", v => setActiveIdx(Math.round(v)));
  }, [derivedIdx]);

  const current = CONTEXT_PARAGRAPHS[activeIdx];

  return (
    <section
      ref={sectionRef}
      style={{ height: "280vh", background: "#08090e", borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        <div style={{
          width: "100%", maxWidth: "1080px", margin: "0 auto", padding: "0 64px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px", alignItems: "center",
        }}>

          {/* Left: text narrative */}
          <div>
            <div style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase", color: "rgba(139,92,246,0.5)", marginBottom: "32px",
            }}>
              Context
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeIdx}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                <div style={{
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.18em",
                  color: "rgba(139,92,246,0.38)", textTransform: "uppercase", marginBottom: "14px",
                }}>
                  {current.num}
                </div>
                <h3 style={{
                  fontSize: "clamp(1.2rem, 2.2vw, 1.6rem)", fontWeight: 600,
                  color: "#e5e7eb", letterSpacing: "-0.02em", lineHeight: 1.35,
                  margin: "0 0 18px 0",
                }}>
                  {current.heading}
                </h3>
                <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.85, margin: 0 }}>
                  {current.body}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Progress indicators */}
            <div style={{ display: "flex", gap: "8px", marginTop: "36px" }}>
              {CONTEXT_PARAGRAPHS.map((_, i) => (
                <div key={i} style={{
                  height: "2px",
                  width: i === activeIdx ? "28px" : "8px",
                  borderRadius: "2px",
                  background: i === activeIdx ? "rgba(139,92,246,0.65)" : "rgba(139,92,246,0.15)",
                  transition: "width 0.35s ease, background 0.35s ease",
                }} />
              ))}
            </div>
          </div>

          {/* Right: evolving graph */}
          <div style={{
            position: "relative", height: "340px", borderRadius: "10px",
            overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)",
            background: "#0b0c14", display: "flex", alignItems: "center",
            justifyContent: "center", padding: "20px",
          }}>
            <ContextGraph state={current.graphState} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function EntryScreen({ onAnalyseWallet }) {
  const scrollRef = useRef(null);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#08090e" }}>

      {/* ── Scrollable content layer ── */}
      <div
        ref={scrollRef}
        className="relative z-[1] w-full h-full overflow-y-auto overflow-x-hidden"
        style={{ background: "#08090e" }}
      >
      {/* ─────────────────────────────────────────────
          HERO - full viewport
      ───────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden" style={{ height: "100vh" }}>

        {/* LetterGlitch - scoped to hero only */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <LetterGlitch
            glitchColors={['#140a2e', '#3b1f6e', '#5b2d9e']}
            glitchSpeed={60}
            centerVignette={true}
            outerVignette={true}
            smooth={true}
          />
          {/* dim overlay so glitch reads as texture, not foreground */}
          <div className="absolute inset-0" style={{ background: 'rgba(8,9,14,0.72)' }} />
        </div>

        {/* Top/bottom fade only */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(8,9,14,0.6) 0%, transparent 20%, transparent 70%, rgba(8,9,14,1) 100%)",
          }}
        />

        {/* Hero content - minimal, let the terminal breathe */}
        <div className="relative z-[2] flex flex-col h-full items-center justify-center px-6 text-center">

          {/* Headline */}
          <h1
            className="decrypto-gradient font-black leading-none mb-6"
            style={{
              fontSize: "clamp(3.5rem, 10vw, 8rem)",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 900,
              letterSpacing: "-0.03em",
            }}
          >
            DECRYPTO
          </h1>

          <p
            className="text-base leading-relaxed mb-10"
            style={{ color: "#64748b", maxWidth: "480px", fontWeight: 400 }}
          >
            Analyse Bitcoin wallets with model scoring, live transaction features, and inferred counterparty relationships.
          </p>
          {/* CTAs */}
          <div className="flex items-center gap-4">
            <button
              onClick={onAnalyseWallet}
              className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors duration-150"
              style={{
                background: "rgba(139,92,246,0.15)",
                border: "1px solid rgba(139,92,246,0.35)",
                color: "#c4b5fd",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.25)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(139,92,246,0.15)"; }}
            >
              <ShieldAlert size={14} />
              Analyse Wallet
            </button>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-6 left-0 right-0 z-[2] flex flex-col items-center gap-1 pointer-events-none">
          <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: "#1e293b" }}>
            Scroll
          </span>
          <ChevronDown size={13} style={{ color: "#1e293b" }} className="animate-bounce" />
        </div>
      </section>

{/* Context - scroll-driven narrative */}
      <ContextSection scrollContainer={scrollRef} />

      {/* ─────────────────────────────────────────────
          STATS - horizontal scroll carousel
      ───────────────────────────────────────────── */}
      <HorizontalScrollCarousel items={PROBLEMS} scrollContainer={scrollRef} />

      {/* ─────────────────────────────────────────────
          FEATURES GRID
      ───────────────────────────────────────────── */}
      <section
        className="w-full py-24 px-8"
        style={{ background: "#08090e", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="mb-14">
            <h2 className="text-2xl font-semibold" style={{ color: "#f1f0f4", letterSpacing: "-0.02em", marginBottom: "10px" }}>
              Capabilities
            </h2>
            <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.7, maxWidth: "520px" }}>
              Live wallet features, model scores, inferred links, and dataset summaries in one workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {FEATURES.map(({ Demo, label, desc }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  overflow: "hidden",
                  background: "#0b0c14",
                }}
              >
                <div style={{ height: "180px", background: "#0d0e17", position: "relative", overflow: "hidden" }}>
                  <Demo />
                </div>
                <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[13px] font-medium" style={{ color: "#e5e7eb", marginBottom: "6px" }}>{label}</div>
                  <div className="text-xs leading-relaxed" style={{ color: "#4b5563", minHeight: "48px" }}>{desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────
          HOW IT WORKS
      ───────────────────────────────────────────── */}
      <section
        className="w-full py-24 px-8"
        style={{ background: "#08090e", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: "64px" }}
          >
            <h2 className="text-2xl font-semibold" style={{ color: "#f1f0f4", letterSpacing: "-0.02em", marginBottom: "10px" }}>
              How it works
            </h2>
            <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.7, maxWidth: "420px" }}>
              What the backend actually does after you submit a Bitcoin address.
            </p>
          </motion.div>

          {/* Step cards - 2x2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

            {STEPS.map(({ n, title, desc }, i) => (
              <motion.div
                key={n}
                initial={{ opacity: 0, y: 44 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.6, delay: i * 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: "relative",
                  borderRadius: "10px",
                  background: "#0b0c13",
                  border: "1px solid rgba(255,255,255,0.07)",
                  overflow: "hidden",
                }}
              >
                {/* Top accent line */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: "2px",
                  background: [
                    "linear-gradient(to right, rgba(139,92,246,0.9), rgba(99,102,241,0.4), transparent)",
                    "linear-gradient(to right, transparent, rgba(139,92,246,0.9), transparent)",
                    "linear-gradient(to right, rgba(99,102,241,0.4), rgba(139,92,246,0.8), transparent)",
                    "linear-gradient(to right, transparent, rgba(99,102,241,0.4), rgba(139,92,246,0.9))",
                  ][i],
                }} />

                {/* Product visual area */}
                <div style={{ height: "220px", position: "relative", overflow: "hidden", background: "#0d0e17" }}>
                  {i === 0 && <Step1Visual />}
                  {i === 1 && <Step2TraceVisual />}
                  {i === 2 && <Step2Visual />}
                  {i === 3 && <Step3Visual />}
                </div>

                {/* Text area */}
                <div style={{ padding: "22px 24px 28px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{
                    fontSize: "9px", fontWeight: 700, letterSpacing: "0.16em",
                    color: "rgba(139,92,246,0.6)", textTransform: "uppercase", marginBottom: "8px",
                  }}>{n}</div>
                  <div style={{
                    fontSize: "15px", fontWeight: 600, color: "#f1f0f4",
                    marginBottom: "8px", letterSpacing: "-0.01em",
                  }}>{title}</div>
                  <div style={{ fontSize: "13px", lineHeight: 1.75, color: "#6b7280" }}>{desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────
          FINAL CTA
      ───────────────────────────────────────────── */}
      <section
        className="w-full py-28 px-8"
        style={{ background: "#08090e", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-xl mx-auto">
          <h2
            className="text-3xl font-semibold mb-4"
            style={{ color: "#f1f0f4", letterSpacing: "-0.02em" }}
          >
            Start with an address.
          </h2>
          <p
            className="text-sm leading-relaxed mb-8"
            style={{ color: "#4b5563" }}
          >
            Paste a Bitcoin wallet address. Get a model risk view with feature signals, source transactions, and inferred links.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={onAnalyseWallet}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors duration-150"
              style={{
                background: "rgba(139,92,246,0.15)",
                border: "1px solid rgba(139,92,246,0.3)",
                color: "#c4b5fd",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.22)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(139,92,246,0.15)"; }}
            >
              <ShieldAlert size={14} />
              Analyse Wallet
            </button>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────
          FOOTER
      ───────────────────────────────────────────── */}
      <footer
        className="w-full py-6 px-8 flex items-center justify-end"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-xs" style={{ color: "#374151" }}>Model screening and inferred links only. Not financial or legal advice.</span>
      </footer>
      </div>
    </div>
  );
}
