// components/TravelPlannerBoard.tsx
/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */

/* eslint-disable @typescript-eslint/no-explicit-any */

const _PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = _PD.React;

/* ---------------------- Tipos ---------------------- */
type DiaRoteiro = { data: string; pontos: PontoRoteiro[] };

type PontoRoteiro = {
  id: string;
  label: string;
  tipo: 'base' | 'interesse';
  tempo?: number;                 // duração informativa (min)
  coordinates: [number, number];  // [lon, lat]
  inicioMin?: number;             // min desde 00:00 (aplicado aos visíveis na grade)
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

/* ---------------------- Constantes / Horário ---------------------- */
const DAY_START_MIN = 8 * 60;      // 08:00
const DAY_END_MIN   = 19 * 60;     // 19:00
const SLOT_MIN      = 30;
const SLOT_PX       = 28;
const COL_W_PX      = 300;
const END_SLOT_START = DAY_END_MIN - SLOT_MIN;

const NUM_ROWS = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;
const CELL_STARTS: number[] = Array.from({ length: NUM_ROWS }, (_, i) => DAY_START_MIN + i * SLOT_MIN);

/* ---------------------- Cores por dia ---------------------- */
const DAY_COLORS = ['#2563EB', '#059669', '#F59E0B', '#EF4444', '#7C3AED', '#0EA5E9', '#16A34A', '#EA580C'];
const colorForDay = (i: number) => DAY_COLORS[i % DAY_COLORS.length];

/* ---------------------- Utils ---------------------- */
const pad2 = (n: number) => String(n).padStart(2, '0');
const minutesToLabel = (m: number) => `${pad2(Math.floor(m/60))}:${pad2(m%60)}`;
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
  const d = new Date(yyyy_mm_dd + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* --------- Base “marcador invisível” por dia --------- */
const baseMarkerIdForDay = (dateStr: string) => `__base_of_${dateStr}`;

function getBaseMarker(dia: DiaRoteiro): PontoRoteiro | null {
  const id = baseMarkerIdForDay(dia.data);
  return dia.pontos.find(p => p.id === id) || null;
}

function setBaseMarker(dia: DiaRoteiro, base: PontoRoteiro): DiaRoteiro {
  const id = baseMarkerIdForDay(dia.data);
  const keep = dia.pontos.filter(p => p.id !== id);
  return {
    ...dia,
    pontos: [...keep, { id, label: base.label, tipo: 'base', coordinates: base.coordinates }],
  };
}

/* --------- Base efetiva por dia e base final do roteiro --------- */
function baseForDay(days: DiaRoteiro[], idx: number, baseCatalog?: PontoRoteiro[]): PontoRoteiro | null {
  const marker = getBaseMarker(days[idx]);
  if (marker) return marker;

  for (let i = idx - 1; i >= 0; i--) {
    const prev = getBaseMarker(days[i]);
    if (prev) return prev;
  }
  const first = baseCatalog?.[0] ?? null;
  return first
    ? { id: baseMarkerIdForDay(days[idx].data), label: first.label, tipo: 'base', coordinates: first.coordinates }
    : null;
}

function finalCatalogBase(baseCatalog?: PontoRoteiro[]): PontoRoteiro | null {
  if (!baseCatalog?.length) return null;
  const last = baseCatalog[baseCatalog.length - 1];
  return last
    ? { id: `__final_catalog_base`, label: last.label, tipo: 'base', coordinates: last.coordinates }
    : null;
}

/* --------- Atribui horários (auto) para POIs sem inicioMin --------- */
function autoAssignTimes(day: DiaRoteiro): DiaRoteiro {
  const marker = getBaseMarker(day);
  const fixedStart = { id: `base-start-${day.data}`, label: marker?.label ?? 'Base', tipo: 'base' as const, coordinates: (marker?.coordinates ?? [0,0]) as [number,number], inicioMin: DAY_START_MIN };
  const fixedEnd   = { id: `base-end-${day.data}`,   label: marker?.label ?? 'Base', tipo: 'base' as const, coordinates: (marker?.coordinates ?? [0,0]) as [number,number], inicioMin: END_SLOT_START };

  const pois = day.pontos.filter(p => p.tipo === 'interesse');
  let t = DAY_START_MIN + SLOT_MIN; // começa 08:30 por padrão
  const assigned = pois.map(p => {
    const dur = Math.max(SLOT_MIN, p.tempo || SLOT_MIN);
    const out = { ...p, inicioMin: typeof p.inicioMin === 'number' ? snapToSlot(p.inicioMin!) : snapToSlot(t) };
    t = snapToSlot(out.inicioMin! + dur);
    return out;
  });

  const rest = day.pontos.filter(p => !(p.id === fixedStart.id || p.id === fixedEnd.id));

  return {
    ...day,
    pontos: dedupeById([...(marker ? [marker] : []), fixedStart, fixedEnd, ...assigned, ...rest]).sort(byTime),
  };
}

/* --------- Normalização completa --------- */
function normalizeDays(src: DiaRoteiro[], baseCatalog?: PontoRoteiro[]): DiaRoteiro[] {
  const days = cloneRoteiro(src);

  for (let i = 0; i < days.length; i++) {
    const bf = baseForDay(days, i, baseCatalog);
    if (bf) days[i] = setBaseMarker(days[i], bf);
    days[i] = autoAssignTimes(days[i]);
  }

  // Término herda a base do dia seguinte (regra do “sono”)
  for (let i = 0; i < days.length; i++) {
    const endId = `base-end-${days[i].data}`;
    const nextBase = (i < days.length - 1 ? getBaseMarker(days[i + 1]) : finalCatalogBase(baseCatalog)) ?? getBaseMarker(days[i]);
    if (nextBase) {
      const replaced = days[i].pontos.map(p =>
        p.id === endId ? { ...p, label: nextBase.label, coordinates: nextBase.coordinates } : p
      );
      days[i].pontos = replaced.sort(byTime);
    }
  }

  // último dia termina na última base do catálogo (destino final), se existir
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

  return days;
}

/* --------- Split do dia ao inserir base no meio --------- */
function splitDayAt(
  src: DiaRoteiro[],
  diaIndex: number,
  slotMin: number,
  newBase: PontoRoteiro,
  baseCatalog?: PontoRoteiro[]
): DiaRoteiro[] {
  const days = normalizeDays(src, baseCatalog);
  const day = days[diaIndex];
  const cut = snapToSlot(slotMin);

  const toStay: PontoRoteiro[] = [];
  const toMove: PontoRoteiro[] = [];

  for (const p of day.pontos) {
    if (p.id.startsWith('__base_of_')) continue; // marcador invisível
    if (p.id === `base-start-${day.data}`) { toStay.push(p); continue; }

    if (typeof p.inicioMin === 'number' && p.inicioMin > cut) toMove.push(p);
    else toStay.push(p);
  }

  const baseEnd = { id: `base-end-${day.data}`, label: newBase.label, tipo: 'base' as const, coordinates: newBase.coordinates, inicioMin: cut };
  const markerStay = setBaseMarker({ ...day, pontos: toStay }, getBaseMarker(day) ?? newBase);
  markerStay.pontos = dedupeById([
    ...(getBaseMarker(markerStay) ? [getBaseMarker(markerStay)!] : []),
    ...toStay.filter(p => p.id !== `base-end-${day.data}` && p.id !== `base-start-${day.data}`),
    { id: `base-start-${day.data}`, label: (getBaseMarker(markerStay)?.label ?? newBase.label), tipo: 'base', coordinates: (getBaseMarker(markerStay)?.coordinates ?? newBase.coordinates), inicioMin: DAY_START_MIN },
    baseEnd,
  ]).sort(byTime);

  const nextIdx = diaIndex + 1;
  if (!days[nextIdx]) {
    days.push({ data: nextDateStr(day.data), pontos: [] });
  }
  const nextDay = days[nextIdx];

  const markerNext = setBaseMarker({ ...nextDay, pontos: nextDay.pontos.filter(p => !p.id.startsWith('__base_of_')) }, newBase);

  let t = DAY_START_MIN + SLOT_MIN;
  const reassigned = toMove
    .filter(p => p.tipo === 'interesse')
    .map(p => {
      const dur = Math.max(SLOT_MIN, p.tempo || SLOT_MIN);
      const out = { ...p, inicioMin: snapToSlot(t) };
      t = snapToSlot(out.inicioMin! + dur);
      return out;
    });

  const nextBuilt: DiaRoteiro = {
    ...markerNext,
    pontos: dedupeById([
      getBaseMarker(markerNext)!,
      { id: `base-start-${markerNext.data}`, label: newBase.label, tipo: 'base', coordinates: newBase.coordinates, inicioMin: DAY_START_MIN },
      { id: `base-end-${markerNext.data}`,   label: (finalCatalogBase(baseCatalog ?? [])?.label ?? newBase.label), tipo: 'base', coordinates: (finalCatalogBase(baseCatalog ?? [])?.coordinates ?? newBase.coordinates), inicioMin: END_SLOT_START },
      ...reassigned,
      ...nextDay.pontos.filter(p => p.tipo === 'interesse'),
    ]).sort(byTime),
  };

  const out = cloneRoteiro(days);
  out[diaIndex] = markerStay;
  out[nextIdx] = nextBuilt;

  return normalizeDays(out, baseCatalog);
}

/* --------- Viagens por dia + notifica mapa (e exporta legenda) --------- */
function orderedDaysForRouting(days: DiaRoteiro[]): DiaRoteiro[] {
  return days.map(d => {
    const start = d.pontos.find(p => p.id === `base-start-${d.data}`);
    const end   = d.pontos.find(p => p.id === `base-end-${d.data}`);
    const pois  = d.pontos.filter(p => p.tipo === 'interesse').sort(byTime);
    const seq   = ([] as PontoRoteiro[]).concat(start ? [start] : [], pois, end ? [end] : []);
    return { ...d, pontos: seq };
  });
}

function logTripsAndNotify(days: DiaRoteiro[], onRebuildRoutes?: (novo: DiaRoteiro[]) => void) {
  const ordered = orderedDaysForRouting(days);

  const viagens = ordered.map((d, i) => {
    const legs: Array<{ from: string; to: string; a: [number,number]; b: [number,number] }> = [];
    for (let k = 0; k < d.pontos.length - 1; k++) {
      const a = d.pontos[k];
      const b = d.pontos[k + 1];
      legs.push({
        from: a.label,
        to: b.label,
        a: a.coordinates,
        b: b.coordinates,
      });
    }
    return { day: d.data, color: colorForDay(i), legs };
  });

  (window as any).TT_DAY_COLORS = Object.fromEntries(viagens.map(v => [v.day, v.color]));
  (window as any).TT_VIAGENS = viagens;

  // eslint-disable-next-line no-console
  console.log('TT::viagens', viagens);

  onRebuildRoutes?.(ordered);
}

/* ---------------------- Componente ---------------------- */
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

  const [dragItem, setDragItem] = _R.useState<{
    tipo: 'base' | 'interesse' | 'base-end';
    ponto?: PontoRoteiro;
    origem?: { diaIndex: number; pontoIndex: number };
    fromSidebar?: boolean;
  } | null>(null);

  const dias = _R.useMemo(() => normalizeDays(roteiro, baseCatalog), [roteiro, baseCatalog]);

  _R.useEffect(() => {
    logTripsAndNotify(dias, onRebuildRoutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount

  function propagate(next: DiaRoteiro[]) {
    const norm = normalizeDays(next, baseCatalog);
    onUpdateRoteiro(norm);
    logTripsAndNotify(norm, onRebuildRoutes);
    setDragItem(null);
  }

  /* ---------- Drag helpers ---------- */
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

  function dropOnSlot(diaIndex: number, min: number) {
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
      const splitted = splitDayAt(updated, diaIndex, min, dragItem.ponto, baseCatalog);
      propagate(splitted);
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
      const poi = { ...(dragItem.ponto ?? dias[dragItem.origem!.diaIndex].pontos[dragItem.origem!.pontoIndex]), inicioMin: sMin };
      const toCopy = { ...to, pontos: [...to.pontos.filter(p => p.tipo !== 'interesse' || p.id !== poi.id), poi] };
      updated[diaIndex] = toCopy;

      if (dragItem.fromSidebar && onUpdateDisponiveis) {
        onUpdateDisponiveis(pontosDisponiveis.filter(x => x.id !== poi.id));
      }

      propagate(updated);
    }
  }

  function dropOnColumn(diaIndex: number, e: any) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIdx = clamp(Math.floor(y / SLOT_PX), 0, NUM_ROWS - 1);
    const min = DAY_START_MIN + slotIdx * SLOT_MIN;
    dropOnSlot(diaIndex, min);
  }

  /* ---------- Sidebar ---------- */
  const basesDisponiveis: PontoRoteiro[] = _R.useMemo(() => {
    const raw = (baseCatalog && baseCatalog.length)
      ? baseCatalog
      : roteiro.flatMap(d => d.pontos.filter(p => p.tipo === 'base'));
    return dedupeById(raw);
  }, [baseCatalog, roteiro]);

  /* ---------- Estilos (cards bonitos + cor do dia) ---------- */
  _R.useEffect(() => {
    const id = 'tt-grid-theme-v8';
    if (document.getElementById(id)) return;
    const css = `
    .tt-board .slot { border-bottom: 1px solid rgba(0,0,0,.06); }
    .tt-board .slot:nth-child(odd) { background: rgba(0,0,0,.02); }
    .tt-card {
      border-radius: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      position: relative;
      overflow: hidden;
      border: 1px solid transparent;
    }
    .tt-card .bar { position:absolute; left:0; top:0; bottom:0; width:6px; opacity:.95; }
    .tt-card.base { background:#F0FDFA; border-color:#99F6E4; color:#064E3B; }
    .tt-card.poi  { background:#EFF6FF; border-color:#BFDBFE; color:#0B2545; }
    .tt-card .title { font-weight:700; font-size:12px; line-height:1.2; }
    .tt-card .meta { font-size:11px; opacity:.8; }
    .tt-card .close { position:absolute; right:6px; top:4px; font-size:12px; color:#DC2626; }
    .tt-sticky { position: sticky; background:#fff; z-index: 2; }
    .tt-day-head { font-weight:700; display:flex; align-items:center; gap:8px; }
    .tt-day-chip { display:inline-block; width:12px; height:12px; border-radius:3px; box-shadow:0 0 0 1px rgba(0,0,0,.08) inset; }
    .tt-head-drop { border:1px dashed rgba(0,0,0,.2); border-radius:10px; padding:4px 8px; font-size:12px; color:#374151; }
    .tt-head-drop.tt-hover { background:#ECFDF5; border-color:#10B981; color:#065F46; }
    `;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }, []);

  const minWidthPx = Math.max(1, dias.length) * COL_W_PX + 120;

  /* ---------------------- Render ---------------------- */
  return (
    <div className="flex gap-4">
      {/* Sidebar */}
      <aside className="min-w-[260px]">
        <h4 className="font-bold mb-2">Bases</h4>
        <div className="space-y-2">
          {basesDisponiveis.map((p) => (
            <div
              key={'base-' + p.id}
              className="px-2 py-1 border rounded text-sm bg-emerald-50 cursor-move"
              draggable
              onDragStart={() => startDragFromSidebar(p)}
              title="Arraste para o cabeçalho (define início) ou para um horário (divide o dia)"
            >
              🏠 {p.label}
            </div>
          ))}
        </div>

        <h4 className="font-bold mt-4 mb-2">Pontos de interesse</h4>
        <div className="space-y-2">
          {pontosDisponiveis.map((p) => (
            <div
              key={p.id}
              className="px-2 py-1 border rounded text-sm bg-blue-50 cursor-move"
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
        className="flex-1 rounded border shadow-sm overflow-auto bg-white tt-board"
        style={{ height: heightPx + 'px', minHeight: heightPx + 'px', minWidth: minWidthPx + 'px' }}
      >
        {/* Cabeçalho */}
        <div
          className="grid tt-sticky top-0"
          style={{ gridTemplateColumns: `120px repeat(${dias.length}, ${COL_W_PX}px)` }}
        >
          <div className="h-12 border-b border-r flex items-center justify-center text-xs text-gray-500">
            Horário
          </div>
          {dias.map((d, diaIndex) => {
            const dayColor = colorForDay(diaIndex);
            return (
              <div
                key={'head-' + d.data}
                className="h-12 border-b border-r flex items-center justify-between px-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOnHeader(diaIndex)}
                style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.02), rgba(0,0,0,0))' }}
              >
                <span className="tt-day-head">
                  <span className="tt-day-chip" aria-hidden style={{ background: dayColor }} />
                  {d.data}
                </span>
                <span className="tt-head-drop">Solte uma <b>base</b> aqui para definir o início</span>
              </div>
            );
          })}
        </div>

        {/* Grid + Colunas */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `120px repeat(${dias.length}, ${COL_W_PX}px)`, width: minWidthPx + 'px' }}
        >
          {/* Horários (stick left) */}
          <div className="tt-sticky left-0 bg-white">
            {CELL_STARTS.map((min) => (
              <div
                key={'lbl-' + min}
                className="border-b border-r flex items-start justify-center text-sm font-medium"
                style={{ height: SLOT_PX + 'px' }}
              >
                {minutesToLabel(min)}
              </div>
            ))}
            <div className="border-r" style={{ height: '1px' }} />
            <div className="border-r flex items-start justify-center text-xs text-gray-500 pb-2">19:00</div>
          </div>

          {/* Colunas por dia */}
          {dias.map((dia, diaIndex) => {
            const dayColor = colorForDay(diaIndex);
            const colTint = dayColor + '22'; // leve transparência
            return (
              <div key={'col-' + dia.data} className="relative border-r" style={{ background: `linear-gradient(0deg, ${colTint}, transparent 60%)` }}>
                <div
                  className="relative"
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
                      onDrop={() => dropOnSlot(diaIndex, min)}
                      title={`Soltar em ${minutesToLabel(min)}`}
                    />
                  ))}

                  {/* Cards */}
                  {dia.pontos
                    .filter(p => p.id !== baseMarkerIdForDay(dia.data))
                    .sort(byTime)
                    .map((ponto, pontoIndex) => {
                      const start = typeof ponto.inicioMin === 'number' ? snapToSlot(ponto.inicioMin) : null;
                      const dur = ponto.tipo === 'interesse' ? Math.max(SLOT_MIN, ponto.tempo || SLOT_MIN) : SLOT_MIN;
                      const end = start !== null ? Math.min(DAY_END_MIN, start + dur) : null;
                      const span = start !== null ? Math.max(1, Math.ceil((end! - start) / SLOT_MIN)) : 1;
                      const rowIndex = start !== null ? Math.round((start - DAY_START_MIN) / SLOT_MIN) + 1 : 1;

                      const isBaseStart = ponto.id === `base-start-${dia.data}`;
                      const isBaseEnd   = ponto.id === `base-end-${dia.data}`;
                      const isBase      = ponto.tipo === 'base' || isBaseStart || isBaseEnd;
                      const kind        = isBase ? 'base' : 'poi';
                      const canDrag     = isBaseEnd || isBaseStart || (!isBase);

                      return (
                        <div
                          key={ponto.id + '@' + (ponto.inicioMin ?? 'x')}
                          style={start !== null ? { gridRow: `${rowIndex} / span ${span}`, margin: '6px' } : { margin: '6px' }}
                          className={`tt-card ${kind} px-2 py-1 border text-xs`}
                          draggable={canDrag}
                          onDragStart={() => startDragCard(diaIndex, pontoIndex, ponto)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (!dragItem) return;
                            if (start === null) return;
                            dropOnSlot(diaIndex, start);
                          }}
                          title={
                            isBaseStart ? '🏠 Início do dia (arraste para usar esta base em outro ponto do dia)'
                            : isBaseEnd ? '🏁 Término do dia (arraste para mudar horário)'
                            : 'Arraste para outro horário/dia'
                          }
                        >
                          <div className="bar" style={{ background: dayColor }} />
                          <div className="title truncate">
                            {isBaseStart ? `🏠 Início — ${ponto.label}`
                             : isBaseEnd ?  `🏁 Término — ${ponto.label}`
                             : ponto.label}
                          </div>
                          {!isBase && (
                            <div className="meta">{Math.max(SLOT_MIN, ponto.tempo || SLOT_MIN)} min</div>
                          )}
                          {!isBase && (
                            <button
                              className="close"
                              title="Remover"
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = cloneRoteiro(roteiro);
                                const src = updated[diaIndex] ?? dia;
                                const srcCopy = { ...src, pontos: [...src.pontos] };
                                const idx = srcCopy.pontos.findIndex(pp => pp.id === ponto.id);
                                if (idx >= 0) srcCopy.pontos.splice(idx, 1);
                                updated[diaIndex] = srcCopy;

                                if (typeof onUpdateDisponiveis === 'function') {
                                  onUpdateDisponiveis(dedupeById([...pontosDisponiveis, { ...ponto }]));
                                }
                                propagate(updated);
                              }}
                            >
                              ✕
                            </button>
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
