/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
/** @jsxRuntime classic */
/* eslint-disable */
/* @ts-nocheck */

const _PD = (window as any).PluginDependencies || {};


/* ===================== Config Board (timeline) ===================== */
const MINUTES_PER_PIXEL = 1;            // 1 px = 1 min
const DAY_START_MIN     = 8 * 60 + 30;  // 08:30
const DAY_END_MIN       = 19 * 60 + 0;  // ✅ 19:00 (ajustado)
const DAY_CAP_MIN       = DAY_END_MIN - DAY_START_MIN; // altura da coluna

/* Defaults visuais/duração */
const BASE_CARD_MIN   = 120; // ✅ base = 2h (e redimensionável)
const POI_CARD_MIN    = 60;  // POI = 1h
const RESIZE_STEP_MIN = 5;

/* ===================== Tipos ===================== */
type Ponto = {
  id?: string;
  uid?: string;
  label: string;
  tipo: 'base' | 'interesse';
  tempo?: number;        // duração do card (base e poi)
  fixo?: boolean;        // base de início do dia
  coordinates: [number, number];
};
type Dia = { data: string; pontos: Ponto[] };

type Props = {
  roteiro: Dia[];
  pontosDisponiveis: Ponto[];
  baseCatalog?: Ponto[];
  onUpdateRoteiro: (novo: Dia[]) => void;
  onUpdateDisponiveis?: (arr: Ponto[]) => void;
  onRebuildRoutes?: (novo: Dia[]) => void;
};

/* ===================== Paleta/cores por dia ===================== */
function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
const PALETTE_15 = Array.from({ length: 15 }, (_, i) => hslToHex((i * 360 / 15 + 10) % 360, 72, 52));
const colorForDay = (i: number) => PALETTE_15[i % PALETTE_15.length];

/* ===================== Distância/ETA ===================== */
function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000, toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const s = Math.sin(dLat/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}
const CRUISING_KMH_DEFAULT = 80;
const etaFromKm = (km: number, kmh = CRUISING_KMH_DEFAULT) =>
  Math.max(5, Math.round((km / Math.max(10, kmh)) * 60));
function etaFromRouteOrFallback(a: [number,number], b: [number,number]) {
  const key = `${a[0]},${a[1]}|${b[0]},${b[1]}`;
  const durations = (window as any).TT_ROUTE_DURATIONS as Record<string, number> | undefined;
  if (durations && typeof durations[key] === 'number') return Math.max(1, Math.round(durations[key]!));
  const km = haversineMeters(a, b) / 1000;
  return etaFromKm(km);
}

/* ===================== Pins (tema + atualização) ===================== */
const pinService = _PD.pinService;
(function ensurePinTheme() {
  (window as any).TT_PIN_ICON_THEME = {
    base: { glyph: 'house',  color: '#0ea5e9', halo: '#ffffff' },
    poi:  { glyph: 'marker', color: '#8b5cf6', halo: '#ffffff' }
  };
  try {
    pinService?.configure?.({
      defaultIcons: {
        base: (window as any).TT_PIN_ICON_THEME.base,
        poi:  (window as any).TT_PIN_ICON_THEME.poi,
      }
    });
  } catch {}
})();

/* ===================== Exposição para o host (rotas + pins) ===================== */
function buildPins(board: Dia[], dayColors: string[]) {
  // Agrupa por coordenada para detectar locais usados em múltiplos dias
  const keyFor = (c: [number,number]) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
  const bucket: Record<string, Set<number>> = {}; // coord -> set de dayIndex

  board.forEach((d, i) => {
    d.pontos.forEach(p => {
      const k = keyFor(p.coordinates);
      if (!bucket[k]) bucket[k] = new Set<number>();
      bucket[k].add(i);
    });
  });

  const features: any[] = [];
  board.forEach((d, i) => {
    const dayColor = dayColors[i];
    d.pontos.forEach((p) => {
      const k = keyFor(p.coordinates);
      const idxs = Array.from(bucket[k] || []);
      const colorsHex = idxs.map(ii => dayColors[ii]); // multi-cores para o mesmo ponto em dias diferentes
      features.push({
        type: 'Feature',
        id: `tt::${d.data}::${p.id ?? p.uid ?? p.label}`,
        geometry: { type: 'Point', coordinates: p.coordinates },
        properties: {
          kind: p.tipo === 'base' ? 'base' : 'poi',
          label: p.label,
          day: d.data,
          colorHex: dayColor,
          colorsHex: Array.from(new Set(colorsHex)),
          isMultiDay: colorsHex.length > 1,
        }
      });
    });
  });

  try {
    (window as any).TT_PIN_ICON_FACTORY = (feat: any) => {
      const theme = (window as any).TT_PIN_ICON_THEME || {};
      const def = feat?.properties?.kind === 'base' ? theme.base : theme.poi;
      return { ...def, colors: feat?.properties?.colorsHex || [feat?.properties?.colorHex] };
    };
    pinService?.clear?.();
    pinService?.updateAllPins?.(features);
  } catch (e) {
    console.warn('pinService/updateAllPins falhou:', e);
  }
}

function notifyMapFull(board: Dia[], dayColors: string[], onRebuildRoutes?: (b: Dia[]) => void) {
  // Rotas com cor por dia (igual ao cabeçalho) + HALO para contraste
  const viagens = board.map((d, i) => {
    const color = dayColors[i];
    const legs: any[] = [];
    let totalKm = 0, totalMin = 0;

    for (let k = 0; k < d.pontos.length - 1; k++) {
      const A = d.pontos[k], B = d.pontos[k + 1];
      const km = Math.max(0, Math.round((haversineMeters(A.coordinates, B.coordinates) / 1000) * 10) / 10);
      const eta = etaFromRouteOrFallback(A.coordinates, B.coordinates);
      totalKm += km; totalMin += eta;
      legs.push({
        from: A.label, to: B.label,
        a: A.coordinates, b: B.coordinates,
        distance_km: km, eta_min: eta,
        style: {
          halo:  { color, weight: 10, opacity: 0.18, lineCap: 'round' }, // borda na mesma cor (bem transparente)
          main:  { color, weight: 5,  opacity: 0.70, lineCap: 'round' }, // linha principal (nítida e condizente)
        }
      });
    }
    return { day: d.data, color, legs, total_km: Math.round(totalKm), total_min: Math.round(totalMin) };
  });

  (window as any).TT_VIAGENS = viagens;
  const dayColorMap: Record<string,string> = {};
  board.forEach((d, i) => dayColorMap[d.data] = dayColors[i]);
  (window as any).TT_DAY_COLORS = dayColorMap;
  (window as any).TT_ROUTE_COLOR_OF_DAY = (iso: string) => dayColorMap[iso] || '#3388ff';

  const flat = [];
  for (const v of viagens) for (const l of v.legs) {
    // o host pode desenhar 2 camadas por leg (halo + main)
    flat.push({ day: v.day, coords: [l.a, l.b], style: l.style });
  }
  (window as any).TT_ROUTES = flat;

  // Atualiza mapa (linhas + pins)
  try { (window as any).TT_DRAW_ROUTES?.(flat); } catch {}
  try { buildPins(board, dayColors); } catch {}

  try { onRebuildRoutes?.(board); } catch {}
}

/* ===================== Utils/normalização ===================== */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function sameCoords(a?: Ponto, b?: Ponto) {
  return !!a && !!b &&
    a.coordinates?.[0] === b.coordinates?.[0] &&
    a.coordinates?.[1] === b.coordinates?.[1];
}

function ensureStartIsBase(d: Dia) {
  if (!d.pontos.length) return;
  if (d.pontos[0]?.tipo !== 'base') {
    const firstBase = d.pontos.find(p => p.tipo === 'base');
    if (firstBase) {
      d.pontos.unshift({ ...firstBase, fixo: true, id: `base-start-${d.data}`, tempo: firstBase.tempo ?? BASE_CARD_MIN });
    }
  } else {
    d.pontos[0] = { ...d.pontos[0], fixo: true, id: `base-start-${d.data}`, tempo: d.pontos[0].tempo ?? BASE_CARD_MIN };
  }
}

function ensureEndIsBase(d: Dia) {
  if (!d.pontos.length) return;
  const last = d.pontos[d.pontos.length - 1];
  if (last?.tipo !== 'base') {
    const lastBase = [...d.pontos].reverse().find(p => p.tipo === 'base') || d.pontos[0];
    if (lastBase) d.pontos.push({ ...lastBase, fixo: false, id: `base-end-${d.data}`, tempo: lastBase.tempo ?? BASE_CARD_MIN });
  } else {
    d.pontos[d.pontos.length - 1] = { ...last, fixo: false, id: `base-end-${d.data}`, tempo: last.tempo ?? BASE_CARD_MIN };
  }
  // dedupe no fim do dia
  if (d.pontos.length >= 2) {
    const a = d.pontos[d.pontos.length - 1];
    const b = d.pontos[d.pontos.length - 2];
    if (a?.tipo === 'base' && b?.tipo === 'base' && sameCoords(a, b)) {
      d.pontos.splice(d.pontos.length - 2, 1);
    }
  }
}

/** Regra do sono: fim do dia i = início do dia i+1 (fixo) */
function syncSleepBases(board: Dia[]): Dia[] {
  const novo = clone(board);

  for (const d of novo) {
    ensureStartIsBase(d);
    ensureEndIsBase(d);
  }

  for (let i = 0; i < novo.length - 1; i++) {
    const endBase = [...novo[i].pontos].reverse().find(p => p.tipo === 'base');
    if (!endBase) continue;

    const first = novo[i + 1].pontos[0];
    if (!first || first.tipo !== 'base' || !sameCoords(first, endBase)) {
      if (first?.tipo === 'base') novo[i + 1].pontos.shift();
      novo[i + 1].pontos.unshift({
        ...endBase, fixo: true, id: `base-start-${novo[i + 1].data}`, tempo: endBase.tempo ?? BASE_CARD_MIN
      });
    } else {
      novo[i + 1].pontos[0] = {
        ...first, fixo: true, id: `base-start-${novo[i + 1].data}`, tempo: first.tempo ?? BASE_CARD_MIN
      };
    }
    ensureEndIsBase(novo[i + 1]);
  }

  for (const d of novo) ensureEndIsBase(d);
  return novo;
}

function minutesBetween(prev?: Ponto, next?: Ponto): number {
  try {
    if (!prev || !next) return 0;
    const key = `${prev.coordinates[0]},${prev.coordinates[1]}|${next.coordinates[0]},${next.coordinates[1]}`;
    const idx = (window as any).TT_ROUTE_DURATIONS || {};
    const v = idx[key];
    if (typeof v === 'number' && v >= 0) return v;
  } catch {}
  return Math.max(5, etaFromKm(haversineMeters(prev.coordinates, next.coordinates)/1000));
}

function dur(p?: Ponto) {
  if (!p) return 0;
  if (p.tipo === 'base') return Math.max(BASE_CARD_MIN, Math.round((p.tempo ?? BASE_CARD_MIN) / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);
  return Math.max(RESIZE_STEP_MIN, Math.round(((p.tempo ?? POI_CARD_MIN) as number) / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);
}

/** Agenda linear: empilha start/end considerando deslocamento.
 *  ✅ Se o último item for o "Término — Base", ele é ancorado para ENCERRAR às 19:00.
 */
function scheduleDay(dia: Dia) {
  const items: Array<Ponto & { start: number; end: number; travelBefore: number }> = [];
  let clock = DAY_START_MIN;

  for (let i = 0; i < dia.pontos.length; i++) {
    const cur = dia.pontos[i];
    const prev = dia.pontos[i - 1];

    const travel = i > 0 ? minutesBetween(prev, cur) : 0;
    clock += travel;

    const isEndBase = (cur.id || '').startsWith('base-end-');
    const d = dur(cur);

    let start: number, end: number;

    if (isEndBase) {
      // Ancorar para terminar exatamente às 19:00
      end = DAY_END_MIN;
      start = Math.max(clock, end - d);
      // Se por algum motivo o fluxo do dia estourar, mantém coerência
      if (start > end) start = Math.max(DAY_START_MIN, end - d);
    } else {
      start = clock;
      end = Math.min(DAY_END_MIN, clock + d);
    }

    items.push({ ...cur, start, end, travelBefore: travel });
    clock = end;
  }
  return items;
}

function formatHM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m`;
}

/* ===================== DnD helpers ===================== */
const DRAG_POI  = 'TR_POI';
const DRAG_BASE = 'TR_BASE';

function makeDragData(type: string, p: Ponto, fromDay: number | null, index: number | null) {
  return JSON.stringify({ type, p, fromDay, index });
}
function readDragData(e: React.DragEvent<HTMLDivElement>) {
  try { return JSON.parse(e.dataTransfer.getData(DRAG_POI) || e.dataTransfer.getData(DRAG_BASE)); }
  catch { return null; }
}

/* ===================== UI helpers ===================== */
function ColumnHeader({ dia, index }: { dia: Dia; index: number }) {
  const v = ((window as any).TT_VIAGENS || [])[index];
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
  const rows: React.ReactNode[] = [];
  for (let i = 0; i <= DAY_CAP_MIN; i += 30) {
    const top = i / MINUTES_PER_PIXEL;
    const labelMin = DAY_START_MIN + i;
    const h = Math.floor(labelMin / 60);
    const m = labelMin % 60;
    const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    rows.push(
      <div key={i}
           style={{ position: 'absolute', top, left: 0, right: 0, height: 0, borderTop: '1px dashed #e5e7eb' }}>
        <div style={{ position: 'absolute', left: 4, top: -8, fontSize: 10, color: '#9ca3af', background: '#fff', padding: '0 4px' }}>{label}</div>
      </div>
    );
  }
  return <>{rows}</>;
}

function Card({
  dataIndex, itemIndex, item, onResize, onRemove, allowDragBase,
}: {
  dataIndex: number;
  itemIndex: number;
  item: Ponto & { start: number; end: number; travelBefore: number };
  onResize: (minutes: number) => void;
  onRemove: () => void;
  allowDragBase: boolean;
}) {
  const isBase = item.tipo === 'base';
  const height = Math.max(24, (item.end - item.start) / MINUTES_PER_PIXEL);
  const top = (item.start - DAY_START_MIN) / MINUTES_PER_PIXEL;

  // resize drag (BASE e POI)
  const draggingRef = React.useRef(false);
  const startYRef = React.useRef(0);
  const startHRef = React.useRef(height);

  function onMouseDown(e: React.MouseEvent) {
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHRef.current = height;
    e.stopPropagation();
    e.preventDefault();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  function onMove(e: MouseEvent) {
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

  return (
    <div
      className="rounded-lg shadow"
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        const type = isBase ? DRAG_BASE : DRAG_POI;
        e.dataTransfer.setData(type, makeDragData(type, item, dataIndex, itemIndex));
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        position: 'absolute',
        left: 6, right: 6, top, height,
        background: isBase ? (item.fixo ? '#bae6fd' : '#7dd3fc') : '#f3f4f6',
        border: isBase ? '1px solid #0284c7' : '1px solid #d1d5db',
        padding: 8, cursor: draggable ? 'grab' : 'default', userSelect: 'none',
      }}
      title={isBase ? (item.fixo ? 'Base (início fixo)' : 'Base') : 'Ponto de interesse'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>
          {isBase
            ? (item.id?.startsWith('base-start-') ? `🏠 Início — ${item.label}`
               : item.id?.startsWith('base-end-') ? `🏁 Término — ${item.label}`
               : `🏠 ${item.label}`)
            : `📍 ${item.label}`}
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
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>→ {item.travelBefore} min de deslocamento</div>
      )}

      <div style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 11, color: '#374151' }}>
        {Math.max(RESIZE_STEP_MIN, item.end - item.start)} min
      </div>

      {/* ✅ alça de resize para TODOS os cards (base e poi) */}
      <div
        onMouseDown={onMouseDown}
        style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 6, cursor: 'ns-resize',
                 background: 'rgba(99,102,241,.15)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}
        title="Arraste para ajustar o tempo (5 em 5 min)"
      />
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
}: Props) {
  const [local, setLocal] = React.useState<Dia[]>(() => syncSleepBases(roteiro));
  const timelineRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const dayColors = React.useMemo(() =>
    local.map((_, i) => colorForDay(i)), [JSON.stringify(local)]
  );

  // redesenha rotas/pins sempre que o board local muda
  React.useEffect(() => {
    notifyMapFull(local, dayColors, onRebuildRoutes);
  }, [JSON.stringify(local), JSON.stringify(dayColors)]);

  // quando o pai trocar, normaliza e redesenha
  React.useEffect(() => {
    const norm = syncSleepBases(roteiro);
    setLocal(norm);
    setTimeout(() => notifyMapFull(norm, norm.map((_, i) => colorForDay(i)), onRebuildRoutes), 0);
  }, [JSON.stringify(roteiro)]);

  function commit(next: Dia[]) {
    const norm = syncSleepBases(next);
    setLocal(norm);
    onUpdateRoteiro(norm);
    notifyMapFull(norm, norm.map((_, i) => colorForDay(i)), onRebuildRoutes);
  }

  /* ---------- Soltar em coluna com zonas: topo / meio / rodapé ---------- */
  function dropOnDay(dayIndex: number, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const data = readDragData(e);
    if (!data) return;

    const ref = timelineRefs.current[dayIndex];
    const rect = ref?.getBoundingClientRect();
    const y = rect ? e.clientY - (rect.top || 0) : 9999;
    const height = rect?.height ?? (DAY_CAP_MIN / MINUTES_PER_PIXEL);
    const TOP_ZONE = 40;
    const BOTTOM_ZONE = 70;

    const next = clone(local);

    // remove item se veio do board
    const removeIfFromBoard = () => {
      if (data.fromDay !== null && data.index !== null) {
        next[data.fromDay].pontos.splice(data.index, 1);
      }
    };

    // inserir em posição aproximada da agenda
    const insertAtPosition = (p: Ponto) => {
      const sched = scheduleDay(next[dayIndex]);
      let idx = sched.findIndex(s => ((s.start - DAY_START_MIN) / MINUTES_PER_PIXEL) > y);
      if (idx < 0) idx = next[dayIndex].pontos.length; // fim
      idx = Math.max(1, idx); // nunca antes da base fixa
      next[dayIndex].pontos.splice(idx, 0, p);
    };

    if (data.type === DRAG_POI) {
      const p = data.p as Ponto;
      removeIfFromBoard();

      // inserir antes da base final (rodapé mantém base no final)
      if (y > height - BOTTOM_ZONE) {
        const last = next[dayIndex].pontos[next[dayIndex].pontos.length - 1];
        const insertAt = (last?.tipo === 'base')
          ? Math.max(1, next[dayIndex].pontos.length - 1)
          : next[dayIndex].pontos.length;
        next[dayIndex].pontos.splice(insertAt, 0, { ...p, tempo: p.tempo ?? POI_CARD_MIN });
      } else if (y < TOP_ZONE) {
        next[dayIndex].pontos.splice(1, 0, { ...p, tempo: p.tempo ?? POI_CARD_MIN });
      } else {
        insertAtPosition({ ...p, tempo: p.tempo ?? POI_CARD_MIN });
      }
      // se veio da paleta lateral, remove dos disponíveis
      if (data.fromDay === null && typeof onUpdateDisponiveis === 'function') {
        const rest = (pontosDisponiveis || []).filter(x => x.id !== p.id);
        onUpdateDisponiveis(rest);
      }
      commit(next);
      return;
    }

    if (data.type === DRAG_BASE) {
      const base = data.p as Ponto;
      removeIfFromBoard();

      // TOPO: base de início (fixo) + sincroniza pernoite do dia anterior
      if (y < TOP_ZONE) {
        next[dayIndex].pontos[0] = {
          ...base, tipo: 'base', fixo: true, id: `base-start-${next[dayIndex].data}`, tempo: base.tempo ?? BASE_CARD_MIN
        };
        if (dayIndex > 0) {
          const prev = next[dayIndex - 1];
          prev.pontos[prev.pontos.length - 1] = {
            ...base, tipo: 'base', fixo: false, id: `base-end-${prev.data}`, tempo: base.tempo ?? BASE_CARD_MIN
          };
        }
        commit(next);
        return;
      }

      // RODAPÉ: define pernoite (fim do dia) e sincroniza amanhã
      if (y > height - BOTTOM_ZONE) {
        next[dayIndex].pontos[next[dayIndex].pontos.length - 1] =
          { ...base, tipo: 'base', fixo: false, id: `base-end-${next[dayIndex].data}`, tempo: base.tempo ?? BASE_CARD_MIN };
        if (dayIndex < next.length - 1) {
          next[dayIndex + 1].pontos[0] =
            { ...base, tipo: 'base', fixo: true, id: `base-start-${next[dayIndex + 1].data}`, tempo: base.tempo ?? BASE_CARD_MIN };
        }
        commit(next);
        return;
      }

      // MEIO: base intermediária (ex.: almoço) — 2h padrão
      const mid = { ...base, tipo: 'base', fixo: false, id: base.id || `base-mid-${Date.now()}`, tempo: base.tempo ?? BASE_CARD_MIN };
      insertAtPosition(mid);
      commit(next);
      return;
    }
  }

  function allowDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function removeItem(dayIndex: number, itemIndex: number) {
    const next = clone(local);
    next[dayIndex].pontos.splice(itemIndex, 1);
    commit(next);
  }

  function resizeItem(dayIndex: number, itemIndex: number, minutes: number) {
    const next = clone(local);
    const it = next[dayIndex].pontos[itemIndex];
    if (!it) return;
    it.tempo = Math.max(RESIZE_STEP_MIN, Math.round(minutes / RESIZE_STEP_MIN) * RESIZE_STEP_MIN);
    commit(next);
  }

  /* ---------- Sidebar (Bases + POIs) ---------- */
  function BaseChip({ p }: { p: Ponto }) {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_BASE, makeDragData(DRAG_BASE, { ...p, tipo: 'base' }, null, null));
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        className="px-2 py-1 border rounded text-xs bg-white hover:bg-gray-50 cursor-grab"
        title="Arraste para o dia (topo = início, rodapé = pernoite, meio = base intermediária)"
      >
        🏠 {p.label}
      </div>
    );
  }
  function PoiChip({ p }: { p: Ponto }) {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_POI, makeDragData(DRAG_POI, { ...p, tipo: 'interesse' }, null, null));
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        className="px-2 py-1 border rounded text-xs bg-white hover:bg-gray-50 cursor-grab"
        title="Arraste para o dia (solte em um horário aproximado)"
      >
        📍 {p.label}
      </div>
    );
  }

  return (
    <div className="w-full flex gap-4">
      {/* Sidebar */}
      <aside className="min-w-[260px]">
        {Array.isArray(baseCatalog) && baseCatalog.length > 0 && (
          <>
            <div className="text-xs text-gray-600 mb-1 font-semibold">Bases</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {baseCatalog.map((b, i) => <BaseChip key={b.id || `${b.label}-${i}`} p={b} />)}
            </div>
          </>
        )}
        {Array.isArray(pontosDisponiveis) && pontosDisponiveis.length > 0 && (
          <>
            <div className="text-xs text-gray-600 mb-1 font-semibold">Pontos de interesse</div>
            <div className="flex flex-col gap-2">
              {pontosDisponiveis.map((p) => <PoiChip key={p.id || p.label} p={p} />)}
            </div>
          </>
        )}
      </aside>

      {/* Board timeline em colunas */}
      <section className="flex-1">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${local.length}, minmax(280px, 1fr))` }}
        >
          {local.map((dia, dayIndex) => {
            const scheduled = scheduleDay(dia);
            return (
              <div key={dia.data}
                   className="rounded-lg border border-gray-300 bg-white overflow-hidden flex flex-col">
                <ColumnHeader dia={dia} index={dayIndex} />

                <div
                  ref={(el) => (timelineRefs.current[dayIndex] = el)}
                  className="relative"
                  style={{ height: `${DAY_CAP_MIN / MINUTES_PER_PIXEL}px` }}
                  onDrop={(e) => dropOnDay(dayIndex, e)}
                  onDragOver={allowDrop}
                >
                  <TimeGrid />
                  {/* zonas visuais (opcional, leves) */}
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
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-gray-600 mt-3 leading-relaxed">
          <b>Dica:</b> arraste <i>POIs</i> entre os dias. Arraste <b>bases</b>:
          <ul className="list-disc ml-4">
            <li><b>Topo</b> da coluna → define a base de <u>início</u> (fixa)</li>
            <li><b>Rodapé</b> → define a base de <u>pernoite</u> (fim do dia) — sem duplicar</li>
            <li><b>Meio</b> → adiciona base intermediária (ex.: almoço)</li>
          </ul>
          Todas as mudanças recalculam rotas, cores e pins automaticamente (mesma cor do cabeçalho).
        </div>
      </section>
    </div>
  );
}

export default TravelPlannerBoard;
