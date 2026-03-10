import { useState, useRef, useEffect } from "react";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0A0F14; color: #E8EDF2; font-family: 'Syne', sans-serif; font-size: 16px; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #111820; }
  ::-webkit-scrollbar-thumb { background: #1E8A5E; border-radius: 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .fade-up { animation: fadeUp 0.45s ease forwards; }
  .copy-btn:hover { background: #1E8A5E !important; color: #fff !important; border-color: #1E8A5E !important; }
  .imp-card:hover { border-color: #2A3A4A !important; }
  .logo-btn { cursor: pointer; display: flex; align-items: center; gap: 10px; background: none; border: none; padding: 0; }
  .logo-btn:hover span { color: #1E8A5E !important; }
`;

async function callAI(messages, system, maxTokens = 1500) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL, max_tokens: maxTokens,
      messages: system ? [{ role: "system", content: system }, ...messages] : messages,
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "API error");
  return d.choices?.[0]?.message?.content || "";
}

function extractJSON(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in: " + raw.slice(0, 100));
  return JSON.parse(match[0]);
}

async function fetchSite(url) {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 100) return text;
    } catch { continue; }
  }
  throw new Error("blocked");
}

function extractMeta(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return {
    title: doc.querySelector("title")?.textContent || "",
    desc: doc.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    h1s: [...doc.querySelectorAll("h1")].map(h => h.textContent.trim()).join(" | "),
    h2s: [...doc.querySelectorAll("h2")].map(h => h.textContent.trim()).slice(0, 8).join(" | "),
    lang: doc.documentElement.lang || "unknown",
    canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
    ogTitle: doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
    robots: doc.querySelector('meta[name="robots"]')?.getAttribute("content") || "",
    bodyText: doc.body?.innerText?.slice(0, 1500) || "",
    linkCount: doc.querySelectorAll("a").length,
    imgCount: doc.querySelectorAll("img").length,
    imgsNoAlt: [...doc.querySelectorAll("img")].filter(i => !i.alt).length,
  };
}

function getIssuePriority(issue) {
  const t = issue.toUpperCase();
  if (t.startsWith("CRITICAL") || t.includes("CRITICAL:")) return "critical";
  if (t.startsWith("IMPORTANT") || t.includes("IMPORTANT:")) return "important";
  return "minor";
}
function issueColor(issue) {
  const p = getIssuePriority(issue);
  return p === "critical" ? "#C0392B" : p === "important" ? "#D4A017" : "#1E8A5E";
}
function cleanIssueText(issue) {
  return issue.replace(/^(CRITICAL|IMPORTANT|MINOR):\s*/i, "");
}

// ── UI Components ─────────────────────────────────────────────────────────────

function ScoreRing({ score, prev }) {
  const r = 54, circ = 2 * Math.PI * r;
  const color = score >= 70 ? "#1E8A5E" : score >= 40 ? "#D4A017" : "#C0392B";
  const label = score >= 70 ? "Good" : score >= 40 ? "Needs Work" : "Critical";
  return (
    <div style={{ position: "relative", width: 144, height: 144, flexShrink: 0 }}>
      <svg width="144" height="144" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="72" cy="72" r={r} fill="none" stroke="#1A2332" strokeWidth="10" />
        <circle cx="72" cy="72" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color, fontFamily: "'DM Mono'", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 11, color: "#6B7A8D", fontFamily: "'DM Mono'", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        {prev != null && (
          <span style={{ fontSize: 12, fontFamily: "'DM Mono'", fontWeight: 700, color: score > prev ? "#1E8A5E" : score < prev ? "#C0392B" : "#6B7A8D" }}>
            {score > prev ? `▲ +${score - prev}` : score < prev ? `▼ ${score - prev}` : "— no change"}
          </span>
        )}
      </div>
    </div>
  );
}

function Tag({ children, color = "#2A3A4A" }) {
  return (
    <span style={{ fontSize: 11, background: `${color}28`, color, border: `1px solid ${color}55`, borderRadius: 5, padding: "3px 10px", fontFamily: "'DM Mono'", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function IssueCard({ issue, isNew, isFixed }) {
  const c = issueColor(issue);
  const borderColor = isFixed ? "#1E8A5E" : isNew ? "#7C3AED" : c;
  const bg = isFixed ? "rgba(30,138,94,.09)" : isNew ? "rgba(124,58,237,.09)" : "rgba(17,24,32,.95)";
  return (
    <div style={{ borderLeft: `4px solid ${borderColor}`, background: bg, border: `1px solid ${borderColor}30`, borderLeftWidth: 4, borderLeftColor: borderColor, borderRadius: "0 10px 10px 0", padding: "13px 16px", marginBottom: 8, fontSize: 15, color: "#C0CCD8", lineHeight: 1.65, position: "relative" }}>
      {isFixed && <span style={{ position: "absolute", right: 12, top: 10, fontSize: 11, color: "#1E8A5E", fontFamily: "'DM Mono'", fontWeight: 700 }}>FIXED ✓</span>}
      {isNew && <span style={{ position: "absolute", right: 12, top: 10, fontSize: 11, color: "#A78BFA", fontFamily: "'DM Mono'", fontWeight: 700 }}>NEW !</span>}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: borderColor, flexShrink: 0, display: "inline-block", marginTop: 1 }} />
        <span style={{ color: borderColor, fontFamily: "'DM Mono'", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>{getIssuePriority(issue)}</span>
        <span>{cleanIssueText(issue)}</span>
      </span>
    </div>
  );
}

function KeywordCard({ kw }) {
  const intentColor = { informational: "#3B82F6", transactional: "#1E8A5E", navigational: "#D4A017", commercial: "#A855F7" };
  const diffColor = kw.difficulty === "low" ? "#1E8A5E" : kw.difficulty === "medium" ? "#D4A017" : "#C0392B";
  return (
    <div style={{ background: "#111820", border: "1px solid #1E2A38", borderRadius: 12, padding: "14px 18px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#E8EDF2", flex: 1, minWidth: 140 }}>{kw.keyword}</span>
        <Tag color={intentColor[kw.intent] || "#3B82F6"}>{kw.intent}</Tag>
        <Tag color={diffColor}>{kw.difficulty} difficulty</Tag>
        <Tag color="#4A5A6A">{kw.priority} priority</Tag>
      </div>
      {kw.rationale && (
        <div style={{ fontSize: 13, color: "#4A5A6A", marginTop: 8, lineHeight: 1.6 }}>{kw.rationale}</div>
      )}
    </div>
  );
}

function ImprovementCard({ item }) {
  const [open, setOpen] = useState(false);
  const priColor = item.priority === "high" ? "#C0392B" : item.priority === "medium" ? "#D4A017" : "#1E8A5E";
  return (
    <div className="imp-card" style={{ background: "#111820", border: "1px solid #1E2A38", borderRadius: 12, marginBottom: 10, overflow: "hidden", transition: "border-color .2s" }}>
      <div onClick={() => setOpen(!open)} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: `${priColor}18`, border: `1px solid ${priColor}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{item.icon || "🔧"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#E8EDF2", marginBottom: 5 }}>{item.task}</div>
          <div style={{ fontSize: 13, color: "#5A6A7A", lineHeight: 1.5 }}>{item.rationale}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Tag color={priColor}>{item.priority}</Tag>
          <span style={{ color: "#3A4A5A", fontSize: 14, display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▼</span>
        </div>
      </div>
      {open && item.howTo && (
        <div style={{ borderTop: "1px solid #1A2332", padding: "16px 20px", background: "#0D1520" }}>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: "#3A5A48", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>How to do it</div>
          <div style={{ fontSize: 14, color: "#7A8A9A", lineHeight: 1.85 }}>{item.howTo}</div>
        </div>
      )}
    </div>
  );
}

function BlogCard({ post, index }) {
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(post.prompt); setCopied(true); setTimeout(() => setCopied(false), 2500); }
  return (
    <div style={{ background: "#111820", border: "1px solid #1E2A38", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "#162030", border: "1px solid #2A3A4A", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono'", fontSize: 14, color: "#4A8A6A", flexShrink: 0, fontWeight: 700 }}>#{index + 1}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#E8EDF2", marginBottom: 6 }}>{post.title}</div>
            <div style={{ fontSize: 13, color: "#5A6A7A", marginBottom: 12, lineHeight: 1.65 }}>{post.rationale}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tag color="#3B82F6">{post.keyword}</Tag>
              <Tag color="#7C3AED">~{post.wordCount} words</Tag>
              <Tag color="#1E8A5E">{post.type}</Tag>
            </div>
          </div>
          <button className="copy-btn" onClick={copy}
            style={{ fontFamily: "'DM Mono'", fontSize: 12, background: "transparent", border: "1px solid #2A4A38", color: "#1E8A5E", borderRadius: 7, padding: "8px 14px", cursor: "pointer", transition: "all .2s", flexShrink: 0 }}>
            {copied ? "✓ Copied!" : "Copy Prompt"}
          </button>
        </div>
        <div style={{ background: "#0A1018", border: "1px solid #1A2A20", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: "#2A5A3A", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>✦ Prompt — paste into ChatGPT or Claude</div>
          <div style={{ fontSize: 13, color: "#6A8A7A", lineHeight: 1.9, fontFamily: "'DM Mono'" }}>{post.prompt}</div>
        </div>
      </div>
    </div>
  );
}

function Loader({ msg }) {
  return (
    <div style={{ textAlign: "center", padding: "100px 0" }}>
      <div style={{ width: 46, height: 46, border: "2px solid #1A2332", borderTop: "2px solid #1E8A5E", borderRadius: "50%", animation: "spin .7s linear infinite", margin: "0 auto 24px" }} />
      <div style={{ color: "#3A5A78", fontFamily: "'DM Mono'", fontSize: 14, animation: "pulse 2s infinite" }}>{msg}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: "#3A5A48", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ height: 1, width: 20, background: "#1E8A5E" }} />
      {children}
      <div style={{ height: 1, flex: 1, background: "#1A2332" }} />
    </div>
  );
}

function Btn({ children, onClick, primary, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: "'Syne'", fontWeight: 700,
      fontSize: small ? 13 : 15,
      padding: small ? "9px 18px" : "14px 28px",
      background: primary ? "#1E8A5E" : "#111820",
      color: disabled ? "#2A3A4A" : primary ? "#fff" : "#8A9AAA",
      border: `1px solid ${disabled ? "#1A2332" : primary ? "#1E8A5E" : "#2A3A4A"}`,
      borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
      transition: "all .2s", letterSpacing: "-0.2px",
    }}>{children}</button>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState("input");
  const [url, setUrl] = useState("");
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualDesc, setManualDesc] = useState("");
  const [siteData, setSiteData] = useState(null);
  const [report, setReport] = useState(null);
  const [prevReport, setPrevReport] = useState(null);
  const [keywords, setKeywords] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planTab, setPlanTab] = useState("improvements");
  const bottom = useRef(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [step, planTab]);
  useEffect(() => {
    const s = document.createElement("style"); s.textContent = GLOBAL_CSS; document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  function reset() {
    setUrl(""); setStep("input"); setReport(null); setPrevReport(null);
    setPlan(null); setKeywords(null); setSiteData(null); setManual(false); setManualDesc(""); setError(null);
  }

  async function scan() {
    setError(null); setManual(false); setStep("loading"); setLoadMsg("Fetching your website…");
    let meta = null;
    try {
      const html = await fetchSite(url);
      meta = extractMeta(html); setSiteData(meta);
      setLoadMsg("Running SEO analysis…");
    } catch {
      setError("blocked"); setStep("input"); return;
    }
    await runReport(meta);
  }

  async function runManual() {
    setError(null); setStep("loading"); setLoadMsg("Analysing your description…");
    await runReport(null, true);
  }

  async function runReport(meta, isManual = false) {
    try {
      const context = isManual
        ? `User described their site: "${manualDesc}". URL: ${url}`
        : `Site data: ${JSON.stringify(meta)}. URL: ${url}`;
      const raw = await callAI([{
        role: "user", content: `Analyse this website for SEO issues.
${context}

Return ONLY raw JSON with no markdown, no backticks:
{
  "score": 65,
  "issues": [
    "CRITICAL: Page title is missing or too generic",
    "IMPORTANT: Meta description is too short",
    "MINOR: Images are missing alt text"
  ],
  "summary": "Two sentence plain English overview of SEO health.",
  "lang": "English",
  "siteType": "business"
}
Start each issue with CRITICAL:, IMPORTANT:, or MINOR: — no emojis. Be specific.`
      }], "You are an expert SEO auditor. Return only raw JSON. No markdown, no backticks.");
      const parsed = extractJSON(raw);
      setReport(parsed); setPrevReport(null); setStep("report");
    } catch (e) {
      console.error("REPORT ERROR:", e.message);
      setError("ai"); setStep("input");
    }
  }

  async function recheck() {
    setPrevReport(report); setStep("loading"); setLoadMsg("Re-scanning your website…");
    let meta = siteData;
    if (!manual) {
      try { const html = await fetchSite(url); meta = extractMeta(html); setSiteData(meta); } catch { }
    }
    setLoadMsg("Comparing with previous report…");
    try {
      const raw = await callAI([{
        role: "user", content: `Re-audit this website. Be consistent with scoring.
Previous score: ${report.score}
Previous issues: ${JSON.stringify(report.issues)}
Current site data: ${JSON.stringify(meta)}
URL: ${url}
RULE: If nothing changed, keep score within 2 points of ${report.score}.
Return ONLY raw JSON:
{
  "score": ${report.score},
  "issues": ["CRITICAL: ...", "IMPORTANT: ...", "MINOR: ..."],
  "fixed": ["description of resolved issue"],
  "newIssues": ["description of new issue"],
  "summary": "One sentence on what changed.",
  "lang": "${report.lang}",
  "siteType": "${report.siteType}"
}
Start each issue with CRITICAL:, IMPORTANT:, or MINOR:`
      }], "You are a consistent SEO auditor. Return only raw JSON.");
      const parsed = extractJSON(raw);
      setReport(parsed); setStep("delta");
    } catch { setStep(prevReport ? "delta" : "report"); }
  }

  async function generateKeywords() {
    setStep("loading"); setLoadMsg("Analysing keywords…");
    const siteContext = siteData
      ? `Title: "${siteData.title}". Desc: "${siteData.desc}". H1: "${siteData.h1s}". Content: "${siteData.bodyText?.slice(0, 500)}"`
      : `Description: "${manualDesc}"`;
    try {
      const raw = await callAI([{
        role: "user", content: `Generate keyword analysis for this website.
URL: ${url}
Language: ${report.lang}
Site type: ${report.siteType}
Site info: ${siteContext}

Return ONLY raw JSON, no markdown:
{
  "metaTitle": "Suggested optimised title tag (50-60 chars, keyword first)",
  "metaDesc": "Suggested meta description (140-155 chars, includes main keyword and CTA)",
  "keywords": [
    {
      "keyword": "exact keyword phrase",
      "intent": "informational",
      "difficulty": "low",
      "priority": "high",
      "rationale": "Why this keyword matters for this specific site"
    }
  ]
}
Generate 15 keywords. intent: informational/transactional/navigational/commercial. difficulty: low/medium/high. priority: high/medium/low.
Make keywords SPECIFIC to this site's niche and language (${report.lang}).`
      }], "Return only raw JSON. No markdown. No backticks.", 1200);
      const parsed = extractJSON(raw);
      setKeywords(parsed); setStep("keywords");
    } catch (e) {
      console.error("KEYWORDS ERROR:", e.message);
      setError("ai"); setStep(prevReport ? "delta" : "report");
    }
  }

  async function generatePlan() {
    setStep("loading");
    const siteContext = siteData
      ? `Title: "${siteData.title}". Desc: "${siteData.desc}". H1: "${siteData.h1s}". Content: "${siteData.bodyText?.slice(0, 400)}"`
      : `Description: "${manualDesc}"`;
    const issuesSummary = report.issues?.slice(0, 4).join("; ");
    try {
      setLoadMsg("Generating improvement tasks…");
      const rawImp = await callAI([{
        role: "user", content: `Create 6 specific SEO improvement tasks for this site.
URL: ${url}
Type: ${report.siteType}
Language: ${report.lang}
Issues: ${issuesSummary}
Site: ${siteContext}
Return ONLY raw JSON, no markdown:
{"improvements":[{"icon":"🏠","task":"Task name","priority":"high","rationale":"Why it matters","howTo":"Specific step by step instructions referencing their actual content."}]}
6 tasks covering: title tags, meta, headings, images, speed, links. Make howTo specific to their site.`
      }], "Return only raw JSON. No markdown. No backticks.", 1200);
      const impParsed = extractJSON(rawImp);

      setLoadMsg("Creating blog content ideas (1/2)…");
      const rawBlog1 = await callAI([{
        role: "user", content: `Create 4 SEO blog post ideas for this website.
URL: ${url}
Language: ${report.lang}
Site: ${siteContext}
Return ONLY raw JSON, no markdown:
{"posts":[{"title":"Post title","keyword":"target keyword","type":"how-to","wordCount":900,"rationale":"Why this brings traffic","prompt":"Write a 900-word SEO blog post in ${report.lang} titled [TITLE]. Keyword: [KEYWORD]. For website ${url} about [site topic from context]. Audience: [infer]. Include: compelling intro with keyword, 5 H2 subheadings with practical depth, real examples, conclusion with CTA to visit ${url}. Use keyword 3-4 times naturally. Tone: professional. 900 words."}]}
4 posts specific to this niche. Write prompts in ${report.lang}.`
      }], "Return only raw JSON. No markdown. No backticks.", 1400);
      const blog1Parsed = extractJSON(rawBlog1);

      setLoadMsg("Creating blog content ideas (2/2)…");
      const rawBlog2 = await callAI([{
        role: "user", content: `Create 4 MORE different SEO blog post ideas. Different topics from before.
URL: ${url}
Language: ${report.lang}
Site: ${siteContext}
Return ONLY raw JSON, no markdown:
{"posts":[{"title":"Different post title","keyword":"different keyword","type":"listicle","wordCount":800,"rationale":"Why this brings traffic","prompt":"Write an 800-word SEO blog post in ${report.lang} titled [TITLE]. Keyword: [KEYWORD]. For website ${url} about [site topic from context]. Audience: [infer]. Include: compelling intro with keyword, 5 H2 subheadings with practical depth, real examples, conclusion with CTA to visit ${url}. Use keyword 3-4 times naturally. Tone: professional. 800 words."}]}
4 different posts. Write prompts in ${report.lang}.`
      }], "Return only raw JSON. No markdown. No backticks.", 1400);
      const blog2Parsed = extractJSON(rawBlog2);

      setPlan({ improvements: impParsed.improvements || [], posts: [...(blog1Parsed.posts || []), ...(blog2Parsed.posts || [])] });
      setPlanTab("improvements");
      setStep("plan");
    } catch (e) {
      console.error("PLAN ERROR:", e.message);
      setError("ai"); setStep(prevReport ? "delta" : "report");
    }
  }

  const stepKeys = ["input", "report", "delta", "keywords", "plan"];
  const stepLabels = ["Scan", "Report", "Re-check", "Keywords", "Action Plan"];

  return (
    <div style={{ minHeight: "100vh", background: "#0A0F14" }}>
      {/* Nav */}
      <nav style={{ borderBottom: "1px solid #141E28", padding: "18px 32px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20, background: "rgba(10,15,20,.97)", backdropFilter: "blur(12px)" }}>
        <button className="logo-btn" onClick={reset}>
          <div style={{ width: 32, height: 32, background: "#1E8A5E", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>⚡</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px", color: "#E8EDF2", transition: "color .2s" }}>RankFlow</span>
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {stepKeys.map((s, i) => {
            const reached = stepKeys.indexOf(step) >= i;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: reached ? "#1E8A5E" : "#1E2A38", transition: "background .3s" }} />
                <span style={{ fontFamily: "'DM Mono'", fontSize: 11, color: reached ? "#1E8A5E" : "#2A3A4A", textTransform: "uppercase", letterSpacing: 1, display: window.innerWidth < 600 ? "none" : "inline" }}>{stepLabels[i]}</span>
                {i < stepKeys.length - 1 && <div style={{ width: 14, height: 1, background: "#1A2332", margin: "0 2px" }} />}
              </div>
            );
          })}
        </div>
      </nav>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "52px 24px 120px" }}>

        {/* INPUT */}
        {step === "input" && (
          <div className="fade-up">
            <div style={{ marginBottom: 52 }}>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 12, color: "#1E8A5E", letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>Free SEO Analysis</div>
              <h1 style={{ fontSize: "clamp(36px,6vw,58px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-2px", marginBottom: 18, color: "#E8EDF2" }}>
                Your website,<br /><span style={{ color: "#1E8A5E" }}>ranked higher.</span>
              </h1>
              <p style={{ color: "#4A5A6A", fontSize: 17, lineHeight: 1.8, maxWidth: 500 }}>
                Get a full SEO audit, keyword strategy, and a personalised content plan — in seconds, for freee.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && url && scan()}
                placeholder="https://yourwebsite.com"
                style={{ flex: 1, background: "#111820", border: "1px solid #1E2A38", borderRadius: 10, padding: "15px 20px", color: "#E8EDF2", fontSize: 16, outline: "none", fontFamily: "'Syne'" }} />
              <Btn primary onClick={scan} disabled={!url}>Analyse →</Btn>
            </div>
            {error === "blocked" && (
              <div className="fade-up" style={{ background: "#140A0A", border: "1px solid #3A1818", borderRadius: 12, padding: 22, marginTop: 16 }}>
                <div style={{ color: "#E05A5A", fontWeight: 700, fontSize: 16, marginBottom: 10 }}>⚠ Couldn't reach this site</div>
                <ul style={{ color: "#7A5A5A", fontSize: 14, paddingLeft: 20, marginBottom: 16, lineHeight: 2.2 }}>
                  <li>Site blocks crawlers via <code style={{ background: "#0A0505", padding: "1px 6px", borderRadius: 3, color: "#AA7A7A" }}>robots.txt</code></li>
                  <li>JavaScript-rendered site (React, Next.js, Vue)</li>
                  <li>Behind a login or paywall</li>
                  <li>Server timeout or offline</li>
                </ul>
                <Btn small onClick={() => { setManual(true); setError(null); }}>✍ Describe my site manually instead</Btn>
              </div>
            )}
            {error === "ai" && (
              <div style={{ color: "#E05A5A", fontSize: 14, marginTop: 14, fontFamily: "'DM Mono'", background: "#140A0A", border: "1px solid #3A1818", borderRadius: 10, padding: "12px 16px" }}>
                AI call failed — check your VITE_ANTHROPIC_KEY in Vercel Environment Variables and redeploy.
              </div>
            )}
            {manual && (
              <div className="fade-up" style={{ marginTop: 26 }}>
                <SectionLabel>Manual Mode</SectionLabel>
                <textarea value={manualDesc} onChange={e => setManualDesc(e.target.value)} rows={6}
                  placeholder={"Describe your website:\n• What does it do / sell?\n• Who is your target audience?\n• What pages exist?\n• What language & country are you targeting?\n• What makes you different?"}
                  style={{ width: "100%", background: "#111820", border: "1px solid #1E2A38", borderRadius: 10, padding: "15px 18px", color: "#8A9AAA", fontSize: 14, resize: "vertical", outline: "none", fontFamily: "'DM Mono'", lineHeight: 1.8 }} />
                <div style={{ marginTop: 12 }}>
                  <Btn primary onClick={runManual} disabled={!manualDesc}>Analyse from description →</Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOADING */}
        {step === "loading" && <Loader msg={loadMsg} />}

        {/* REPORT */}
        {step === "report" && report && (
          <div className="fade-up">
            <SectionLabel>SEO Audit — {report.lang}</SectionLabel>
            <div style={{ display: "flex", gap: 28, alignItems: "center", marginBottom: 36, flexWrap: "wrap" }}>
              <ScoreRing score={report.score} prev={null} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 16, color: "#8A9AAA", lineHeight: 1.8, marginBottom: 16 }}>{report.summary}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Tag color="#C0392B">{report.issues?.filter(i => getIssuePriority(i) === "critical").length || 0} Critical</Tag>
                  <Tag color="#D4A017">{report.issues?.filter(i => getIssuePriority(i) === "important").length || 0} Important</Tag>
                  <Tag color="#1E8A5E">{report.issues?.filter(i => getIssuePriority(i) === "minor").length || 0} Minor</Tag>
                  <Tag color="#7C3AED">{report.siteType}</Tag>
                </div>
              </div>
            </div>
            <SectionLabel>Issues Found</SectionLabel>
            <div style={{ marginBottom: 36 }}>
              {report.issues?.map((issue, i) => <IssueCard key={i} issue={issue} />)}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Btn primary onClick={recheck}>↻ Re-check after fixing</Btn>
              <Btn onClick={generateKeywords}>→ Keyword Analysis</Btn>
            </div>
          </div>
        )}

        {/* DELTA */}
        {step === "delta" && report && prevReport && (
          <div className="fade-up">
            <SectionLabel>Updated Report</SectionLabel>
            <div style={{ display: "flex", gap: 28, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
              <ScoreRing score={report.score} prev={prevReport.score} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 16, color: "#8A9AAA", lineHeight: 1.8, marginBottom: 16 }}>{report.summary}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Tag color="#1E8A5E">{report.fixed?.length || 0} Fixed</Tag>
                  <Tag color="#A78BFA">{report.newIssues?.length || 0} New Issues</Tag>
                  <Tag color="#D4A017">{report.issues?.length || 0} Remaining</Tag>
                </div>
              </div>
            </div>
            <SectionLabel>Issue Breakdown</SectionLabel>
            <div style={{ marginBottom: 36 }}>
              {report.issues?.map((issue, i) => (
                <IssueCard key={i} issue={issue}
                  isFixed={report.fixed?.some(f => issue.toLowerCase().includes(f.toLowerCase().slice(0, 15)))}
                  isNew={report.newIssues?.some(n => issue.toLowerCase().includes(n.toLowerCase().slice(0, 15)))} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Btn onClick={recheck}>↻ Check again</Btn>
              <Btn primary onClick={generateKeywords}>→ Keyword Analysis</Btn>
            </div>
          </div>
        )}

        {/* KEYWORDS */}
        {step === "keywords" && keywords && (
          <div className="fade-up">
            <SectionLabel>Keyword Strategy — {report?.lang}</SectionLabel>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", marginBottom: 8, color: "#E8EDF2" }}>Keyword Analysis</h2>
            <p style={{ color: "#4A5A6A", fontSize: 15, marginBottom: 28, lineHeight: 1.75 }}>
              Target these keywords across your pages and blog posts to improve your search rankings.
            </p>

            {/* Suggested meta tags */}
            <div style={{ background: "#111820", border: "1px solid #1E2A38", borderRadius: 12, padding: "18px 20px", marginBottom: 28 }}>
              <SectionLabel>AI-Suggested Meta Tags</SectionLabel>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: "#3B82F6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Title Tag</div>
                <div style={{ fontSize: 15, color: "#E8EDF2", background: "#0A1018", padding: "10px 14px", borderRadius: 8, border: "1px solid #1E2A38" }}>{keywords.metaTitle}</div>
              </div>
              <div>
                <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: "#A855F7", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Meta Description</div>
                <div style={{ fontSize: 14, color: "#8A9AAA", background: "#0A1018", padding: "10px 14px", borderRadius: 8, border: "1px solid #1E2A38", lineHeight: 1.7 }}>{keywords.metaDesc}</div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              {[["#3B82F6", "Informational"], ["#1E8A5E", "Transactional"], ["#D4A017", "Navigational"], ["#A855F7", "Commercial"]].map(([c, l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5A6A7A" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 32 }}>
              {keywords.keywords?.map((kw, i) => <KeywordCard key={i} kw={kw} />)}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Btn primary onClick={generatePlan}>→ Build action plan</Btn>
              <Btn onClick={() => setStep(prevReport ? "delta" : "report")}>← Back to report</Btn>
            </div>
          </div>
        )}

        {/* PLAN */}
        {step === "plan" && plan && (
          <div className="fade-up">
            <SectionLabel>Your SEO Action Plan</SectionLabel>
            <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.8px", marginBottom: 8, color: "#E8EDF2" }}>What to do next</h2>
            <p style={{ color: "#4A5A6A", fontSize: 15, marginBottom: 32, lineHeight: 1.75 }}>
              Fix improvements first — they're one-time tasks. Then use the blog calendar to grow organic traffic.
            </p>
            <div style={{ display: "flex", background: "#0A0F14", border: "1px solid #1E2A38", borderRadius: 11, padding: 4, width: "fit-content", marginBottom: 28 }}>
              {[
                { id: "improvements", label: `⚙ Improvements (${plan.improvements?.length || 0})` },
                { id: "blog", label: `✍ Blog Calendar (${plan.posts?.length || 0} posts)` },
              ].map(tab => (
                <button key={tab.id} onClick={() => setPlanTab(tab.id)}
                  style={{ fontFamily: "'Syne'", fontWeight: 700, fontSize: 14, padding: "10px 20px", borderRadius: 8, cursor: "pointer", transition: "all .2s", border: "none", background: planTab === tab.id ? "#1E8A5E" : "transparent", color: planTab === tab.id ? "#fff" : "#4A5A6A" }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {planTab === "improvements" && (
              <div className="fade-up">
                <div style={{ background: "#0D1520", border: "1px solid #1E2A38", borderRadius: 10, padding: "14px 20px", marginBottom: 22, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                  {[["#C0392B", "High — fix first"], ["#D4A017", "Medium — fix soon"], ["#1E8A5E", "Low — nice to have"]].map(([c, l]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#5A6A7A" }}>
                      <div style={{ width: 9, height: 9, borderRadius: 2, background: c, flexShrink: 0 }} />{l}
                    </div>
                  ))}
                  <span style={{ fontSize: 12, color: "#2A3A4A", marginLeft: "auto" }}>Tap any task to expand</span>
                </div>
                {plan.improvements?.map((item, i) => <ImprovementCard key={i} item={item} />)}
              </div>
            )}

            {planTab === "blog" && (
              <div className="fade-up">
                <div style={{ background: "#0D1520", border: "1px solid #1A2A20", borderRadius: 10, padding: "16px 20px", marginBottom: 22 }}>
                  <div style={{ fontSize: 14, color: "#5A7A6A", lineHeight: 1.8 }}>
                    <strong style={{ color: "#8AAAA0" }}>📋 How to use:</strong> Hit "Copy Prompt" and paste into ChatGPT or Claude. You'll get a full SEO blog post ready to publish. Aim for 1–2 posts per week.
                  </div>
                </div>
                {plan.posts?.map((post, i) => <BlogCard key={i} post={post} index={i} />)}
              </div>
            )}

            <div style={{ marginTop: 36, paddingTop: 24, borderTop: "1px solid #141E28", display: "flex", gap: 12 }}>
              <Btn onClick={() => setStep("keywords")}>← Back to keywords</Btn>
              <Btn onClick={reset}>↺ Analyse another site</Btn>
            </div>
          </div>
        )}

        <div ref={bottom} />
      </div>
    </div>
  );
}
