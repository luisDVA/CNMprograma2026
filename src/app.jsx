import React from "react";
import ReactDOM from "react-dom/client";
import QRCode from "qrcode";
const { useState, useEffect, useMemo } = React;

const BADGE_CLASS = {
  "Logística": "logistica",
  "Simposio": "simposio",
  "Cartel": "cartel",
  "Conferencia magistral": "magistral"
};

const SHORT_TYPE = {
  "Conferencia magistral": "Magistral",
  "Simposio": "Simposio",
  "Ponencia": "Ponencia",
  "Cartel": "Cartel",
  "Logística": "Logística"
};

const DAY_ORDER = ["Lunes 19", "Martes 20", "Miércoles 21", "Jueves 22", "Viernes 23"];
const DAY_DATES = { "Lunes 19": "2026-10-19", "Martes 20": "2026-10-20",
                    "Miércoles 21": "2026-10-21", "Jueves 22": "2026-10-22",
                    "Viernes 23": "2026-10-23" };

const idOf = e => `${e.day}|${e.time}|${e.venue}|${e.title}`;

// Normaliza texto para búsqueda sin distinción de acentos/mayúsculas
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function shortAuthors(a) {
  if (!a) return "";
  const parts = a.split(/,| y /).map(s => s.trim()).filter(Boolean);
  return parts.length > 2 ? parts[0] + " et al." : a;
}

function App() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [day, setDay] = useState("Todos");
  const [venue, setVenue] = useState("Todos");
  const [type, setType] = useState("Todos");
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [goNow, setGoNow] = useState(false);
  const [selected, setSelected] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cnm-mi-programa") || "[]")); }
    catch { return new Set(); }
  });
  const safeStore = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { } }
  };

  useEffect(() => {
    if (typeof PROGRAM_DATA !== "undefined") { setEvents(PROGRAM_DATA); return; }
    fetch("program.json")
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setEvents)
      .catch(() => setError("No se pudo cargar program.json"));
  }, []);

  useEffect(() => {
    safeStore.set("cnm-mi-programa", JSON.stringify([...selected]));
  }, [selected]);

  const toggle = id => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const todayName = useMemo(() => {
    const d = new Date();
    const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
              + "-" + String(d.getDate()).padStart(2, "0");
    return Object.entries(DAY_DATES).find(([, v]) => v === iso)?.[0] || null;
  }, []);

  const days = useMemo(() =>
    [...new Set(events.map(e => e.day))]
      .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
  , [events]);
  const venues = useMemo(() => [...new Set(events.map(e => e.venue))].sort(), [events]);
  const types = useMemo(() => [...new Set(events.map(e => e.type))].sort(), [events]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return events
      .filter(e =>
        (day === "Todos" || e.day === day) &&
        (venue === "Todos" || e.venue === venue) &&
        (type === "Todos" || e.type === type) &&
        (!onlySelected || selected.has(idOf(e))) &&
        (!q || norm(e.title).includes(q) ||
               norm(e.authors).includes(q) ||
               norm(e.session).includes(q))
      )
      .sort((a, b) =>
        DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
        a.time.localeCompare(b.time) ||
        a.venue.localeCompare(b.venue)
      );
  }, [events, day, venue, type, query, onlySelected, selected]);

  // Al pulsar "Ahora": desplázate al evento con hora de inicio más cercana a la actual
  useEffect(() => {
    if (!goNow) return;
    setGoNow(false);
    if (!filtered.length) return;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const toMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    let best = filtered[0], bestDiff = Infinity;
    for (const e of filtered) {
      const d = Math.abs(toMins(e.time) - mins);
      if (d < bestDiff) { bestDiff = d; best = e; }
    }
    document.getElementById("ev-" + filtered.indexOf(best))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [goNow, filtered]);

  // IDs de eventos seleccionados que chocan con otro seleccionado (mismo día y hora)
  const clashes = useMemo(() => {
    const mine = events.filter(e => selected.has(idOf(e)));
    const c = new Set();
    for (const e of mine) {
      if (mine.some(o => o !== e && o.day === e.day && o.time === e.time)) c.add(idOf(e));
    }
    return c;
  }, [events, selected]);

  const grouped = useMemo(() => {
    const g = {};
    for (const e of filtered) (g[e.day] ||= []).push(e);
    return g;
  }, [filtered]);

  function downloadTXT() {
    const mine = events
      .filter(e => selected.has(idOf(e)))
      .sort((a, b) =>
        DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
        a.time.localeCompare(b.time) ||
        a.venue.localeCompare(b.venue)
      );
    const INDENT = " ".repeat(20);
    const lines = [
      "MI PROGRAMA — XVII Congreso Nacional de Mastozoología",
      "19–23 de octubre de 2026 · generado " + new Date().toLocaleDateString("es-MX"),
      "─".repeat(44),
      ""
    ];
    let lastDay = null;
    for (const e of mine) {
      const clash = mine.some(o => o !== e && o.day === e.day && o.time === e.time);
      if (e.day !== lastDay) {
        if (lastDay) lines.push("");
        lines.push(e.day.toUpperCase());
        lastDay = e.day;
      }
      const t = (SHORT_TYPE[e.type] || e.type).padEnd(9);
      lines.push(`  ${e.time}  ${t}  ${e.title}${clash ? "   ⚠ traslape" : ""}`);
      const meta = [shortAuthors(e.authors), e.venue].filter(Boolean).join(" · ");
      if (meta) lines.push(INDENT + meta);
      if (e.type === "Simposio") lines.push(INDENT + "S: " + e.session);
    }
    lines.push("", "— Generado desde " + location.href);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mi-programa-CNMM2026.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (!showQR) return;
    const canvas = document.getElementById("qr-canvas");
    if (canvas) {
      QRCode.toCanvas(canvas, location.href,
        { width: 220, margin: 1, color: { dark: "#2b2b2b", light: "#ffffff" } },
        err => { if (err) console.error(err); });
    }
  }, [showQR]);

  if (error) return <div className="container"><p className="empty">{error}</p></div>;

  return (
    <div>
      <header>
        <h1>XVII Congreso Nacional de Mastozoología</h1>
        <p>19–23 de octubre de 2026</p>
        <button className="qr-btn" onClick={() => setShowQR(true)}>⊞ Compartir con QR</button>
      </header>
      {showQR && (
        <div className="qr-overlay" onClick={() => setShowQR(false)}>
          <div className="qr-modal" role="dialog" aria-label="Código QR del programa"
               onClick={e => e.stopPropagation()}>
            <h3>Escanea para abrir el programa</h3>
            <canvas id="qr-canvas"></canvas>
            <p className="qr-url">{location.href}</p>
            <button className="qr-close" onClick={() => setShowQR(false)}>Cerrar</button>
          </div>
        </div>
      )}
      <div className="container">
        <p className="notice">
          ⚠ Página experimental y sujeta a cambios. Verifica siempre el programa oficial y las redes del congreso.
          Programada por <a href="https://maevolab.mx/personas/luis.html" target="_blank" rel="noopener">Luis Verde Arregoitia</a> · INECOL.
        </p>
        <div className="filters">
          <input type="search" placeholder="Buscar por título, autor o sesión…"
                 aria-label="Buscar por título, autor o sesión"
                 value={query} onChange={e => setQuery(e.target.value)} />
          <div className="field">
            <span className="field-label">SEDE</span>
            <select value={venue} onChange={e => setVenue(e.target.value)}
                    aria-label="Filtrar por sede">
              <option>Todos</option>
              {venues.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field-label">TIPO</span>
            <select value={type} onChange={e => setType(e.target.value)}
                    aria-label="Filtrar por tipo de evento">
              <option>Todos</option>
              {types.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <button className={"only-sel" + (onlySelected ? " active" : "")}
                  onClick={() => setOnlySelected(v => !v)}>
            ★ Mi programa ({selected.size})
          </button>
        </div>
        <p className="hint">Usa las estrellas para armar un programa personalizado</p>
        <div className="day-tabs">
          <button className={day === "Todos" ? "active" : ""} onClick={() => setDay("Todos")}>Todos</button>
          {todayName && (
            <button className="now-btn" onClick={() => { setDay(todayName); setGoNow(true); }}>
              ⏱ Ahora
            </button>
          )}
          {days.map(d => (
            <button key={d} className={day === d ? "active" : ""} onClick={() => setDay(d)}>{d}</button>
          ))}
        </div>
        <p className="count">{filtered.length} evento{filtered.length === 1 ? "" : "s"}</p>
        {filtered.length === 0 && (
          <p className="empty">
            {onlySelected && selected.size === 0
              ? "Aún no has añadido eventos a tu programa. Toca “☆ Mi programa” en cualquier evento."
              : "Sin resultados."}
          </p>
        )}
        {Object.entries(grouped).map(([d, evts]) => (
          <div key={d}>
            <h2>{d} de octubre</h2>
            {evts.map(e => {
              const id = idOf(e);
              const sel = selected.has(id);
              return (
                <div className={"event" + (sel ? " selected" : "")} key={id}
                     id={"ev-" + filtered.indexOf(e)}>
                  <div>
                    <div className="time">{e.time}</div>
                    <div className="venue">{e.venue}</div>
                  </div>
                  <div>
                    <span className={"badge " + (BADGE_CLASS[e.type] || "")}>{e.type}</span>
                    <h3>{e.title}</h3>
                    {e.authors && <div className="authors">{e.authors}</div>}
                    {e.session && e.type !== "Logística" && (
                      <div className="session-name">{e.session}</div>
                    )}
                    {sel && clashes.has(id) && (
                      <span className="clash" title="Tienes otro evento seleccionado a esta misma hora">⚠ traslape</span>
                    )}
                  </div>
                  <button className={"pick" + (sel ? " on" : "")}
                          onClick={() => toggle(id)}
                          aria-pressed={sel}
                          title={sel ? "Quitar de mi programa" : "Añadir a mi programa"}>
                    {sel ? "★ En mi programa" : "☆ Mi programa"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {selected.size > 0 && events.length > 0 && (
        <div className="tray">
          <span>★ {selected.size} en mi programa</span>
          <button className="tray-download" onClick={downloadTXT}>Descargar (.txt)</button>
          <button className="tray-clear" onClick={() => setSelected(new Set())}>Limpiar</button>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
