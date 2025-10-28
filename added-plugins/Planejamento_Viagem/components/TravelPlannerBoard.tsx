/* eslint-disable @typescript-eslint/no-explicit-any */

// Pega dependências já SERVIDAS pelo TerraPlanner
const PD: any = (window as any).PluginDependencies || {};
const R: typeof import('react') = PD.React;
const h = R.createElement;

// ---------------------- Tipos ----------------------
type DiaRoteiro = { data: string; pontos: PontoRoteiro[] };

type PontoRoteiro = {
  id: string;
  label: string;
  tipo: 'base' | 'interesse';
  tempo?: number;                 // duração em minutos (POI)
  fixo?: boolean;                 // âncoras base do dia
  coordinates: [number, number];
  inicioMin?: number;             // minutos desde 00:00 (ex.: 9h => 540)
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

// ---------------------- Constantes de agenda ----------------------
const DAY_START_MIN = 8 * 60;      // 08:00
const DAY_END_MIN   = 19 * 60;     // 19:00 (fim do dia)
const SLOT_MIN      = 30;          // 30 min por slot
const SLOT_PX       = 28;          // altura visual do slot
const COL_W_PX      = 280;         // largura de cada dia
const END_SLOT_START = DAY_END_MIN - SLOT_MIN; // 18:30

const NUM_ROWS = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;
const CELL_STARTS: number[] = Array.from({ length: NUM_ROWS }, (_, i) => DAY_START_MIN + i * SLOT_MIN);

// ---------------------- Utils ----------------------
const pad2 = (n: number) => String(n).padStart(2, '0');
const minutesToLabel = (m: number) => `${pad2(Math.floor(m/60))}:${pad2(m%60)}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const snapToSlot = (min: number) => {
  const c = clamp(min, DAY_START_MIN, DAY_END_MIN - SLOT_MIN);
  return DAY_START_MIN + Math.floor((c - DAY_START_MIN) / SLOT_MIN) * SLOT_MIN;
};

function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of arr) if (!map.has(it.id)) map.set(it.id, it);
  return Array.from(map.values());
}

function byHorario(a: PontoRoteiro, b: PontoRoteiro) {
  const ai = typeof a.inicioMin === 'number' ? a.inicioMin : Number.MAX_SAFE_INTEGER;
  const bi = typeof b.inicioMin === 'number' ? b.inicioMin : Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  if (a.tipo !== b.tipo) return a.tipo === 'base' ? -1 : 1;
  return String(a.label).localeCompare(String(b.label));
}

function cloneRoteiro(r: DiaRoteiro[]): DiaRoteiro[] {
  return r.map(d => ({ ...d, pontos: [...d.pontos] }));
}

function boardSignature(days: DiaRoteiro[]): string {
  return days.map(d => {
    const ids = d.pontos
      .map(p => `${p.id}@${typeof p.inicioMin === 'number' ? p.inicioMin : 'x'}`)
      .join(',');
    return `${d.data}:${ids}`;
  }).join('|');
}

const baseMarkerIdForDay = (dateStr: string) => `__base_of_${dateStr}`;

function getBaseMarker(dia: DiaRoteiro): PontoRoteiro | null {
  const id = baseMarkerIdForDay(dia.data);
  return dia.pontos.find(p => p.id === id) || null;
}

function setBaseMarker(dia: DiaRoteiro, base: PontoRoteiro): DiaRoteiro {
  const id = baseMarkerIdForDay(dia.data);
  const others = dia.pontos.filter(p => p.id !== id);
  return {
    ...dia,
    pontos: [
      ...others,
      { id, label: base.label, tipo: 'base', fixo: false, coordinates: base.coordinates } // sem inicioMin => invisível
    ]
  };
}

// Âncoras visuais 08:00 e 18:30 (início/fim)
function ensureAnchorsForDay(dia: DiaRoteiro): DiaRoteiro {
  const marker = getBaseMarker(dia);
  if (!marker) {
    // sem base definida ainda => mantém só POIs
    return { ...dia, pontos: dia.pontos.filter(p => p.tipo === 'interesse') };
  }
  const anchors: PontoRoteiro[] = [
    { id: `base-inicio-${dia.data}`, label: marker.label, tipo: 'base', fixo: true, coordinates: marker.coordinates, inicioMin: DAY_START_MIN },
    { id: `base-fim-${dia.data}`,    label: marker.label, tipo: 'base', fixo: true, coordinates: marker.coordinates, inicioMin: END_SLOT_START },
  ];
  const keep = dia.pontos.filter(p => p.tipo === 'interesse' || p.id === baseMarkerIdForDay(dia.data));
  return { ...dia, pontos: dedupeById([...anchors, ...keep]) };
}

// Distribui POIs entre as âncoras sem sobrepor e respeitando durações
function distributePoisBetweenAnchors(dia: DiaRoteiro): DiaRoteiro {
  const hasStart = dia.pontos.some(p => p.tipo === 'base' && p.fixo && p.inicioMin === DAY_START_MIN);
  const hasEnd   = dia.pontos.some(p => p.tipo === 'base' && p.fixo && p.inicioMin === END_SLOT_START);

  const pois = dia.pontos.filter(p => p.tipo === 'interesse');
  const fixed = dia.pontos.filter(p => p.tipo === 'base' && p.fixo);

  if (!hasStart || !hasEnd) {
    return { ...dia, pontos: [...fixed, ...pois] };
  }

  const occupied = new Set<number>([DAY_START_MIN, END_SLOT_START]);
  const placed: PontoRoteiro[] = [];
  let cursor = DAY_START_MIN + SLOT_MIN;

  for (const poi of pois) {
    const dur = Math.max(SLOT_MIN, poi.tempo || SLOT_MIN);
    let placedOne = false;

    while (cursor + dur <= DAY_END_MIN) {
      const start = snapToSlot(cursor);
      let ok = (start + dur) <= END_SLOT_START;
      for (let t = start; ok && t < start + dur; t += SLOT_MIN) {
        if (occupied.has(t)) ok = false;
      }
      if (ok) {
        const item = { ...poi, inicioMin: start };
        placed.push(item);
        for (let t = start; t < start + dur; t += SLOT_MIN) occupied.add(t);
        cursor = start + dur;
        placedOne = true;
        break;
      }
      cursor += SLOT_MIN;
      if (cursor > END_SLOT_START) break;
    }

    if (!placedOne) {
      // fallback tenta colar antes da âncora final
      const start = Math.max(DAY_START_MIN + SLOT_MIN, END_SLOT_START - (poi.tempo || SLOT_MIN));
      const s = snapToSlot(start);
      if (s >= DAY_START_MIN + SLOT_MIN && s <= END_SLOT_START - SLOT_MIN) {
        placed.push({ ...poi, inicioMin: s });
      }
    }
  }

  const marker = getBaseMarker(dia)!;
  const anchors: PontoRoteiro[] = [
    { id: `base-inicio-${dia.data}`, label: marker.label, tipo: 'base', fixo: true, coordinates: marker.coordinates, inicioMin: DAY_START_MIN },
    { id: `base-fim-${dia.data}`,    label: marker.label, tipo: 'base', fixo: true, coordinates: marker.coordinates, inicioMin: END_SLOT_START },
  ];
  const final = dedupeById([...anchors, ...placed, marker]).sort(byHorario);
  return { ...dia, pontos: final };
}

// ---------------------- Componente ----------------------
export function TravelPlannerBoard({
  roteiro,
  pontosDisponiveis,
  baseCatalog,
  onUpdateRoteiro,
  onUpdateDisponiveis,
  onRebuildRoutes,
  heightPx = 560,
}: Props) {
  if (!R) return null;

  const [dragItem, setDragItem] = R.useState<{
    ponto: PontoRoteiro;
    origem?: { diaIndex: number; pontoIndex: number };
    fromSidebar?: boolean;
  } | null>(null);

  // herda base do dia anterior ou usa a primeira do catálogo
  const withBaseMarkers = R.useMemo(() => {
    const out = roteiro.map(d => ({ ...d, pontos: [...d.pontos] }));
    let lastBase: PontoRoteiro | null = null;

    for (let i = 0; i < out.length; i++) {
      const d = out[i];
      let marker = getBaseMarker(d);
      if (!marker) {
        if (lastBase) out[i] = setBaseMarker(d, lastBase);
        else if (baseCatalog && baseCatalog.length) out[i] = setBaseMarker(d, baseCatalog[0]);
      }
      const m = getBaseMarker(out[i]);
      if (m) lastBase = m;
    }
    return out;
  }, [roteiro, baseCatalog]);

  const withAnchors = R.useMemo(
    () => withBaseMarkers.map(ensureAnchorsForDay),
    [withBaseMarkers]
  );

  const dias = R.useMemo(
    () => withAnchors.map(distributePoisBetweenAnchors),
    [withAnchors]
  );

  function processPipeline(src: DiaRoteiro[], catalog?: PontoRoteiro[]) {
    const out = src.map(d => ({ ...d, pontos: [...d.pontos] }));
    let last: PontoRoteiro | null = null;
    for (let i = 0; i < out.length; i++) {
      let m = getBaseMarker(out[i]);
      if (!m) {
        if (last) out[i] = setBaseMarker(out[i], last);
        else if (catalog && catalog.length) out[i] = setBaseMarker(out[i], catalog[0]);
      }
      m = getBaseMarker(out[i]);
      if (m) last = m;
    }
    const withA = out.map(ensureAnchorsForDay);
    const dist = withA.map(distributePoisBetweenAnchors);
    return dist.map(d => ({ ...d, pontos: dedupeById(d.pontos) }));
  }

  function safePropagate(nextDays: DiaRoteiro[]) {
    const nextSig = boardSignature(nextDays);
    const currSig = boardSignature(roteiro);
    if (nextSig !== currSig) {
      onUpdateRoteiro(nextDays);
      onRebuildRoutes?.(nextDays);
    }
    setDragItem(null);
  }

  function handleDragStart(
    ponto: PontoRoteiro,
    origem?: { diaIndex: number; pontoIndex: number },
    fromSidebar = false
  ) {
    if (ponto.fixo) return;
    setDragItem({ ponto, origem, fromSidebar });
  }

  function handleRemove(diaIndex: number, pontoIndex: number) {
    const p = roteiro[diaIndex]?.pontos[pontoIndex];
    if (!p || p.fixo) return;

    const updated = cloneRoteiro(roteiro);
    updated[diaIndex].pontos.splice(pontoIndex, 1);

    if (p.tipo === 'interesse' && onUpdateDisponiveis) {
      const still = updated.some(d => d.pontos.some(pp => pp.id === p.id));
      if (!still) onUpdateDisponiveis(dedupeById([...pontosDisponiveis, { ...p }]));
    }

    const staged = processPipeline(updated, baseCatalog);
    safePropagate(staged);
  }

  // drop em um slot: se for base => define base do dia; se for POI => agenda no slot
  function handleDropToSlot(diaIndex: number, slotMin: number) {
    if (!dragItem) return;
    const updated = cloneRoteiro(roteiro);

    if (dragItem.ponto.tipo === 'base') {
      updated[diaIndex] = setBaseMarker(updated[diaIndex], dragItem.ponto);

      if (dragItem.origem) {
        const { diaIndex: oDia, pontoIndex: oIdx } = dragItem.origem;
        const src = updated[oDia]?.pontos[oIdx];
        if (src && !src.fixo) updated[oDia].pontos.splice(oIdx, 1);
      }

      const staged = processPipeline(updated, baseCatalog);
      safePropagate(staged);
      return;
    }

    // interesse
    if (dragItem.origem) {
      const { diaIndex: oDia, pontoIndex: oIdx } = dragItem.origem;
      const src = updated[oDia]?.pontos[oIdx];
      if (src && !src.fixo) updated[oDia].pontos.splice(oIdx, 1);
    }

    // sem duplicar interesse globalmente
    if (updated.some(d => d.pontos.some(p => p.id === dragItem.ponto.id))) {
      setDragItem(null);
      return;
    }

    const destino = updated[diaIndex];
    destino.pontos.push({ ...dragItem.ponto, inicioMin: snapToSlot(slotMin) });

    if (dragItem.fromSidebar && dragItem.ponto.tipo === 'interesse' && onUpdateDisponiveis) {
      onUpdateDisponiveis(pontosDisponiveis.filter(p => p.id !== dragItem.ponto.id));
    }

    const staged = processPipeline(updated, baseCatalog);
    safePropagate(staged);
  }

  // Sidebar: bases disponíveis (catálogo > fallback dos dias)
  const basesDisponiveis: PontoRoteiro[] = R.useMemo(() => {
    const raw = (baseCatalog && baseCatalog.length)
      ? baseCatalog
      : roteiro.flatMap(d => d.pontos.filter(p => p.tipo === 'base' && !p.fixo));
    return dedupeById(raw);
  }, [baseCatalog, roteiro]);

  // Tema leve (uma vez)
  R.useEffect(() => {
    const id = 'tt-grid-theme-v5';
    if (document.getElementById(id)) return;
    const css = `
      .tt-board .slot { border-bottom: 1px solid rgba(0,0,0,.06); }
      .tt-board .slot:nth-child(odd) { background: rgba(0,0,0,.02); }
      .tt-card {
        border-radius: 10px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        position: relative;
        overflow: hidden;
      }
      .tt-card .bar { position:absolute; left:0; top:0; bottom:0; width:4px; opacity:.85; }
      .tt-card.base { background:#ECFDF5; border:1px solid #A7F3D0; color:#065F46; }
      .tt-card.base .bar { background:#10B981; }
      .tt-card.poi  { background:#EFF6FF; border:1px solid #BFDBFE; color:#0B2545; }
      .tt-card.poi  .bar { background:#3B82F6; }
      .tt-card.fixo { opacity:.98; }
      .tt-sticky { position: sticky; background:#fff; z-index: 2; }
      .tt-title { font-weight:700; font-size:12px; line-height:1.2; }
      .tt-meta { font-size:10px; opacity:.75; }
      .tt-remove { position:absolute; right:4px; top:2px; font-size:10px; color:#DC2626; }
    `;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }, []);

  const minWidthPx = Math.max(1, dias.length) * COL_W_PX + 120;

  // -------- Render --------
  return h(
    'div',
    { className: 'flex gap-4' },

    // Sidebar
    h(
      'aside',
      { className: 'min-w-[260px]' },
      h('h4', { className: 'font-bold mb-2' }, 'Bases'),
      h(
        'div',
        { className: 'space-y-2' },
        ...basesDisponiveis.map((p) =>
          h(
            'div',
            {
              key: 'base-' + p.id,
              className: 'px-2 py-1 border rounded text-sm bg-emerald-50 cursor-move',
              draggable: true,
              onDragStart: () => handleDragStart(p, undefined, true),
              title: 'Arraste para um dia para definir a base desse dia',
            },
            '🏠 ', p.label
          )
        )
      ),

      h('h4', { className: 'font-bold mt-4 mb-2' }, 'Pontos de interesse'),
      h(
        'div',
        { className: 'space-y-2' },
        ...pontosDisponiveis.map((p) =>
          h(
            'div',
            {
              key: p.id,
              className: 'px-2 py-1 border rounded text-sm bg-blue-50 cursor-move',
              draggable: true,
              onDragStart: () => handleDragStart(p, undefined, true),
              title: 'Arraste para um horário do dia',
            },
            '📍 ', p.label
          )
        )
      )
    ),

    // Board
    h(
      'section',
      {
        className: 'flex-1 rounded border shadow-sm overflow-auto bg-white tt-board',
        style: { height: heightPx + 'px', minHeight: heightPx + 'px', minWidth: minWidthPx + 'px' },
      },

      // Cabeçalho
      h(
        'div',
        {
          className: 'grid tt-sticky top-0',
          style: { gridTemplateColumns: `120px repeat(${dias.length}, ${COL_W_PX}px)` },
        },
        h(
          'div',
          { className: 'h-12 border-b border-r flex items-center justify-center text-xs text-gray-500' },
          'Horário'
        ),
        ...dias.map((d) =>
          h(
            'div',
            {
              key: 'head-' + d.data,
              className: 'h-12 border-b border-r flex items-center justify-center font-semibold',
            },
            d.data
          )
        )
      ),

      // Grade de horários e colunas dos dias
      h(
        'div',
        {
          className: 'grid relative',
          style: { gridTemplateColumns: `120px repeat(${dias.length}, ${COL_W_PX}px)`, width: minWidthPx + 'px' },
        },

        // Coluna de horários (sticky left)
        h(
          'div',
          { className: 'tt-sticky left-0' },
          ...CELL_STARTS.map((min) =>
            h(
              'div',
              {
                key: 'lbl-' + min,
                className: 'border-b border-r flex items-start justify-center text-sm font-medium',
                style: { height: SLOT_PX + 'px' },
              },
              minutesToLabel(min)
            )
          ),
          h('div', { className: 'border-r', style: { height: '1px' } }),
          h(
            'div',
            { className: 'border-r flex items-start justify-center text-xs text-gray-500 pb-2' },
            '19:00'
          )
        ),

        // Colunas por dia
        ...dias.map((dia, diaIndex) =>
          h(
            'div',
            { key: 'col-' + dia.data, className: 'relative border-r' },

            h(
              'div',
              { className: 'relative', style: { display: 'grid', gridTemplateRows: `repeat(${NUM_ROWS}, ${SLOT_PX}px)` } },

              // Slots dropáveis
              ...CELL_STARTS.map((min) =>
                h('div', {
                  key: dia.data + '-slot-' + min,
                  className: 'slot hover:bg-gray-100 transition-colors',
                  onDragOver: (e: DragEvent) => e.preventDefault(),
                  // @ts-ignore - React types não no escopo direto
                  onDrop: () => handleDropToSlot(diaIndex, min),
                  title: `Soltar em ${minutesToLabel(min)}`,
                })
              ),

              // Cards (âncoras + POIs)
              ...dia.pontos
                .filter(p => typeof p.inicioMin === 'number')
                .sort(byHorario)
                .map((ponto) => {
                  const start = snapToSlot(ponto.inicioMin!);
                  const dur = ponto.tipo === 'interesse' ? Math.max(SLOT_MIN, ponto.tempo || SLOT_MIN) : SLOT_MIN;
                  const end = Math.min(DAY_END_MIN, start + dur);
                  const span = Math.max(1, Math.ceil((end - start) / SLOT_MIN));
                  const rowIndex = Math.round((start - DAY_START_MIN) / SLOT_MIN) + 1;
                  if (rowIndex < 1 || rowIndex > NUM_ROWS) return null;

                  const kind = ponto.tipo === 'base' ? 'base' : 'poi';
                  const cls = `tt-card ${kind} ${ponto.fixo ? 'fixo' : ''}`;

                  const pIndex = roteiro[diaIndex].pontos.findIndex(
                    pp => pp.id === ponto.id && pp.inicioMin === ponto.inicioMin
                  );

                  return h(
                    'div',
                    {
                      key: ponto.id + '@' + ponto.inicioMin,
                      style: { gridRow: `${rowIndex} / span ${span}`, margin: '6px' },
                      className: `${cls} px-2 py-1 border text-xs`,
                      draggable: !ponto.fixo,
                      onDragStart: () => {
                        if (!ponto.fixo) {
                          handleDragStart(ponto, { diaIndex, pontoIndex: pIndex });
                        }
                      },
                      title: ponto.fixo ? 'Base do dia' : 'Arraste para outro horário/dia',
                    },
                    h('div', { className: 'bar' }),
                    h('div', { className: 'tt-title truncate' }, ponto.label),
                    ponto.tipo === 'interesse'
                      ? h('div', { className: 'tt-meta' }, `${Math.max(SLOT_MIN, ponto.tempo || SLOT_MIN)} min`)
                      : null,
                    !ponto.fixo
                      ? h(
                          'button',
                          {
                            className: 'tt-remove',
                            title: 'Remover',
                            onClick: (e: any) => {
                              e.stopPropagation();
                              handleRemove(diaIndex, pIndex);
                            },
                          },
                          '✕'
                        )
                      : null
                  );
                })
            )
          )
        )
      )
    )
  );
}

// Exportações
export default TravelPlannerBoard;
