import { useState, useEffect, useRef, useCallback } from "react";

const SUBJECTS = {
  Physics: { color: "#4488ff", emoji: "⚛️" },
  Chemistry: { color: "#ff4444", emoji: "⚗️" },
  Biology: { color: "#39ff14", emoji: "🧬" },
};

const fmt = (ms) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

const fmtSec = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function GrindSplit() {
  const [page, setPage] = useState("timer");
  const [running, setRunning] = useState(false);
  const [activeSide, setActiveSide] = useState("focus");
  const [focusTotal, setFocusTotal] = useState(0);
  const [breakTotal, setBreakTotal] = useState(0);
  const [lapStart, setLapStart] = useState(null);
  const [lapMs, setLapMs] = useState(0);
  const [laps, setLaps] = useState([]);
  const [lapCount, setLapCount] = useState(0);
  const [breakCount, setBreakCount] = useState(0);
  const [subjectTimes, setSubjectTimes] = useState({ Physics: 0, Chemistry: 0, Biology: 0 });
  const [modal, setModal] = useState(null); // {side, ms, onSave}
  const [lapName, setLapName] = useState("");
  const [lapSubject, setLapSubject] = useState("Physics");
  const [now, setNow] = useState(new Date());
  const [calData, setCalData] = useState({});
  const [calMonth, setCalMonth] = useState(new Date());
  const [gcConnected, setGcConnected] = useState(false);
  const [gcError, setGcError] = useState(false);
  const lapStartRef = useRef(null);
  const runningRef = useRef(false);
  const activeSideRef = useRef("focus");
  const pendingSwitch = useRef(null);
  const rafRef = useRef(null);
  const focusTotalRef = useRef(0);
  const breakTotalRef = useRef(0);

  useEffect(() => { focusTotalRef.current = focusTotal; }, [focusTotal]);
  useEffect(() => { breakTotalRef.current = breakTotal; }, [breakTotal]);
  useEffect(() => { activeSideRef.current = activeSide; }, [activeSide]);
  useEffect(() => { runningRef.current = running; }, [running]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load calendar data
  useEffect(() => {
    const load = async () => {
      try {
        const r = await window.storage.get("grindsplit-caldata");
        if (r) setCalData(JSON.parse(r.value));
      } catch {}
    };
    load();
  }, []);

  // RAF timer
  useEffect(() => {
    const tick = () => {
      if (runningRef.current && lapStartRef.current) {
        setLapMs(Date.now() - lapStartRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const saveCalData = async (data) => {
    try {
      await window.storage.set("grindsplit-caldata", JSON.stringify(data));
    } catch {}
  };

  const addStudyTime = (ms, subject) => {
    const key = todayKey();
    setCalData(prev => {
      const next = { ...prev };
      if (!next[key]) next[key] = { total: 0, subjects: {} };
      next[key].total = (next[key].total || 0) + ms;
      next[key].subjects = { ...next[key].subjects };
      next[key].subjects[subject] = (next[key].subjects[subject] || 0) + ms;
      saveCalData(next);
      return next;
    });
  };

  const saveLap = useCallback((ms, subject, name, lapNum) => {
    const finalName = name.trim() || `Study ${lapNum}`;
    setLaps(prev => [{
      id: Date.now(),
      name: finalName,
      subject,
      ms,
      side: activeSideRef.current,
    }, ...prev]);
    setSubjectTimes(prev => ({ ...prev, [subject]: prev[subject] + ms }));
    if (activeSideRef.current === "focus") {
      setFocusTotal(p => p + ms);
    } else {
      setBreakTotal(p => p + ms);
    }
    if (subject !== "Break") addStudyTime(ms, subject);
  }, []);

  const openModal = (ms, onSave) => {
    setModal({ ms, onSave });
    setLapName("");
    setLapSubject("Physics");
  };

  const handleModalSave = (skip = false) => {
    if (!modal) return;
    const newCount = lapCount + 1;
    setLapCount(newCount);
    const name = skip ? "" : lapName;
    modal.onSave(modal.ms, lapSubject, name, newCount);
    setModal(null);
    if (pendingSwitch.current) {
      pendingSwitch.current();
      pendingSwitch.current = null;
    }
  };

  const switchSide = useCallback(() => {
    if (!runningRef.current) return;
    const elapsed = lapStartRef.current ? Date.now() - lapStartRef.current : 0;
    const doSwitch = () => {
      const newSide = activeSideRef.current === "focus" ? "break" : "focus";
      setActiveSide(newSide);
      activeSideRef.current = newSide;
      lapStartRef.current = Date.now();
      setLapMs(0);
    };
    if (activeSideRef.current === "break") {
      setBreakCount(prev => {
        const num = prev + 1;
        setLaps(lps => [{ id: Date.now(), name: `Break ${num}`, subject: "Break", ms: elapsed, side: "break" }, ...lps]);
        return num;
      });
      setBreakTotal(p => p + elapsed);
      doSwitch();
    } else {
      openModal(elapsed, (ms, subj, name, num) => {
        saveLap(ms, subj, name, num);
      });
      pendingSwitch.current = doSwitch;
    }
  }, [saveLap]);

  const toggleRunning = () => {
    if (!running) {
      lapStartRef.current = Date.now() - lapMs;
      setRunning(true);
    } else {
      setLapMs(Date.now() - lapStartRef.current);
      lapStartRef.current = null;
      setRunning(false);
    }
  };

  const reset = () => {
    setRunning(false);
    lapStartRef.current = null;
    setLapMs(0);
    setLapStart(null);
    setFocusTotal(0);
    setBreakTotal(0);
    setLaps([]);
    setLapCount(0);
    setBreakCount(0);
    setSubjectTimes({ Physics: 0, Chemistry: 0, Biology: 0 });
    setActiveSide("focus");
    activeSideRef.current = "focus";
    setModal(null);
    pendingSwitch.current = null;
  };

  useEffect(() => {
    const handler = (e) => {
      if (modal) {
        if (e.key === "Enter") { e.preventDefault(); handleModalSave(false); }
        return;
      }
      if (e.key === " ") { e.preventDefault(); switchSide(); }
      if (e.key === "p" || e.key === "P") { e.preventDefault(); toggleRunning(); }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, lapName, lapSubject, running, switchSide]);

  const maxSubj = Math.max(...Object.values(subjectTimes), 1);
  const totalStudy = Object.values(subjectTimes).reduce((a, b) => a + b, 0);

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const getCalDays = () => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, key, data: calData[key] || null });
    }
    return cells;
  };

  const getHeatColor = (ms) => {
    if (!ms || ms === 0) return "rgba(255,255,255,0.04)";
    const hours = ms / 3600000;
    const intensity = Math.min(hours / 8, 1);
    if (intensity < 0.25) return `rgba(57,255,20,${0.2 + intensity * 1.2})`;
    if (intensity < 0.5) return `rgba(57,255,20,${0.5 + intensity * 0.8})`;
    if (intensity < 0.75) return `rgba(100,255,60,${0.7 + intensity * 0.4})`;
    return `rgba(150,255,100,${0.85 + intensity * 0.15})`;
  };

  const monthName = calMonth.toLocaleString("default", { month: "long", year: "numeric" });
  const calCells = getCalDays();
  const maxDayMs = Math.max(...Object.values(calData).map(d => d?.total || 0), 1);

  const handleGcConnect = () => {
    setGcError(true);
    setTimeout(() => setGcError(false), 4000);
  };

  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{
      width: "100%",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#0a0a0a",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      color: "#e0e0e0",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Bebas+Neue&display=swap');
        html, body, #root { width: 100%; height: 100%; margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; }
        .lap-item { animation: lapIn 0.3s cubic-bezier(.2,1,.3,1); }
        @keyframes lapIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        .nav-btn { background: none; border: none; cursor: pointer; padding: 8px 18px; font-family: inherit; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; transition: all 0.2s; }
        .nav-btn.active { color: #39ff14; border-bottom: 2px solid #39ff14; }
        .nav-btn:not(.active) { color: #555; }
        .nav-btn:not(.active):hover { color: #888; }
        .side-box { transition: opacity 0.2s, border-color 0.2s; cursor: pointer; }
        .side-box:hover { opacity: 0.95; }
        .cal-cell { transition: transform 0.15s, box-shadow 0.15s; cursor: default; }
        .cal-cell:hover { transform: scale(1.15); box-shadow: 0 0 8px rgba(57,255,20,0.4); z-index: 10; position: relative; }
        .modal-overlay { animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .modal-box { animation: slideUp 0.25s cubic-bezier(.2,1,.3,1); }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .subj-btn { border: 1px solid #333; background: none; cursor: pointer; font-family: inherit; font-size: 11px; padding: 6px 12px; border-radius: 4px; transition: all 0.15s; color: #888; }
        .subj-btn.sel-Physics { border-color: #39ff14; color: #39ff14; background: rgba(57,255,20,0.08); }
        .subj-btn.sel-Chemistry { border-color: #ff4444; color: #ff4444; background: rgba(255,68,68,0.08); }
        .subj-btn.sel-Biology { border-color: #4488ff; color: #4488ff; background: rgba(68,136,255,0.08); }
        .gc-btn { background: none; border: 1px solid #333; color: #666; font-family: inherit; font-size: 11px; letter-spacing: 1px; padding: 7px 16px; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
        .gc-btn:hover { border-color: #4285f4; color: #4285f4; }
        .gc-btn.connected { border-color: #39ff14; color: #39ff14; }
        .timer-digit { font-family: 'Bebas Neue', 'JetBrains Mono', monospace; }
        .ctrl-btn { width: 48px; height: 48px; border-radius: 50%; border: 1px solid #333; background: #111; cursor: pointer; font-size: 18px; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
        .ctrl-btn:hover { border-color: #666; background: #1a1a1a; transform: scale(1.05); }
        .ctrl-btn.primary { border-color: #39ff14; color: #39ff14; }
        .ctrl-btn.primary:hover { background: rgba(57,255,20,0.1); }
      `}</style>

      {/* Subtle grid bg */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(57,255,20,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.02) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a1a1a",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(10,10,10,0.95)",
        backdropFilter: "blur(10px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: "'Bebas Neue', monospace", fontSize: 28, letterSpacing: 4, color: "#39ff14", textShadow: "0 0 20px rgba(57,255,20,0.4)" }}>GRIND<span style={{ color: "#fff" }}>SPLIT</span></span>
          <span style={{ fontSize: 10, color: "#333", letterSpacing: 2 }}>v2.0</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>{dateStr}</div>
          <div style={{ fontSize: 13, color: "#888", fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          <button className={`nav-btn ${page === "timer" ? "active" : ""}`} onClick={() => setPage("timer")}>Timer</button>
          <button className={`nav-btn ${page === "stats" ? "active" : ""}`} onClick={() => setPage("stats")}>Stats</button>
        </nav>
      </div>

      {/* TIMER PAGE */}
      {page === "timer" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 24px", minHeight: 0 }}>

          {/* Dual timers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "stretch", marginBottom: 12, flexShrink: 0 }}>

            {/* Focus box */}
            <div className="side-box" onClick={() => { if (running && activeSide !== "focus") switchSide(); }}
              style={{
                border: `1px solid ${activeSide === "focus" ? "#39ff14" : "#1a1a1a"}`,
                borderRadius: 8, padding: "28px 24px",
                background: activeSide === "focus" ? "rgba(57,255,20,0.03)" : "rgba(255,255,255,0.01)",
                boxShadow: activeSide === "focus" ? "0 0 30px rgba(57,255,20,0.08)" : "none",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: activeSide === "focus" ? "#39ff14" : "#333", boxShadow: activeSide === "focus" ? "0 0 8px #39ff14" : "none" }} />
                <span style={{ fontSize: 11, letterSpacing: 3, color: activeSide === "focus" ? "#39ff14" : "#444", textTransform: "uppercase" }}>Focus</span>
              </div>
              <div className="timer-digit" style={{ fontSize: 52, color: activeSide === "focus" ? "#39ff14" : "#333", letterSpacing: 2, lineHeight: 1, marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
                {activeSide === "focus" ? fmt(lapMs) : "00:00.00"}
              </div>
              <div style={{ fontSize: 11, color: "#444" }}>TOTAL <span style={{ color: "#666" }}>{fmt(focusTotal + (activeSide === "focus" ? lapMs : 0))}</span></div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 8px" }}>
              <div style={{ fontSize: 9, color: "#333", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>ctrl</div>
              <button className="ctrl-btn primary" onClick={toggleRunning} title="P">
                {running ? "⏸" : "▶"}
              </button>
              <button className="ctrl-btn" onClick={reset} style={{ color: "#555" }} title="R">↺</button>
              <div style={{ fontSize: 9, color: "#222", letterSpacing: 1, marginTop: 8, lineHeight: 1.8, textAlign: "center" }}>
                <div>P pause</div>
                <div>R reset</div>
                <div>SPC switch</div>
              </div>
            </div>

            {/* Break box */}
            <div className="side-box" onClick={() => { if (running && activeSide !== "break") switchSide(); }}
              style={{
                border: `1px solid ${activeSide === "break" ? "#ffffff" : "#1a1a1a"}`,
                borderRadius: 8, padding: "28px 24px",
                background: activeSide === "break" ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)",
                boxShadow: activeSide === "break" ? "0 0 30px rgba(255,255,255,0.06)" : "none",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: activeSide === "break" ? "#ffffff" : "#333", boxShadow: activeSide === "break" ? "0 0 8px #ffffff" : "none" }} />
                <span style={{ fontSize: 11, letterSpacing: 3, color: activeSide === "break" ? "#ffffff" : "#444", textTransform: "uppercase" }}>Break</span>
              </div>
              <div className="timer-digit" style={{ fontSize: 52, color: activeSide === "break" ? "#ffffff" : "#333", letterSpacing: 2, lineHeight: 1, marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
                {activeSide === "break" ? fmt(lapMs) : "00:00.00"}
              </div>
              <div style={{ fontSize: 11, color: "#444" }}>TOTAL <span style={{ color: "#666" }}>{fmt(breakTotal + (activeSide === "break" ? lapMs : 0))}</span></div>
            </div>
          </div>

          {/* Unified lap list */}
          {laps.length > 0 && (
            <div style={{ border: "1px solid #1a1a1a", borderRadius: 8, background: "#050505", marginBottom: 12, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ padding: "12px 20px", borderBottom: "1px solid #111", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, letterSpacing: 3, color: "#444", textTransform: "uppercase" }}>Lap History</span>
                <span style={{ fontSize: 10, color: "#333" }}>{laps.length} laps</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {(() => {
                  // Build separate per-type counters (most recent first, so reverse-count)
                  const studyLaps = laps.filter(l => l.side === "focus");
                  const breakLaps = laps.filter(l => l.side === "break");
                  return laps.map((l, idx) => {
                  const isFocus = l.side === "focus";
                  const subjectInfo = SUBJECTS[l.subject];
                  const subjColor = subjectInfo ? subjectInfo.color : (isFocus ? "#39ff14" : "#ffffff");
                  const tag = l.subject ? l.subject.toUpperCase() : (isFocus ? "FOCUS" : "BREAK");
                  const emoji = subjectInfo ? subjectInfo.emoji + " " : "";
                  const typeList = isFocus ? studyLaps : breakLaps;
                  const typeIdx = typeList.indexOf(l);
                  const typeNum = typeList.length - typeIdx;
                  const prefix = isFocus ? "S" : "B";
                  return (
                    <div key={l.id} className="lap-item"
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 20px", borderBottom: "1px solid #0d0d0d", fontSize: 11 }}>
                      <span style={{ fontSize: 9, color: isFocus ? "#39ff1455" : "#ffffff44", width: 28, flexShrink: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{prefix}{typeNum}</span>
                      <span style={{ color: subjColor, fontSize: 9, border: `1px solid ${subjColor}`, padding: "1px 6px", borderRadius: 2, flexShrink: 0, letterSpacing: 1 }}>{emoji}{tag}</span>
                      <span style={{ color: isFocus ? "#888" : "#666", flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                      <span style={{ color: "#555", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmt(l.ms)}</span>
                    </div>
                  );
                });})()}
              </div>
            </div>
          )}

          {/* Subject bars */}
          <div style={{ border: "1px solid #1a1a1a", borderRadius: 8, padding: "14px 20px", background: "#050505", flexShrink: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 16 }}>Subject Breakdown</div>
            {Object.entries(SUBJECTS).map(([subj, meta]) => {
              const t = subjectTimes[subj];
              const pct = totalStudy > 0 ? (t / totalStudy) * 100 : 0;
              return (
                <div key={subj} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
                    <span style={{ color: meta.color }}>{meta.emoji} {subj}</span>
                    <span style={{ color: "#555", fontVariantNumeric: "tabular-nums" }}>{fmt(t)} <span style={{ color: "#333" }}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height: 4, background: "#111", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: meta.color, borderRadius: 2, boxShadow: `0 0 8px ${meta.color}88`, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STATS PAGE */}
      {page === "stats" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Month nav + GC */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
                style={{ background: "none", border: "1px solid #222", color: "#666", width: 28, height: 28, borderRadius: 4, cursor: "pointer", fontSize: 14 }}>‹</button>
              <span style={{ fontFamily: "'Bebas Neue', monospace", fontSize: 22, letterSpacing: 3, color: "#fff" }}>{monthName.toUpperCase()}</span>
              <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
                style={{ background: "none", border: "1px solid #222", color: "#666", width: 28, height: 28, borderRadius: 4, cursor: "pointer", fontSize: 14 }}>›</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {gcError && <span style={{ fontSize: 10, color: "#ff4444", letterSpacing: 1 }}>OAuth not available in sandbox — use export below</span>}
              <button className={`gc-btn ${gcConnected ? "connected" : ""}`} onClick={handleGcConnect}>
                {gcConnected ? "✓ Google Calendar" : "⊕ Connect Google Calendar"}
              </button>
            </div>
          </div>

          {/* Calendar grid */}
          <div style={{ border: "1px solid #1a1a1a", borderRadius: 8, padding: "24px", background: "#050505", marginBottom: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
              {days.map(d => (
                <div key={d} style={{ fontSize: 9, color: "#333", textAlign: "center", letterSpacing: 2, paddingBottom: 4 }}>{d.toUpperCase()}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {calCells.map((cell, i) => {
                if (!cell) return <div key={`empty-${i}`} />;
                const isToday = cell.key === todayKey();
                const ms = cell.data?.total || 0;
                const hours = ms / 3600000;
                const bg = getHeatColor(ms);
                return (
                  <div key={cell.key} className="cal-cell" title={ms > 0 ? `${hours.toFixed(1)}h studied` : "No data"}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 4,
                      background: bg,
                      border: isToday ? "1px solid #39ff14" : "1px solid transparent",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      position: "relative",
                    }}>
                    <span style={{ fontSize: 10, color: ms > 0 ? "#000" : "#333", fontWeight: ms > 0 ? 700 : 400 }}>{cell.day}</span>
                    {ms > 0 && <span style={{ fontSize: 7, color: "#000a", marginTop: 1 }}>{hours.toFixed(1)}h</span>}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <span style={{ fontSize: 9, color: "#444" }}>Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map(v => (
                <div key={v} style={{ width: 12, height: 12, borderRadius: 2, background: getHeatColor(v * 8 * 3600000) }} />
              ))}
              <span style={{ fontSize: 9, color: "#444" }}>More</span>
            </div>
          </div>

          {/* Monthly summary */}
          {(() => {
            const year = calMonth.getFullYear();
            const month = calMonth.getMonth();
            const monthDays = calCells.filter(c => c && c.data);
            const totalMs = monthDays.reduce((a, c) => a + (c.data?.total || 0), 0);
            const subjTotals = {};
            monthDays.forEach(c => {
              Object.entries(c.data?.subjects || {}).forEach(([s, ms]) => {
                subjTotals[s] = (subjTotals[s] || 0) + ms;
              });
            });
            const activeDays = monthDays.length;
            const avgMs = activeDays > 0 ? totalMs / activeDays : 0;

            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Total This Month", value: fmtSec(Math.floor(totalMs / 1000)), sub: `${activeDays} active days` },
                  { label: "Daily Average", value: fmtSec(Math.floor(avgMs / 1000)), sub: "on active days" },
                  { label: "Best Subject", value: Object.keys(subjTotals).length ? Object.entries(subjTotals).sort((a, b) => b[1] - a[1])[0][0] : "—", sub: Object.keys(subjTotals).length ? fmtSec(Math.floor(Object.values(subjTotals).sort((a,b)=>b-a)[0]/1000)) : "no data" },
                ].map(stat => (
                  <div key={stat.label} style={{ border: "1px solid #1a1a1a", borderRadius: 8, padding: "20px 20px", background: "#050505" }}>
                    <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>{stat.label}</div>
                    <div style={{ fontFamily: "'Bebas Neue', monospace", fontSize: 28, color: "#39ff14", letterSpacing: 2, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>{stat.sub}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Subject breakdown for month */}
          <div style={{ border: "1px solid #1a1a1a", borderRadius: 8, padding: "14px 20px", background: "#050505", flexShrink: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 16 }}>Monthly Subject Distribution</div>
            {(() => {
              const monthDays = calCells.filter(c => c && c.data);
              const subjTotals = {};
              monthDays.forEach(c => {
                Object.entries(c.data?.subjects || {}).forEach(([s, ms]) => {
                  subjTotals[s] = (subjTotals[s] || 0) + ms;
                });
              });
              const total = Object.values(subjTotals).reduce((a, b) => a + b, 0);
              if (total === 0) return <div style={{ fontSize: 11, color: "#333", textAlign: "center", padding: "20px 0" }}>No study data for this month yet. Start a timer session!</div>;
              return Object.entries(SUBJECTS).map(([subj, meta]) => {
                const t = subjTotals[subj] || 0;
                const pct = total > 0 ? (t / total) * 100 : 0;
                return (
                  <div key={subj} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
                      <span style={{ color: meta.color }}>{meta.emoji} {subj}</span>
                      <span style={{ color: "#555" }}>{fmtSec(Math.floor(t / 1000))} <span style={{ color: "#333" }}>({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: "#111", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${meta.color}88, ${meta.color})`, borderRadius: 3, boxShadow: `0 0 10px ${meta.color}44`, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* GC Note */}
          <div style={{ marginTop: 20, padding: "14px 20px", border: "1px solid #1a1a1a", borderRadius: 8, background: "#050505" }}>
            <div style={{ fontSize: 9, color: "#333", letterSpacing: 2, marginBottom: 6, textTransform: "uppercase" }}>Google Calendar Sync</div>
            <p style={{ fontSize: 11, color: "#444", lineHeight: 1.7, margin: 0 }}>
              Full Google Calendar OAuth sync requires a backend server for token handling. To integrate: export your study sessions as .ics events from the data below, or deploy GrindSplit with a Node.js backend using the Google Calendar API with OAuth2.  Your sessions are already stored locally and persist across sessions using this app's storage.
            </p>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleModalSave(true); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="modal-box" style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 12, padding: "32px 36px", width: 420, boxShadow: "0 0 60px rgba(0,0,0,0.8)" }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 6 }}>Lap Complete</div>
            <div style={{ fontFamily: "'Bebas Neue', monospace", fontSize: 36, color: "#39ff14", letterSpacing: 2, marginBottom: 24 }}>{fmt(modal.ms)}</div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, color: "#444", letterSpacing: 2, display: "block", marginBottom: 8 }}>LAP NAME</label>
              <input
                autoFocus
                value={lapName}
                onChange={e => setLapName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleModalSave(false); } }}
                placeholder="e.g. Vectors – Projectile"
                style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 6, padding: "10px 14px", color: "#ccc", fontFamily: "inherit", fontSize: 13, outline: "none" }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 10, color: "#444", letterSpacing: 2, display: "block", marginBottom: 8 }}>SUBJECT</label>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.entries(SUBJECTS).map(([s, meta]) => (
                  <button key={s} className={`subj-btn sel-${lapSubject === s ? s : ""}`}
                    onClick={() => setLapSubject(s)}
                    style={{ flex: 1, borderColor: lapSubject === s ? meta.color : undefined, color: lapSubject === s ? meta.color : undefined, background: lapSubject === s ? `${meta.color}15` : undefined }}>
                    {meta.emoji} {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleModalSave(false)} style={{ flex: 1, padding: "10px", background: "rgba(57,255,20,0.1)", border: "1px solid #39ff14", color: "#39ff14", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12, letterSpacing: 2 }}>SAVE</button>
              <button onClick={() => handleModalSave(true)} style={{ padding: "10px 20px", background: "none", border: "1px solid #222", color: "#555", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12, letterSpacing: 2 }}>SKIP</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
