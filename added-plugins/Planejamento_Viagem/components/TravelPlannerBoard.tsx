/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
/** @jsxRuntime classic */
/* eslint-disable */
/* @ts-nocheck */

/* ===================== Config Board ===================== */
const MINUTES_PER_PIXEL = 1;            // 1 px = 1 min
const DAY_START_MIN     = 10 * 60;      // 10:00  (ajuste pedido)
const DAY_END_MIN       = 24 * 60;      // 00:00 (meia-noite)
const BOTTOM_PADDING_PX = 40;           // espaço extra p/ não cortar o último card

// Durações padrão
const BASE_START_MIN  = 60;             // base de INÍCIO = 60 min
const BASE_END_MIN    = 120;            // base de TÉRMINO = 120 min (até 00:00)
const POI_CARD_MIN    = 60;             // POI = 1h
const RESIZE_STEP_MIN = 5;

/* ===================== Paleta de cores (15 fixas, sem vermelho) ===================== */
const PALETTE_15 = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#6366f1', '#14b8a6',
  '#a855f7', '#10b981', '#84cc16', '#06b6d4', '#f97316',
  '#3b82f6', '#8b5cf6', '#2dd4bf', '#65a30d', '#0891b2',
];
const colorForDay = (i) => PALETTE_15[i % PALETTE_15.length];

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgba(hex, a = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/* ===================== Distância/ETA ===================== */
function isValidCoord(c) {
  return Array.isArray(c) && c.length === 2 &&
    Number.isFinite(c[0]) && Number.isFinite(c[1]);
}
function haversineMeters(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) return 0;
  const R = 6371000, toRad = (deg) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const s = Math.sin(dLat/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}
const CRUISING_KMH_DEFAULT = 80;
const etaFromKm = (km, kmh = CRUISING_KMH_DEFAULT) =>
  Math.max(5, Math.round((km / Math.max(10, kmh)) * 60));
function etaFromRouteOrFallback(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) return 0;
  const key = `${a[0]},${a[1]}|${b[0]},${b[1]}`;
  const durations = (window || {}).TT_ROUTE_DURATIONS;
  if (durations && typeof durations[key] === 'number') return Math.max(1, Math.round(durations[key]));
  const km = haversineMeters(a, b) / 1000;
  return etaFromKm(km);
}

/* ===================== Exposição para o mapa/pins/totais ===================== */
function notifyMapFull(board, dayColors, onRebuildRoutes) {
  (window || {}).__TT_LAST_NOTIFY_ARGS = { board: JSON.parse(JSON.stringify(board)), dayColors: [...dayColors] };

  const viagens = board.map((d, i) => {
    const color = dayColors[i];
    const legs = [];
    let totalMeters = 0, totalMin = 0;

    for (let k = 0; k < d.pontos.length - 1; k++) {
      const A = d.pontos[k], B = d.pontos[k + 1];
      if (!isValidCoord(A?.coordinates) || !isValidCoord(B?.coordinates)) continue;

      const meters = haversineMeters(A.coordinates, B.coordinates);
      if (meters <= 0) continue;

      const kmExact = meters / 1000;
      const eta = etaFromRouteOrFallback(A.coordinates, B.coordinates);
      totalMeters += meters; totalMin += eta;

      legs.push({
        from: A.label, to: B.label,
        a: A.coordinates, b: B.coordinates,
        distance_km_display: Math.round(kmExact * 10) / 10,
        distance_km_exact: kmExact,
        eta_min: eta,
        style: {
          halo: { color, weight: 8, opacity: 0.25, lineCap: 'round' },
          main: { color, weight: 5, opacity: 0.60, lineCap: 'round' },
        }
      });
    }
    return {
      day: d.data, color, legs,
      total_km: Math.round((totalMeters / 1000) * 10) / 10,
      total_min: Math.round(totalMin)
    };
  });

  let TRIP_METERS = 0, TRIP_MIN = 0;
  for (const v of viagens) { TRIP_METERS += (v.total_km * 1000); TRIP_MIN += v.total_min; }
  (window || {}).TT_TRIP_TOTALS = {
    total_km: Math.round((TRIP_METERS / 1000) * 10) / 10,
    total_min: Math.round(TRIP_MIN)
  };

  const w = (window || {});
  w.TT_VIAGENS = viagens;
  const dayColorMap = {};
  board.forEach((d, i) => dayColorMap[d.data] = dayColors[i]);
  w.TT_DAY_COLORS = dayColorMap;
  w.TT_ROUTE_COLOR_OF_DAY = (iso) => dayColorMap[iso] || '#3388ff';

  const flat = [];
  for (const v of viagens) for (const l of v.legs) flat.push({ day: v.day, coords: [l.a, l.b], style: l.style });
  w.TT_ROUTES = flat;

  const pins = [];
  board.forEach((d, i) => {
    const color = dayColors[i];
    d.pontos.forEach((p) => {
      if (!isValidCoord(p?.coordinates)) return;
      pins.push({ label: p.label, coords: p.coordinates, day: d.data, color, tipo: p.tipo });
    });
  });
  w.TT_PINS = pins;
  w.__TT_LAST_DRAW = { flat, pins };

  w.__TT_DRAW_RETRY && clearTimeout(w.__TT_DRAW_RETRY);
  const tryDraw = (attempt = 0) => {
    const drawR = w.TT_DRAW_ROUTES, drawP = w.TT_DRAW_PINS;
    if (typeof drawR === 'function') drawR(flat);
    if (typeof drawP === 'function') drawP(pins);
    if (!(typeof drawR === 'function' && typeof drawP === 'function') && attempt < 60) {
      w.__TT_DRAW_RETRY = setTimeout(() => tryDraw(attempt + 1), 250);
    }
  };
  tryDraw();

  if (!w.__TT_DRAW_LISTENERS_ATTACHED) {
    w.__TT_DRAW_LISTENERS_ATTACHED = true;
    const redraw = () => {
      const dR = w.TT_DRAW_ROUTES, dP = w.TT_DRAW_PINS, last = w.__TT_LAST_DRAW || {};
      if (typeof dR === 'function' && last.flat) dR(last.flat);
      if (typeof dP === 'function' && last.pins) dP(last.pins);
    };
    window.addEventListener('load', redraw);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) redraw(); });
    window.addEventListener('tt:please-redraw', redraw);

    w.TT_ON_BOARD_OPEN = () => {
      const args = w.__TT_LAST_NOTIFY_ARGS;
      if (args) notifyMapFull(args.board, args.dayColors, null);
      requestAnimationFrame(() => window.dispatchEvent(new Event('tt:please-redraw')));
    };
  }

  // ⚠️ Só disparamos recompute quando explicitamente solicitado
  try { onRebuildRoutes?.(board); } catch {}
}

/* ===================== Utils / Normalização ===================== */
const clone = (x) => JSON.parse(JSON.stringify(x));
const sameCoords = (a, b) =>
  !!a && !!b && a.coordinates?.[0] === b.coordinates?.[0] && a.coordinates?.[1] === b.coordinates?.[1];

function ensureStartIsBase(d) {
  if (!d.pontos.length) return;
  if (d.pontos[0]?.tipo !== 'base' || !String(d.pontos[0]?.id||'').startsWith('base-start-')) {
    const firstBase = d.pontos.find(p => p.tipo === 'base') || d.pontos[0];
    if (firstBase) {
      d.pontos.unshift({
        ...firstBase, tipo:'base', fixo: true, id: `base-start-${d.data}`,
        tempo: firstBase.tempo ?? BASE_START_MIN, startAtMin: 0
      });
    }
  } else {
    d.pontos[0] = {
      ...d.pontos[0], tipo:'base', fixo: true, id: `base-start-${d.data}`,
      tempo: d.pontos[0].tempo ?? BASE_START_MIN, startAtMin: 0
    };
  }
}
function ensureEndIsBase(d) {
  if (!d.pontos.length) return;

  // Já existe um base-end?
  const existingEndIdx = d.pontos.findIndex(p => String(p?.id||'').startsWith('base-end-'));
  if (existingEndIdx >= 0) {
    const end = { ...d.pontos[existingEndIdx] };
    end.tipo = 'base';
    end.id = `base-end-${d.data}`;
    end.tempo = end.tempo ?? BASE_END_MIN;
    end.startAtMin = typeof end.startAtMin === 'number'
      ? end.startAtMin
      : Math.max(0, DAY_END_MIN - DAY_START_MIN - (end.tempo ?? BASE_END_MIN));
    // move para o fim
    d.pontos.splice(existingEndIdx, 1);
    d.pontos.push(end);
    return;
  }

  const last = d.pontos[d.pontos.length - 1];

  // Se o último é base-start, não substituir — adicionar um base-end novo
  if (last?.tipo === 'base' && String(last?.id||'').startsWith('base-start-')) {
    const refBase = last;
    d.pontos.push({
      ...refBase, tipo:'base', fixo: false, id: `base-end-${d.data}`,
      tempo: BASE_END_MIN,
      startAtMin: Math.max(0, DAY_END_MIN - DAY_START_MIN - BASE_END_MIN)
    });
    return;
  }

  if (last?.tipo !== 'base') {
    const refBase = [...d.pontos].reverse().find(p => p.tipo === 'base') || d.pontos[0];
    if (refBase) {
      d.pontos.push({
        ...refBase, tipo:'base', fixo: false, id: `base-end-${d.data}`,
        tempo: BASE_END_MIN,
        startAtMin: Math.max(0, DAY_END_MIN - DAY_START_MIN - BASE_END_MIN)
      });
    }
  } else {
    // Último já é base (mas não base-start): marcar como end
    d.pontos[d.pontos.length - 1] = {
      ...last, tipo:'base', fixo: false, id: `base-end-${d.data}`,
      tempo: last.tempo ?? BASE_END_MIN,
      startAtMin: typeof last.startAtMin === 'number'
        ? last.startAtMin
        : Math.max(0, DAY_END_MIN - DAY_START_MIN - (last.tempo ?? BASE_END_MIN))
    };
  }
}

/** Regra do sono: fim do dia i = início do dia i+1 (fixo às 10:00, 60 min) */
function syncSleepBases(board) {
  const novo = clone(board);
  for (const d of novo) { ensureStartIsBase(d); ensureEndIsBase(d); }

  for (let i = 0; i < novo.length - 1; i++) {
    const endBase = [...novo[i].pontos].reverse().find(p => p.tipo === 'base' && String(p?.id||'').startsWith('base-end-'))
                 || [...novo[i].pontos].reverse().find(p => p.tipo === 'base');
    if (!endBase) continue;

    const first = novo[i + 1].pontos[0];
    if (!first || first.tipo !== 'base' || !sameCoords(first, endBase)) {
      if (first?.tipo === 'base') novo[i + 1].pontos.shift();
      novo[i + 1].pontos.unshift({
        ...endBase, tipo:'base', fixo: true, id: `base-start-${novo[i + 1].data}`,
        tempo: BASE_START_MIN, startAtMin: 0
      });
    } else {
      novo[i + 1].pontos[0] = {
        ...first, tipo:'base', fixo: true, id: `base-start-${novo[i + 1].data}`,
        tempo: BASE_START_MIN, startAtMin: 0
      };
    }
    ensureEndIsBase(novo[i + 1]);
  }

  for (const d of novo) ensureEndIsBase(d);
  return novo;
}

/** Sequenciamento com respeito a startAtMin (quando definido) */
function scheduleDay(dia) {
  const items = [];
  let clock = DAY_START_MIN;

  for (let i = 0; i < dia.pontos.length; i++) {
    const cur  = dia.pontos[i];
    const prev = dia.pontos[i - 1];

    const travel = i > 0 ? minutesBetween(prev, cur) : 0;
    clock += travel;

    if (typeof cur.startAtMin === 'number') {
      const desired = DAY_START_MIN + Math.max(0, Math.round(cur.startAtMin / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);
      if (desired > clock) clock = desired;
    }

    const def = cur.tipo === 'base'
      ? (String(cur.id||'').startsWith('base-end-') ? BASE_END_MIN : BASE_START_MIN)
      : POI_CARD_MIN;

    const d = Math.max(RESIZE_STEP_MIN, Math.round((cur.tempo ?? def) / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);

    const start = clock;
    const end   = Math.min(DAY_END_MIN, start + d);

    items.push({ ...cur, start, end, travelBefore: travel, kmBefore: prev ? kmBetween(prev, cur) : 0 });

    clock = end;
  }

  return pinEndBaseToMidnight(items);
}

/** Pina a base final até 00:00 e permite esticar para cima sem sobrepor anteriores */
function pinEndBaseToMidnight(scheduled) {
  if (!scheduled.length) return scheduled;
  let lastBaseIdx = -1;
  for (let i = scheduled.length - 1; i >= 0; i--) {
    if (scheduled[i].tipo === 'base') { lastBaseIdx = i; break; }
  }
  if (lastBaseIdx < 0) return scheduled;

  const prev = scheduled[lastBaseIdx - 1];
  const b = { ...scheduled[lastBaseIdx] };
  const desiredDur = Math.max(RESIZE_STEP_MIN, Math.round((b.tempo ?? BASE_END_MIN) / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);

  let start = DAY_END_MIN - desiredDur; // colado a 00:00
  if (prev) start = Math.max(start, prev.end); // sem sobrepor

  b.start = start;
  b.end   = DAY_END_MIN;
  b.id    = b.id?.startsWith('base-end-') ? b.id : `base-end-${(b.data || '')}`;

  const out = [...scheduled];
  out[lastBaseIdx] = b;
  return out;
}

function minutesBetween(prev, next) {
  try {
    if (!prev || !next) return 0;
    if (!isValidCoord(prev.coordinates) || !isValidCoord(next.coordinates)) return 0;
    if (sameCoords(prev, next)) return 0;
    const key = `${prev.coordinates[0]},${prev.coordinates[1]}|${next.coordinates[0]},${next.coordinates[1]}`;
    const idx = (window || {}).TT_ROUTE_DURATIONS || {};
    const v = idx[key];
    if (typeof v === 'number' && v >= 0) return v;
  } catch {}
  return Math.max(5, etaFromKm(haversineMeters(prev.coordinates, next.coordinates)/1000));
}
function kmBetween(prev, next) {
  try { return Math.round((haversineMeters(prev.coordinates, next.coordinates)/1000) * 10) / 10; }
  catch { return 0; }
}
function formatHM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m`;
}

/* ===================== DnD helpers ===================== */
const DRAG_POI  = 'TR_POI';
const DRAG_BASE = 'TR_BASE';
function makeDragData(type, p, fromDay, index) {
  return JSON.stringify({ type, p, fromDay, index });
}
function readDragData(e) {
  try { return JSON.parse(e.dataTransfer.getData(DRAG_POI) || e.dataTransfer.getData(DRAG_BASE)); }
  catch { return null; }
}

/* ===================== UI helpers ===================== */
function ColumnHeader({ dia, index }) {
  const v = ((window || {}).TT_VIAGENS || [])[index];
  const totalKm  = v ? (v.total_km ?? 0) : 0;
  const totalMin = v ? (v.total_min ?? 0) : 0;
  const color = colorForDay(index);

  return (
    <div className="rounded-t-lg text-white text-xs font-semibold"
         style={{ background: color, padding: '6px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>{new Date(dia.data).toLocaleDateString('pt-BR', {
          weekday: 'short', day: '2-digit', month: '2-digit'
        })}</div>
        <div style={{ opacity: 0.95 }}>
          <span title="Distância do dia" style={{ marginRight: 8 }}>📏 {totalKm} km</span>
          <span title="Tempo estimado">⏱ {formatHM(totalMin)}</span>
        </div>
      </div>
    </div>
  );
}

function TimeGrid() {
  const rows = [];
  const cap = DAY_END_MIN - DAY_START_MIN;
  for (let i = 0; i <= cap; i += 30) {
    const top = i / MINUTES_PER_PIXEL;
    const labelMin = DAY_START_MIN + i;
    const h = Math.floor(labelMin / 60);
    const m = labelMin % 60;
    const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const isLast = i === cap;

    rows.push(
      <div key={i}
           style={{ position: 'absolute', top, left: 0, right: 0, height: 0, borderTop: '1px dashed #e5e7eb' }}>
        <div
          style={{
            position: 'absolute',
            left: 4,
            top: isLast ? -18 : -8,
            fontSize: 10, color: '#9ca3af', background: '#fff', padding: '0 4px'
          }}
        >
          {label}
        </div>
      </div>
    );
  }
  return <>{rows}</>;
}

function Card({
  dataIndex, itemIndex, item, onResize, onRemove, allowDragBase, dayColor,
}) {
  const isBase  = item.tipo === 'base';
  const height  = Math.max(24, (item.end - item.start) / MINUTES_PER_PIXEL);
  const top     = (item.start - DAY_START_MIN) / MINUTES_PER_PIXEL;

  const innerTop  = 12;
  const headerH   = 22;
  const isCompact = height - innerTop < 78;

  const draggingRef = React.useRef(false);
  const startYRef = React.useRef(0);
  const startHRef = React.useRef(height);

  function onMouseDown(e) {
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHRef.current = height;
    e.stopPropagation();
    e.preventDefault();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  function onMove(e) {
    if (!draggingRef.current) return;
    const deltaY = e.clientY - startYRef.current;
    const newH = Math.max(24, startHRef.current + deltaY);
    const minutes = Math.round(newH * MINUTES_PER_PIXEL / RESIZE_STEP_MIN) * RESIZE_STEP_MIN;
    onResize(minutes);
  }
  function onUp() {
    draggingRef.current = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }

  const draggable = isBase ? allowDragBase : true;

  const bgTint = rgba(dayColor, 0.10);
  const border = dayColor;
  const labelPrefix =
    isBase
      ? (item.id?.startsWith('base-start-') ? '🏠 Início — '
         : item.id?.startsWith('base-end-') ? '🏁 Término — ' : '🏠 ')
      : '📍 ';

  return (
    <div style={{ position: 'absolute', left: 6, right: 6, top, height }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: innerTop, pointerEvents: 'none' }} />

      <div
        className="rounded-lg shadow"
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) return;
          const type = isBase ? DRAG_BASE : DRAG_POI;
          const p0 = {
            id: item.id, uid: item.uid, label: item.label, tipo: item.tipo,
            tempo: item.tempo, fixo: item.fixo,
            startAtMin: (typeof item.startAtMin === 'number')
              ? item.startAtMin
              : Math.max(0, item.start - DAY_START_MIN),
            coordinates: item.coordinates
          };
          e.dataTransfer.setData(type, makeDragData(type, p0, dataIndex, itemIndex));
          e.dataTransfer.effectAllowed = 'move';
        }}
        style={{
          position: 'absolute',
          left: 0, right: 0, top: innerTop, bottom: 0,
          background: bgTint,
          border: `1px solid ${border}`,
          padding: 0, cursor: draggable ? 'grab' : 'default', userSelect: 'none',
          boxShadow: `0 2px 8px ${rgba(dayColor, .2)}`
        }}
        title={
          isBase
            ? (item.id?.startsWith('base-start-') ? 'Base (início do dia)'
              : item.id?.startsWith('base-end-') ? 'Base (término do dia)' : 'Base')
            : 'Ponto de interesse'
        }
      >
        <div style={{
          background: '#fff', height: headerH,
          borderTopLeftRadius: 7, borderTopRightRadius: 7,
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px'
        }}>
          <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>
            {labelPrefix}{item.label}
          </span>
          {!isBase && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              style={{ border: 'none', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}
              title="Remover do dia"
            >×</button>
          )}
        </div>

        {item.travelBefore > 0 && (
          isCompact ? (
            <div style={{
              position:'absolute', top:headerH+4, left:'50%', transform:'translateX(-50%)',
              background:'#fff', borderRadius:8, padding:'2px 8px', fontSize:11,
              boxShadow:'0 1px 2px rgba(0,0,0,.08)'
            }}>
              → {item.travelBefore} min • ≈ {item.kmBefore} km
            </div>
          ) : (
            <>
              <div style={{
                position:'absolute', top:headerH+4, left:'50%', transform:'translateX(-50%)',
                background:'#fff', borderRadius:8, padding:'2px 8px', fontSize:11,
                boxShadow:'0 1px 2px rgba(0,0,0,.08)'
              }}>
                → {item.travelBefore} min de deslocamento
              </div>
              <div style={{
                position:'absolute', top:headerH+26, left:'50%', transform:'translateX(-50%)',
                background:'#fff', borderRadius:8, padding:'1px 8px', fontSize:11,
                boxShadow:'0 1px 2px rgba(0,0,0,.08)'
              }}>
                ≈ {item.kmBefore} km
              </div>
            </>
          )
        )}

        <div style={{
          position: 'absolute', right: 8, bottom: 6, fontSize: 11, color: '#111827',
          background: '#fff', padding: '2px 6px', borderRadius: 6
        }}>
          {Math.max(RESIZE_STEP_MIN, Math.round(((item.end - item.start)) / RESIZE_STEP_MIN) * RESIZE_STEP_MIN)} min
        </div>

        <div
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: -3, height: 6, cursor: 'ns-resize',
            background: rgba(dayColor, .25), borderBottomLeftRadius: 8, borderBottomRightRadius: 8
          }}
          title="Arraste para ajustar o tempo (5 em 5 min)"
        />
      </div>
    </div>
  );
}

/* ===================== Board principal ===================== */
export function TravelPlannerBoard({
  roteiro,
  pontosDisponiveis,
  baseCatalog,
  onUpdateRoteiro,
  onUpdateDisponiveis,
  onRebuildRoutes,
}) {
  const [local, setLocal] = React.useState(() => syncSleepBases(roteiro));
  const timelineRefs = React.useRef([]);

  const dayColors = React.useMemo(
    () => local.map((_, i) => colorForDay(i)),
    [JSON.stringify(local)]
  );

  // 🔧 Importante: renders iniciais NÃO pedem recompute
  React.useEffect(() => {
    notifyMapFull(local, dayColors, null);
  }, [JSON.stringify(local), JSON.stringify(dayColors)]);

  React.useLayoutEffect(() => {
    const colors = local.map((_, i) => colorForDay(i));
    notifyMapFull(local, colors, null);
    requestAnimationFrame(() => window.dispatchEvent(new Event('tt:please-redraw')));
  }, []);

  React.useEffect(() => {
    const norm = syncSleepBases(roteiro);
    setLocal(norm);
    setTimeout(() => notifyMapFull(norm, norm.map((_, i) => colorForDay(i)), null), 0);
  }, [JSON.stringify(roteiro)]);

  function commit(next) {
    const norm = syncSleepBases(next);
    setLocal(norm);
    onUpdateRoteiro(norm);
    // Agora sim: usuário interagiu ⇒ recompute
    notifyMapFull(norm, norm.map((_, i) => colorForDay(i)), onRebuildRoutes);
  }

  /* ---------- Soltar em posição Y = define horário (startAtMin) ---------- */
  function dropOnDay(dayIndex, e) {
    e.preventDefault();
    const data = readDragData(e);
    if (!data) return;

    const ref = timelineRefs.current[dayIndex];
    const rect = ref?.getBoundingClientRect();
    const y = rect ? e.clientY - (rect.top || 0) : 9999;

    const next = clone(local);

    const removeIfFromBoard = () => {
      if (data.fromDay !== null && data.index !== null) {
        const removed = next[data.fromDay].pontos.splice(data.index, 1)[0];
        return removed;
      }
      return null;
    };

    const desiredStartMin = Math.max(0, Math.round((y * MINUTES_PER_PIXEL) / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);

    if (data.type === DRAG_POI) {
      const removed = removeIfFromBoard();
      const p = (removed || data.p);

      const sched = scheduleDay(next[dayIndex]);
      let idx = sched.findIndex(s => (s.start - DAY_START_MIN) > desiredStartMin);
      if (idx < 0) idx = next[dayIndex].pontos.length;
      idx = Math.max(1, idx);

      next[dayIndex].pontos.splice(idx, 0, {
        ...p, tipo: 'interesse',
        tempo: p.tempo ?? POI_CARD_MIN,
        startAtMin: desiredStartMin
      });

      if (data.fromDay === null && typeof onUpdateDisponiveis === 'function' && p.id != null) {
        const rest = (pontosDisponiveis || []).filter(x => x.id !== p.id);
        onUpdateDisponiveis(rest);
      }
      commit(next);
      return;
    }

    if (data.type === DRAG_BASE) {
      const removed = removeIfFromBoard();
      const base = (removed || data.p);

      // topo = início do dia (60 min) — REMOVENDO QUALQUER base-start existente
      if (y <= 40) {
        next[dayIndex].pontos = next[dayIndex].pontos.filter(
          (p) => !String(p?.id||'').startsWith('base-start-')
        );
        next[dayIndex].pontos.unshift({
          ...base, tipo: 'base', fixo: true, id: `base-start-${next[dayIndex].data}`,
          tempo: Math.max(RESIZE_STEP_MIN, Math.round((base.tempo ?? BASE_START_MIN)/RESIZE_STEP_MIN)*RESIZE_STEP_MIN),
          startAtMin: 0
        });

        // sincroniza término do dia anterior com MESMA base
        if (dayIndex > 0) {
          const prev = next[dayIndex - 1];
          prev.pontos = prev.pontos.filter((p) => !String(p?.id||'').startsWith('base-end-'));
          prev.pontos.push({
            ...base, tipo: 'base', fixo: false, id: `base-end-${prev.data}`,
            tempo: BASE_END_MIN,
            startAtMin: Math.max(0, DAY_END_MIN - DAY_START_MIN - BASE_END_MIN)
          });
        }
        commit(next);
        return;
      }

      // rodapé = término do dia (120 min, colado à meia-noite) — REMOVENDO QUALQUER base-end existente
      const capPx = ((DAY_END_MIN - DAY_START_MIN) / MINUTES_PER_PIXEL);
      if (y >= (capPx - 70)) {
        next[dayIndex].pontos = next[dayIndex].pontos.filter(
          (p) => !String(p?.id||'').startsWith('base-end-')
        );
        next[dayIndex].pontos.push({
          ...base, tipo: 'base', fixo: false, id: `base-end-${next[dayIndex].data}`,
          tempo: BASE_END_MIN,
          startAtMin: Math.max(0, DAY_END_MIN - DAY_START_MIN - BASE_END_MIN)
        });

        // sincroniza início do próximo dia com MESMA base
        if (dayIndex < next.length - 1) {
          next[dayIndex + 1].pontos = next[dayIndex + 1].pontos.filter(
            (p) => !String(p?.id||'').startsWith('base-start-')
          );
          next[dayIndex + 1].pontos.unshift({
            ...base, tipo: 'base', fixo: true, id: `base-start-${next[dayIndex + 1].data}`,
            tempo: BASE_START_MIN, startAtMin: 0
          });
        }
        commit(next);
        return;
      }

      // meio = base intermediária (60 min por padrão)
      const sched = scheduleDay(next[dayIndex]);
      let idx = sched.findIndex(s => (s.start - DAY_START_MIN) > desiredStartMin);
      if (idx < 0) idx = next[dayIndex].pontos.length;
      idx = Math.max(1, idx);

      next[dayIndex].pontos.splice(idx, 0, {
        ...base, tipo: 'base', fixo: false, id: base.id || `base-mid-${Date.now()}`,
        tempo: BASE_START_MIN, startAtMin: desiredStartMin
      });
      commit(next);
      return;
    }
  }

  function allowDrop(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

  function removeItem(dayIndex, itemIndex) {
    const next = clone(local);
    next[dayIndex].pontos.splice(itemIndex, 1);
    commit(next);
  }

  function resizeItem(dayIndex, itemIndex, minutes) {
    const next = clone(local);
    const it = next[dayIndex].pontos[itemIndex];
    if (!it) return;

    if (it.tipo === 'base' && (it.id?.startsWith('base-end-'))) {
      const dur = Math.max(RESIZE_STEP_MIN, Math.round(minutes / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);
      it.tempo = dur;
      it.startAtMin = Math.max(0, (DAY_END_MIN - DAY_START_MIN) - dur);
    } else {
      it.tempo = Math.max(RESIZE_STEP_MIN, Math.round(minutes / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);
    }
    commit(next);
  }

  /* ---------- Sidebar (fixa) ---------- */
  function BaseChip({ p }) {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_BASE, makeDragData(DRAG_BASE, { ...p, tipo: 'base' }, null, null));
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        className="px-2 py-1 border rounded text-xs bg-white hover:bg-gray-50 cursor-grab"
        title="Arraste para o dia (topo=início • rodapé=término • meio=base intermediária)."
      >
        🏠 {p.label}
      </div>
    );
  }
  function PoiChip({ p }) {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_POI, makeDragData(DRAG_POI, { ...p, tipo: 'interesse' }, null, null));
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        className="px-2 py-1 border rounded text-xs bg-white hover:bg-gray-50 cursor-grab"
        title="Arraste para o dia e solte na faixa de horário desejada."
      >
        📍 {p.label}
      </div>
    );
  }

  const cols = Math.min(local.length || 1, 7); // 7 por linha
  const capHeightPx = ((DAY_END_MIN - DAY_START_MIN) / MINUTES_PER_PIXEL);

  return (
    <div className="w-full flex gap-4">
      {/* Sidebar fixa */}
      <aside className="w-56 shrink-0 self-start sticky top-2 h-[calc(100vh-16px)] overflow-auto border rounded-lg bg-white p-3">
        {Array.isArray(baseCatalog) && baseCatalog.length > 0 && (
          <>
            <div className="text-xs text-gray-600 mb-1 font-semibold">Bases</div>
            <div className="flex flex-col gap-2 mb-3">
              {baseCatalog.map((b, i) => <BaseChip key={b.id || `${b.label}-${i}`} p={b} />)}
            </div>
          </>
        )}
        {Array.isArray(pontosDisponiveis) && pontosDisponiveis.length > 0 && (
          <>
            <div className="text-xs text-gray-600 mb-1 font-semibold">Pontos de interesse</div>
            <div className="flex flex-col gap-2">
              {pontosDisponiveis.map((p, i) => <PoiChip key={p.id || `${p.label}-${i}`} p={p} />)}
            </div>
          </>
        )}
      </aside>

      {/* Board */}
      <section className="flex-1 overflow-x-auto">
        <div className="grid gap-3 w-max" style={{ gridTemplateColumns: `repeat(${cols}, minmax(280px, 1fr))` }}>
          {local.map((dia, dayIndex) => {
            const scheduled = scheduleDay(dia);
            const dayColor  = dayColors[dayIndex];

            return (
              <div key={dia.data} className="rounded-lg border border-gray-300 bg-white overflow-hidden flex flex-col">
                <ColumnHeader dia={dia} index={dayIndex} />

                <div
                  ref={(el) => (timelineRefs.current[dayIndex] = el)}
                  className="relative"
                  style={{ height: `${capHeightPx + BOTTOM_PADDING_PX}px` }}
                  onDrop={(e) => dropOnDay(dayIndex, e)}
                  onDragOver={allowDrop}
                >
                  {TimeGrid()}

                  {/* zonas visuais top/bottom (dicas) */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, pointerEvents: 'none' }} />

                  {scheduled.map((s, i) => (
                    <Card
                      key={`${dia.data}-${i}-${s.id ?? s.uid ?? s.label}`}
                      dataIndex={dayIndex}
                      itemIndex={i}
                      item={s}
                      onResize={(m) => resizeItem(dayIndex, i, m)}
                      onRemove={() => removeItem(dayIndex, i)}
                      allowDragBase
                      dayColor={dayColor}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-gray-600 mt-3 leading-relaxed">
          <b>Dica:</b> arraste os cards para o <i>horário exato</i>. Bases: <b>topo</b> = início do dia (60 min) • <b>rodapé</b> = término (120 min, até 00:00) • <b>meio</b> = base intermediária.
        </div>
      </section>
    </div>
  );
}

export default TravelPlannerBoard;
