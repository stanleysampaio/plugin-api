/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */
/* eslint-disable @typescript-eslint/no-explicit-any */

const _PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = _PD.React;

/* ============================ Tipos ============================ */
type DiaRoteiro = { data: string; pontos: PontoRoteiro[] };
type PontoRoteiro = {
  id: string;
  label: string;
  tipo: 'base' | 'interesse';
  tempo?: number;                 // min no local
  coordinates: [number, number];  // [lon, lat]
  inicioMin?: number;             // min desde 00:00
};

type Props = {
  roteiro: DiaRoteiro[];
  pontosDisponiveis: PontoRoteiro[];
  baseCatalog?: PontoRoteiro[];
  onUpdateRoteiro: (novo: DiaRoteiro[]) => void;
  onUpdateDisponiveis?: (novos: PontoRoteiro[]) => void;
  onRebuildRoutes?: (novo: DiaRoteiro[]) => void;
  heightPx?: number;
};

/* ============================ Constantes/Grade + Zoom ============================ */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN   = 19 * 60;
const SLOT_MIN      = 30;
const BASE_BLOCK_MIN = 60;
const END_SLOT_START = DAY_END_MIN - SLOT_MIN;

const BASE_SLOT_PX   = 32;
const BASE_COL_W_PX  = 260;

const ZOOM_MIN = 0.9, ZOOM_MAX = 1.6, ZOOM_STEP = 0.1;

const NUM_ROWS = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;
const CELL_STARTS: number[] = Array.from({ length: NUM_ROWS }, (_, i) => DAY_START_MIN + i * SLOT_MIN);

/* ============================ Paleta ============================ */
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
const withAlpha = (hex: string, a = 0.55) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

/* ============================ Pins (tema padrão) ============================ */
const _pinService: any = (window as any).PluginDependencies?.pinService;
(function ensurePinTheme() {
  (window as any).TT_PIN_ICON_THEME = {
    base: { glyph: 'house',  color: '#0ea5e9', halo: '#ffffff' },
    poi:  { glyph: 'marker', color: '#8b5cf6', halo: '#ffffff' }
  };
  try {
    _pinService?.configure?.({
      defaultIcons: {
        base: (window as any).TT_PIN_ICON_THEME.base,
        poi:  (window as any).TT_PIN_ICON_THEME.poi,
      }
    });
  } catch {}
})();

/* ============================ Utils ============================ */
const pad2 = (n: number) => String(n).padStart(2, '0');
const minutesToLabel = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const snapToSlot = (min: number) => {
  const c = clamp(min, DAY_START_MIN, DAY_END_MIN - SLOT_MIN);
  return DAY_START_MIN + Math.floor((c - DAY_START_MIN) / SLOT_MIN) * SLOT_MIN;
};
const byTime = (a: PontoRoteiro, b: PontoRoteiro) =>
  (a.inicioMin ?? Number.MAX_SAFE_INTEGER) - (b.inicioMin ?? Number.MAX_SAFE_INTEGER);

function cloneRoteiro(r: DiaRoteiro[]): DiaRoteiro[] {
  return r.map(d => ({ ...d, pontos: [...d.pontos] }));
}
function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const m = new Map<string, T>();
  for (const it of arr) if (!m.has(it.id)) m.set(it.id, it);
  return [...m.values()];
}
function nextDateStr(yyyy_mm_dd: string): string {
  const d = new Date(yyyy_mm_dd + 'T00:00:00'); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* ============================ Base do dia (marcador invisível) ============================ */
const baseMarkerIdForDay = (dateStr: string) => `__base_of_${dateStr}`;
function getBaseMarker(dia: DiaRoteiro): PontoRoteiro | null {
  const id = baseMarkerIdForDay(dia.data);
  return dia.pontos.find(p => p.id === id) || null;
}
function setBaseMarker(dia: DiaRoteiro, base: PontoRoteiro): DiaRoteiro {
  const id = baseMarkerIdForDay(dia.data);
  const keep = dia.pontos.filter(p => p.id !== id);
  return { ...dia, pontos: [...keep, { id, label: base.label, tipo: 'base', coordinates: base.coordinates }] };
}
function finalCatalogBase(baseCatalog?: PontoRoteiro[] | null): PontoRoteiro | null {
  if (!baseCatalog?.length) return null;
  const last = baseCatalog[baseCatalog.length - 1];
  return { id: `__final_catalog_base`, label: last.label, tipo: 'base', coordinates: last.coordinates };
}

/* ============================ Distância/ETA ============================ */
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
  const durations: Record<string, number> | undefined = (window as any).TT_ROUTE_DURATIONS;
  if (durations && typeof durations[key] === 'number') return Math.max(1, Math.round(durations[key]!));
  const km = haversineMeters(a, b) / 1000;
  return etaFromKm(km);
}

/* ============================ Auto-horários (Garante BASE 8:00) ============================ */
function autoAssignTimes(day: DiaRoteiro): DiaRoteiro {
  const marker = getBaseMarker(day);
  const baseCoord = (marker?.coordinates ?? [0, 0]) as [number, number];

  const baseStart: PontoRoteiro = {
    id: `base-start-${day.data}`, label: marker?.label ?? 'Base',
    tipo: 'base', coordinates: baseCoord, inicioMin: snapToSlot(DAY_START_MIN)
  };
  const baseEnd: PontoRoteiro = {
    id: `base-end-${day.data}`, label: marker?.label ?? 'Base',
    tipo: 'base', coordinates: baseCoord, inicioMin: snapToSlot(END_SLOT_START)
  };

  // Só POIs + bases pit-stop no miolo
  let middle = day.pontos
    .filter(p => p.tipo === 'interesse' || (p.tipo === 'base' && p.id.startsWith('base-pit-')))
    .sort(byTime);

  // ⚠️ se o primeiro item do dia for exatamente a mesma coordenada da base, empurre 1 slot
  if (middle.length && marker) {
    const first = middle[0];
    if (first.coordinates[0] === marker.coordinates[0] &&
        first.coordinates[1] === marker.coordinates[1]) {
      const adj = { ...first, inicioMin: snapToSlot((first.inicioMin ?? DAY_START_MIN) + SLOT_MIN) };
      middle = [adj, ...middle.slice(1)];
    }
  }

  middle = middle.map((p, i) => {
    const defDur = p.tipo === 'base' ? BASE_BLOCK_MIN : SLOT_MIN;
    return {
      ...p,
      inicioMin: typeof p.inicioMin === 'number'
        ? snapToSlot(p.inicioMin)
        : snapToSlot(DAY_START_MIN + SLOT_MIN * (i + 1)),
      tempo: Math.max(defDur, p.tempo ?? defDur),
    };
  });

  const others = day.pontos.filter(p => p.id.startsWith('__base_of_'));
  return { ...day, pontos: dedupeById([...(marker ? [marker] : []), baseStart, ...middle, baseEnd, ...others]).sort(byTime) };
}

/* ============================ Normalização (herança correta) ============================ */
function normalizeDays(src: DiaRoteiro[], baseCatalog?: PontoRoteiro[]): DiaRoteiro[] {
  let days = cloneRoteiro(src);

  // Dia 0 garante base (origem ou 1ª do catálogo)
  if (days[0]) {
    const prefer = getBaseMarker(days[0]) ?? (baseCatalog?.[0]
      ? { id: baseMarkerIdForDay(days[0].data), label: baseCatalog[0].label, tipo: 'base', coordinates: baseCatalog[0].coordinates }
      : null);
    if (prefer) days[0] = setBaseMarker(days[0], prefer);
  }
  // demias dias apontam, inicialmente, à mesma base do dia anterior
  for (let i = 1; i < days.length; i++) {
    const prevBase = getBaseMarker(days[i-1]) ?? getBaseMarker(days[i]) ?? null;
    if (prevBase) days[i] = setBaseMarker(days[i], prevBase);
  }

  days = days.map(autoAssignTimes);

  // herança correta: dia N usa como base o TÉRMINO do dia N-1
  for (let i = 1; i < days.length; i++) {
    const prevEnd = days[i-1].pontos.find(p => p.id === `base-end-${days[i-1].data}`);
    if (prevEnd) {
      days[i] = setBaseMarker(days[i], {
        id: baseMarkerIdForDay(days[i].data),
        label: prevEnd.label, tipo: 'base', coordinates: prevEnd.coordinates
      });
      days[i] = autoAssignTimes(days[i]);
    }
  }

  // Último dia → destino final (última base do catálogo, se houver)
  const last = days.length - 1;
  if (last >= 0) {
    const endId = `base-end-${days[last].data}`;
    const dest = finalCatalogBase(baseCatalog) ?? getBaseMarker(days[last]);
    if (dest) {
      days[last].pontos = days[last].pontos.map(p =>
        p.id === endId ? { ...p, label: dest.label, coordinates: dest.coordinates } : p
      ).sort(byTime);
    }
  }

  // 🔒 Invariante: todo dia precisa ter base-start às 08:00 e NENHUM POI antes dele
  days = days.map(d => {
    const hasStart = d.pontos.some(p => p.id === `base-start-${d.data}`);
    const marker = getBaseMarker(d);
    const fixed = hasStart ? d : {
      ...d,
      pontos: dedupeById([{ id: `base-start-${d.data}`, label: marker?.label ?? 'Base', tipo: 'base', coordinates: marker?.coordinates ?? [0,0], inicioMin: DAY_START_MIN }, ...d.pontos]).sort(byTime),
    };
    // remove qualquer POI que por ventura tenha inicio < 08:00 (não deveria, mas garantimos)
    fixed.pontos = fixed.pontos.map(p => typeof p.inicioMin === 'number' ? { ...p, inicioMin: Math.max(DAY_START_MIN, p.inicioMin) } : p).sort(byTime);
    return fixed;
  });

  return days;
}

/* ============================ Pit-stop e Split ============================ */
function splitDayAt(src: DiaRoteiro[], diaIndex: number, slotMin: number, newBase: PontoRoteiro, baseCatalog?: PontoRoteiro[]): DiaRoteiro[] {
  const norm = normalizeDays(src, baseCatalog);
  const d = norm[diaIndex];
  const cut = snapToSlot(slotMin);

  const toStay: PontoRoteiro[] = [];
  const toMove: PontoRoteiro[] = [];

  for (const p of d.pontos) {
    if (p.id.startsWith('__base_of_')) continue;
    if (p.id === `base-start-${d.data}`) { toStay.push(p); continue; }
    if (typeof p.inicioMin === 'number' && p.inicioMin > cut) toMove.push(p);
    else toStay.push(p);
  }

  const out = cloneRoteiro(src);
  const curr = out[diaIndex];

  out[diaIndex] = {
    data: curr.data,
    pontos: dedupeById([
      { id: baseMarkerIdForDay(curr.data), label: (getBaseMarker(curr) ?? newBase).label, tipo: 'base', coordinates: (getBaseMarker(curr)?.coordinates ?? newBase.coordinates) },
      { id: `base-start-${curr.data}`, label: (getBaseMarker(curr)?.label ?? newBase.label), tipo: 'base', coordinates: (getBaseMarker(curr)?.coordinates ?? newBase.coordinates), inicioMin: DAY_START_MIN },
      ...toStay.filter(p => !p.id.startsWith('base-end-')),
      { id: `base-end-${curr.data}`,   label: newBase.label, tipo: 'base', coordinates: newBase.coordinates, inicioMin: cut },
    ]).sort(byTime),
  };

  const nextIdx = diaIndex + 1;
  if (!out[nextIdx]) out.push({ data: nextDateStr(curr.data), pontos: [] });

  return normalizeDays(out, baseCatalog);
}
function insertBasePitstop(src: DiaRoteiro[], diaIndex: number, slotMin: number, base: PontoRoteiro, baseCatalog?: PontoRoteiro[]): DiaRoteiro[] {
  const updated = cloneRoteiro(src);
  const d = updated[diaIndex];
  const pit: PontoRoteiro = {
    id: `base-pit-${Date.now()}`,
    label: base.label,
    tipo: 'base',
    coordinates: base.coordinates,
    inicioMin: snapToSlot(slotMin),
    tempo: BASE_BLOCK_MIN
  };
  updated[diaIndex] = { ...d, pontos: dedupeById([...d.pontos, pit]).sort(byTime) };
  return normalizeDays(updated, baseCatalog);
}

/* ============================ Export/Map hooks ============================ */
function orderedDaysForRouting(days: DiaRoteiro[]): DiaRoteiro[] {
  return days.map(d => {
    const seq = d.pontos.filter(p => !p.id.startsWith('__base_of_')).sort(byTime);
    return { ...d, pontos: seq };
  });
}

function estimateLegsAndExposeColors(ordered: DiaRoteiro[]) {
  const ROUTE_OPACITY = 0.55;     // linha
  const ROUTE_HALO_OPAC = 0.25;   // halo/borda

  const viagens = ordered.map((d, i) => {
    const dayColor = colorForDay(i);
    const legs: Array<{ from: string; to: string; a: [number,number]; b: [number,number]; distance_km: number; eta_min: number; color: string; style: any }> = [];
    for (let k = 0; k < d.pontos.length - 1; k++) {
      const A = d.pontos[k], B = d.pontos[k + 1];
      const km = Math.max(0, Math.round((haversineMeters(A.coordinates, B.coordinates) / 1000) * 10) / 10);
      const eta = etaFromRouteOrFallback(A.coordinates, B.coordinates);
      legs.push({
        from: A.label, to: B.label, a: A.coordinates, b: B.coordinates, distance_km: km, eta_min: eta,
        color: dayColor,
        style: {
          main:  { color: dayColor, weight: 5, opacity: ROUTE_OPACITY, lineCap: 'round' },
          halo:  { color: '#000',   weight: 8, opacity: ROUTE_HALO_OPAC, lineCap: 'round' } // “transparência nas bordas”
        }
      });
    }
    return { day: d.data, color: dayColor, legs };
  });

  (window as any).TT_VIAGENS = viagens;
  const dayColorMap: Record<string,string> = {};
  for (const v of viagens) dayColorMap[v.day] = v.color;
  (window as any).TT_DAY_COLORS = dayColorMap;
  (window as any).TT_ROUTE_COLOR_OF_DAY = (iso: string) => dayColorMap[iso] || '#3388ff';
  (window as any).TT_ROUTE_STYLE_OF_DAY = (iso: string) => ({
    main: { color: dayColorMap[iso] || '#3388ff', weight: 5, opacity: ROUTE_OPACITY, lineCap: 'round' },
    halo: { color: '#000', weight: 8, opacity: ROUTE_HALO_OPAC, lineCap: 'round' },
  });

  // Flatten para o renderer (Leaflet/Maplibre)
  const flat: Array<{ day: string; coords: [number,number][], style: any }> = [];
  for (const v of viagens) {
    for (const l of v.legs) flat.push({ day: v.day, coords: [l.a, l.b], style: l.style });
  }
  (window as any).TT_ROUTES = flat;
}

function buildPins(days: DiaRoteiro[]) {
  const keyFor = (c: [number,number]) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
  const bucket: Record<string, Set<string>> = {};

  for (let i = 0; i < days.length; i++) {
    for (const p of days[i].pontos) {
      if (p.id.startsWith('__base_of_')) continue;
      const k = keyFor(p.coordinates);
      bucket[k] = bucket[k] || new Set<string>();
      bucket[k].add(days[i].data);
    }
  }

  const out: any[] = [];
  for (let i = 0; i < days.length; i++) {
    const color = colorForDay(i);
    for (const p of days[i].pontos) {
      if (p.id.startsWith('__base_of_')) continue;
      const k = keyFor(p.coordinates);
      const daySet = Array.from(bucket[k] || []);
      const dayColors = daySet.map(ds => (window as any).TT_DAY_COLORS?.[ds] ?? color);

      out.push({
        type: 'Feature',
        id: `tt::${days[i].data}::${p.id}`,
        geometry: { type: 'Point', coordinates: p.coordinates },
        properties: {
          kind: p.tipo === 'base' ? 'base' : 'poi',
          type: p.tipo === 'base' ? 'tr_base' : 'tr_poi',
          label: p.label,
          day: days[i].data,
          dayIndex: i,
          colorHex: color,
          colorsHex: Array.from(new Set(dayColors)),
          isMultiDay: dayColors.length > 1
        },
      });
    }
  }
  return out;
}

function notifyMap(days: DiaRoteiro[], onRebuildRoutes?: (novo: DiaRoteiro[]) => void) {
  const ordered = orderedDaysForRouting(days);

  estimateLegsAndExposeColors(ordered);
  try { onRebuildRoutes?.(ordered); } catch {}

  try {
    const pins = buildPins(ordered);
    (window as any).TT_PIN_ICON_FACTORY = (feat: any) => {
      const theme = (window as any).TT_PIN_ICON_THEME || {};
      const def = feat?.properties?.kind === 'base' ? theme.base : theme.poi;
      const colors = feat?.properties?.colorsHex || [feat?.properties?.colorHex];
      return { ...def, colors };
    };
    _pinService?.clear?.();
    _pinService?.updateAllPins?.(pins);
  } catch (e) {
    console.warn('pinService/updateAllPins falhou:', e);
  }

  // hook opcional do host
  try { (window as any).TT_DRAW_ROUTES?.((window as any).TT_ROUTES || []); } catch {}
}

/* ============================ Resumos ============================ */
function summarizeDay(dayIso: string) {
  const v: any[] = (window as any).TT_VIAGENS || [];
  const item = v.find(x => x.day === dayIso);
  if (!item) return { km: 0, min: 0 };
  const km = Math.round(item.legs.reduce((a: number, l: any) => a + (l.distance_km || 0), 0));
  const min = Math.round(item.legs.reduce((a: number, l: any) => a + (l.eta_min || 0), 0));
  return { km, min };
}
function legEtaBetween(dayIso: string, from: PontoRoteiro, to: PontoRoteiro): number | null {
  const v: any[] = (window as any).TT_VIAGENS || [];
  const item = v.find(x => x.day === dayIso);
  if (!item) return null;
  const leg = item.legs.find((l: any) =>
    l.a?.[0] === from.coordinates[0] && l.a?.[1] === from.coordinates[1] &&
    l.b?.[0] === to.coordinates[0] && l.b?.[1] === to.coordinates[1]
  );
  return (leg?.eta_min ?? null);
}
const fmtEta = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `${h}h ${mm}min` : `${mm} min`;
};

/* ============================ Componente ============================ */
export function TravelPlannerBoard({
  roteiro,
  pontosDisponiveis,
  baseCatalog,
  onUpdateRoteiro,
  onUpdateDisponiveis,
  onRebuildRoutes,
  heightPx = 560,
}: Props) {
  if (!_R) return null;

  const [zoom, setZoom] = _R.useState(1.12);
  const SLOT_PX = Math.round(BASE_SLOT_PX * zoom);
  const COL_W_PX = Math.round(BASE_COL_W_PX * zoom);

  const [dragItem, setDragItem] = _R.useState<{
    tipo: 'base' | 'interesse' | 'base-end';
    ponto?: PontoRoteiro;
    origem?: { diaIndex: number; pontoIndex: number };
    fromSidebar?: boolean;
  } | null>(null);

  const dias = _R.useMemo(() => normalizeDays(roteiro, baseCatalog), [roteiro, baseCatalog]);
  _R.useEffect(() => { notifyMap(dias, onRebuildRoutes); }, [dias, onRebuildRoutes]);

  function propagate(next: DiaRoteiro[]) {
    const norm = normalizeDays(next, baseCatalog);
    onUpdateRoteiro(norm);
    setDragItem(null);
  }

  /* Drag */
  function startDragFromSidebar(p: PontoRoteiro) {
    setDragItem({ tipo: p.tipo, ponto: p, fromSidebar: true });
  }
  function startDragCard(diaIndex: number, pontoIndex: number, p: PontoRoteiro) {
    if (p.id === `base-start-${dias[diaIndex].data}`) {
      const asBase: PontoRoteiro = { id: `__drag_base_${dias[diaIndex].data}`, label: p.label, tipo: 'base', coordinates: p.coordinates };
      setDragItem({ tipo: 'base', ponto: asBase, origem: { diaIndex, pontoIndex } });
      return;
    }
    if (p.id === `base-end-${dias[diaIndex].data}`) {
      setDragItem({ tipo: 'base-end', origem: { diaIndex, pontoIndex } });
      return;
    }
    setDragItem({ tipo: p.tipo, ponto: p, origem: { diaIndex, pontoIndex } });
  }
  function dropOnHeader(diaIndex: number) {
    if (!dragItem || dragItem.tipo !== 'base' || !dragItem.ponto) return;
    const updated = cloneRoteiro(roteiro);
    updated[diaIndex] = setBaseMarker(updated[diaIndex] ?? dias[diaIndex], dragItem.ponto);
    propagate(updated);
  }
  function dropOnSlot(diaIndex: number, min: number, e?: any) {
    if (!dragItem) return;
    const updated = cloneRoteiro(roteiro);

    if (dragItem.tipo === 'base-end') {
      const baseEnd = dias[diaIndex].pontos.find(p => p.id === `base-end-${dias[diaIndex].data}`);
      const endBase = baseEnd ? { ...baseEnd, tipo: 'base' as const } : (getBaseMarker(dias[diaIndex]) ?? undefined);
      if (!endBase) return;
      const splitted = splitDayAt(updated, diaIndex, min, endBase, baseCatalog);
      propagate(splitted);
      return;
    }
    if (dragItem.tipo === 'base' && dragItem.ponto) {
      const pit = insertBasePitstop(updated, diaIndex, min, dragItem.ponto, baseCatalog);
      propagate(pit);
      return;
    }

    if (dragItem.tipo === 'interesse') {
      const sMin = snapToSlot(min);
      if (dragItem.origem) {
        const { diaIndex: oDia, pontoIndex: oIdx } = dragItem.origem;
        const src = updated[oDia] ?? dias[oDia];
        const srcCopy = { ...src, pontos: [...src.pontos] };
        const gone = srcCopy.pontos[oIdx];
        if (gone) srcCopy.pontos.splice(oIdx, 1);
        updated[oDia] = srcCopy;
      }
      const to = updated[diaIndex] ?? dias[diaIndex];
      const poiOrig = dragItem.ponto ?? dias[dragItem.origem!.diaIndex].pontos[dragItem.origem!.pontoIndex];
      const defDur = SLOT_MIN;
      const poi = { ...poiOrig, inicioMin: sMin, tempo: Math.max(defDur, poiOrig.tempo ?? defDur) };
      const toCopy = { ...to, pontos: [...to.pontos.filter(p => p.tipo !== 'interesse' || p.id !== poi.id), poi] };
      updated[diaIndex] = toCopy;
      if (dragItem.fromSidebar && onUpdateDisponiveis) onUpdateDisponiveis(pontosDisponiveis.filter(x => x.id !== poi.id));
      propagate(updated);
    }
  }
  function dropOnColumn(diaIndex: number, e: any) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIdx = clamp(Math.floor(y / SLOT_PX), 0, NUM_ROWS - 1);
    const min = DAY_START_MIN + slotIdx * SLOT_MIN;
    dropOnSlot(diaIndex, min, e);
  }

  /* Sidebar */
  const basesDisponiveis: PontoRoteiro[] = _R.useMemo(() => {
    const raw = baseCatalog?.length ? baseCatalog : roteiro.flatMap(d => d.pontos.filter(p => p.tipo === 'base'));
    return dedupeById(raw);
  }, [baseCatalog, roteiro]);

  /* CSS (layout/overflow fix) */
  _R.useEffect(() => {
    const id = 'tt-board-theme-v14';
    if (document.getElementById(id)) return;
    const css = `
      .tt-board .slot { border-bottom: 1px dashed rgba(0,0,0,.06); }
      .tt-board .slot:nth-child(odd) { background: rgba(0,0,0,.02); }
      .tt-col-inner { overflow: hidden; }
      .tt-card {
        position: relative; overflow: hidden; border-radius: 10px;
        background: #fff; border: 1px solid rgba(0,0,0,.10);
        box-shadow: 0 4px 12px rgba(16,24,40,.08);
        transition: transform .06s ease, box-shadow .06s ease, border-color .06s ease;
        max-width: calc(100% - 12px);
      }
      .tt-card:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(16,24,40,.12); }
      .tt-card .bar { position:absolute; left:0; top:0; bottom:0; width:4px; border-top-left-radius:10px; border-bottom-left-radius:10px; }
      .tt-card.base { background: linear-gradient(180deg,#ECFEFF,#FFFFFF); border-color:#bae6fd; color:#075985; }
      .tt-card.poi  { background: linear-gradient(180deg,#F5F3FF,#FFFFFF); border-color:#ddd6fe; color:#111827; }
      .tt-card .title { font-weight:700; letter-spacing:.2px; font-size:12px; line-height:1.25; padding-right:22px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tt-card .meta { font-size:11px; opacity:.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tt-card .chip { font-size:10px; padding:2px 7px; border-radius:9999px; background:#111827; color:#fff; }
      .tt-card .travel { position:absolute; top:4px; left:6px; font-size:10px; background:#111827; color:#fff; padding:1px 6px; border-radius:9999px; pointer-events:none; }
      .tt-card .close { position:absolute; right:6px; top:5px; font-size:12px; color:#DC2626; }
      .tt-sticky { position: sticky; background:#fff; z-index: 3; }
      .tt-day-head { font-weight:800; display:flex; align-items:center; gap:8px; text-transform:uppercase; letter-spacing:.3px; font-size:11px; }
      .tt-day-chip { display:inline-block; width:12px; height:12px; border-radius:3px; box-shadow:0 0 0 1px rgba(0,0,0,.08) inset; }
      .tt-head-drop { border:1px dashed rgba(0,0,0,.22); border-radius:10px; padding:3px 7px; font-size:11px; color:#374151; background:#fafafa; }
      .tt-zoom-btn { width:24px; height:24px; border-radius:6px; border:1px solid rgba(0,0,0,.1); background:#fff; }
    `;
    const el = document.createElement('style'); el.id = id; el.textContent = css; document.head.appendChild(el);
  }, []);

  const minWidthPx = Math.max(1, dias.length) * COL_W_PX + 160;

  /* Render */
  return (
    <div className="flex gap-5">
      {/* Sidebar */}
      <aside className="min-w-[260px]">
        <h4 className="font-bold mb-2">Bases</h4>
        <div className="space-y-2">
          {basesDisponiveis.map((p) => (
            <div
              key={'base-' + p.id}
              className="px-3 py-2 border rounded-lg text-sm bg-emerald-50 hover:bg-emerald-100 cursor-move"
              draggable
              onDragStart={() => startDragFromSidebar(p)}
              title="Arraste para o cabeçalho (define o início do dia) ou para a coluna (pit-stop)."
            >
              🏠 {p.label}
            </div>
          ))}
        </div>

        <h4 className="font-bold mt-5 mb-2">Pontos de interesse</h4>
        <div className="space-y-2">
          {pontosDisponiveis.map((p) => (
            <div
              key={p.id}
              className="px-3 py-2 border rounded-lg text-sm bg-blue-50 hover:bg-blue-100 cursor-move"
              draggable
              onDragStart={() => startDragFromSidebar(p)}
              title="Arraste para um horário do dia"
            >
              📍 {p.label}
            </div>
          ))}
        </div>
      </aside>

      {/* Board */}
      <section
        className="flex-1 rounded-2xl border shadow-sm overflow-auto bg-white tt-board"
        style={{ height: heightPx + 'px', minHeight: heightPx + 'px', minWidth: minWidthPx + 'px' }}
      >
        {/* Cabeçalho */}
        <div
          className="grid tt-sticky top-0"
          style={{ gridTemplateColumns: `120px repeat(${dias.length}, ${COL_W_PX}px)` }}
        >
          <div className="h-14 border-b border-r flex items-center justify-between px-2 text-[11px] text-gray-600">
            <span>Horário</span>
            <div className="flex items-center gap-1">
              <button className="tt-zoom-btn" onClick={() => setZoom(z => clamp(+((z - ZOOM_STEP).toFixed(1)), ZOOM_MIN, ZOOM_MAX))}>−</button>
              <div className="w-10 text-center">{(zoom*100).toFixed(0)}%</div>
              <button className="tt-zoom-btn" onClick={() => setZoom(z => clamp(+((z + ZOOM_STEP).toFixed(1)), ZOOM_MIN, ZOOM_MAX))}>+</button>
            </div>
          </div>
          {dias.map((d, diaIndex) => {
            const dayColor = colorForDay(diaIndex);
            const sum = summarizeDay(d.data);
            return (
              <div
                key={'head-' + d.data}
                className="h-14 border-b border-r flex items-center justify-between px-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOnHeader(diaIndex)}
                style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.02), rgba(0,0,0,0))' }}
              >
                <span className="tt-day-head">
                  <span className="tt-day-chip" aria-hidden style={{ background: dayColor }} />
                  {d.data}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2 py-1 rounded-full border bg-white">{`🛣️ ${sum.km} km • ~${fmtEta(sum.min)}`}</span>
                  <span className="tt-head-drop text-[11px]">Solte uma <b>base</b> aqui para definir o início</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Grid + Colunas */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `120px repeat(${dias.length}, ${COL_W_PX}px)`, width: minWidthPx + 'px' }}
        >
          {/* Horários */}
          <div className="tt-sticky left-0 bg-white">
            {CELL_STARTS.map((min) => (
              <div
                key={'lbl-' + min}
                className="border-b border-r flex items-start justify-center text-[12px] font-semibold text-gray-700"
                style={{ height: SLOT_PX + 'px' }}
              >
                {minutesToLabel(min)}
              </div>
            ))}
            <div className="border-r" style={{ height: '1px' }} />
            <div className="border-r flex items-start justify-center text-[11px] text-gray-500 pb-2">19:00</div>
          </div>

          {/* Colunas por dia */}
          {dias.map((dia, diaIndex) => {
            const dayColor = colorForDay(diaIndex);
            const colTint = withAlpha(dayColor, 0.12);
            const ordered = dia.pontos.filter(p => !p.id.startsWith('__base_of_')).sort(byTime);

            return (
              <div key={'col-' + dia.data} className="relative border-r" style={{ background: `linear-gradient(0deg, ${colTint}, transparent 65%)` }}>
                <div
                  className="relative tt-col-inner"
                  style={{ display: 'grid', gridTemplateRows: `repeat(${NUM_ROWS}, ${SLOT_PX}px)` }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => dropOnColumn(diaIndex, e)}
                >
                  {/* Slots dropáveis */}
                  {CELL_STARTS.map((min) => (
                    <div
                      key={dia.data + '-slot-' + min}
                      className="slot hover:bg-gray-100 transition-colors"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => dropOnSlot(diaIndex, min, e)}
                      title={`Soltar em ${minutesToLabel(min)}`}
                      style={{ height: SLOT_PX + 'px' }}
                    />
                  ))}

                  {/* Cards */}
                  {ordered.map((ponto, pontoIndex) => {
                    const start = typeof ponto.inicioMin === 'number' ? snapToSlot(ponto.inicioMin) : null;
                    const defaultDur = ponto.tipo === 'base'
                      ? (ponto.id.startsWith('base-pit-') ? BASE_BLOCK_MIN : SLOT_MIN)
                      : SLOT_MIN;
                    const dur = Math.max(defaultDur, ponto.tempo ?? defaultDur);
                    const end = start !== null ? Math.min(DAY_END_MIN, start + dur) : null;
                    const span = start !== null ? Math.max(1, Math.ceil((end! - start) / SLOT_MIN)) : 1;
                    const rowIndex = start !== null ? Math.round((start - DAY_START_MIN) / SLOT_MIN) + 1 : 1;

                    const isBaseStart = ponto.id === `base-start-${dia.data}`;
                    const isBaseEnd   = ponto.id === `base-end-${dia.data}`;
                    const isBase      = ponto.tipo === 'base' || isBaseStart || isBaseEnd;
                    const kind        = isBase ? 'base' : 'poi';
                    const canDrag     = isBaseEnd || isBaseStart || (!isBase);

                    let travelChip: _R.ReactNode = null;
                    if (pontoIndex > 0) {
                      const prev = ordered[pontoIndex - 1];
                      const eta = legEtaBetween(dia.data, prev, ponto) ?? etaFromRouteOrFallback(prev.coordinates, ponto.coordinates);
                      travelChip = <span className="travel">→ {eta} min</span>;
                    }

                    return (
                      <div
                        key={ponto.id + '@' + (ponto.inicioMin ?? 'x')}
                        style={start !== null ? { gridRow: `${rowIndex} / span ${span}`, margin: '5px' } : { margin: '5px' }}
                        className={`tt-card ${kind} px-3 py-2 border text-[12px]`}
                        draggable={canDrag}
                        onDragStart={() => startDragCard(diaIndex, pontoIndex, ponto)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { if (start !== null) dropOnSlot(diaIndex, start, e); }}
                        title={
                          isBaseStart ? '🏠 Início do dia'
                          : isBaseEnd ? '🏁 Término do dia (arraste p/ dividir num horário)'
                          : (ponto.tipo === 'base' ? 'Parada em base (pit-stop)' : 'Arraste para outro horário/dia')
                        }
                      >
                        <div className="bar" style={{ background: dayColor }} />
                        {travelChip}
                        <div className="flex items-center justify-between gap-2">
                          <div className="title">
                            {isBaseStart ? `🏠 Início — ${ponto.label}`
                             : isBaseEnd ?  `🏁 Término — ${ponto.label}`
                             : ponto.tipo === 'base' ? `🏠 ${ponto.label}` : `📍 ${ponto.label}`}
                          </div>
                          <span className="chip">{dur} min</span>
                        </div>
                        <div className="meta mt-1">
                          {start !== null ? `${minutesToLabel(start)} — ${minutesToLabel(Math.min(DAY_END_MIN, (start ?? DAY_START_MIN) + dur))}` : '—'}
                        </div>
                        {(!isBaseStart && !isBaseEnd) && (
                          <button
                            className="close"
                            title="Remover"
                            onClick={(e) => {
                              e.stopPropagation();
                              const updated = cloneRoteiro(roteiro);
                              const src = updated[diaIndex] ?? dias[diaIndex];
                              const srcCopy = { ...src, pontos: [...src.pontos] };
                              const idx = srcCopy.pontos.findIndex(pp => pp.id === ponto.id);
                              if (idx >= 0) srcCopy.pontos.splice(idx, 1);
                              updated[diaIndex] = srcCopy;
                              if (ponto.tipo === 'interesse' && typeof onUpdateDisponiveis === 'function') {
                                onUpdateDisponiveis(dedupeById([...pontosDisponiveis, { ...ponto }]));
                              }
                              propagate(updated);
                            }}
                          >✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default TravelPlannerBoard;
