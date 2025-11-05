/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */
/* eslint-disable */
/* @ts-nocheck */

/* ========= PluginDependencies ========= */
const __PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = __PD.React;

/* UI/Serviços expostos pelo host (com prefixo para evitar colisões) */
const TT_GoBackButton      = __PD.GoBackButton;
const TT_useMenu           = __PD.useMenu;
const TT_Direction         = __PD.Direction;               // só p/ runtime; tipagem evitada
const TT_directionService  = __PD.directionService;
const TT_pinService        = __PD.pinService;
const { MdOutlineMap: TT_MdOutlineMap } = (__PD.ReactIcons?.md ?? {}) as any;

/* Componentes do plugin */
import { RoteiroForm } from './components/RoteiroForm';
import { RoteiroResumo } from './components/RoteiroResumo';
import { TravelPlannerBoard } from './components/TravelPlannerBoard';
import { generateInitialBoard } from './components/generateInitialBoard';
import { convertToDiaRoteiro } from './components/convertToDiaRoteiro';

/* ========= Paleta por dia ========= (RGBA) */
const DAY_COLORS: number[][] = [
  [ 59, 130, 246, 0.95 ], // azul
  [ 16, 185, 129, 0.95 ], // esmeralda
  [234, 179,   8, 0.95 ], // amarelo
  [244,  63,  94, 0.95 ], // rose
  [139,  92, 246, 0.95 ], // violeta
  [245, 158,  11, 0.95 ], // amber
  [ 34, 197,  94, 0.95 ], // green
  [239,  68,  68, 0.95 ], // red
];
const colorForDay = (i: number) => DAY_COLORS[i % DAY_COLORS.length];
const rgbaToHex = ([r,g,b]: number[]) =>
  `#${[r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')}`;

/* ========= Helpers ========= */
function idForMapPin(point: any, dayIndex: number, date?: string, kind?: 'base'|'poi') {
  // se veio do PluginMapInput, preserve o ID para sobrescrever a gotinha
  if (point?.uid) return `point-${point.uid}`;
  // fallback estável
  const base = point?.id || point?.label || `${point.coordinates?.[0]},${point.coordinates?.[1]}`;
  return `pin::${date ?? 'nodate'}::${dayIndex}::${kind ?? 'poi'}::${base}`;
}
function isBaseId(id?: string) {
  if (!id) return false;
  return id.startsWith('base-start-') || id.startsWith('base-end-') || id.startsWith('__base_of_');
}
function orderedDaysForRouting(board: any[]) {
  return (board || []).map((d) => {
    const start = (d?.pontos || []).find((p: any) => String(p?.id) === `base-start-${d?.data}`);
    const end   = (d?.pontos || []).find((p: any) => String(p?.id) === `base-end-${d?.data}`);
    const pois  = (d?.pontos || []).filter((p: any) => p?.tipo === 'interesse');
    const seq: any[] = [];
    if (start) seq.push(start);
    seq.push(...pois);
    if (end) seq.push(end);
    return { ...d, pontos: seq.length ? seq : (d?.pontos || []) };
  });
}
function boardSignature(board: any[]): string {
  return (board || []).map(d => {
    const ids = (d?.pontos || []).map((p: any) => (p?.uid ? `point-${p.uid}` : p?.id)).filter(Boolean);
    const pairs: string[] = [];
    for (let i = 0; i < ids.length - 1; i++) pairs.push(`${ids[i]}->${ids[i+1]}`);
    return `${d?.data ?? ''}::${pairs.join('|')}`;
  }).join('||');
}

/* ========= Pins ========= */
async function replaceAllPins(features: any[]) {
  if (!TT_pinService) return;
  try {
    if (typeof TT_pinService.updateAllPins === 'function') return void (await TT_pinService.updateAllPins(features));
    if (typeof TT_pinService.setPins       === 'function') return void (await TT_pinService.setPins(features));
    if (typeof TT_pinService.replaceAll    === 'function') return void (await TT_pinService.replaceAll(features));
    if (typeof TT_pinService.clear         === 'function') await TT_pinService.clear();
    if (typeof TT_pinService.addPins       === 'function') await TT_pinService.addPins(features);
  } catch (e) {
    console.warn('[TerraTripper] Falha ao atualizar pins:', e);
  }
}
function buildPinsFromBoard(board: any[]) {
  const pins: any[] = [];
  for (let dayIndex = 0; dayIndex < board.length; dayIndex++) {
    const day  = board[dayIndex];
    const rgba = colorForDay(dayIndex) as [number,number,number,number];
    const hex  = rgbaToHex(rgba);
    for (const p of (day?.pontos || [])) {
      if (p?.id && p.id.startsWith('__base_of_')) continue; // marcador invisível
      const kind: 'base'|'poi' = (p?.tipo === 'base') || isBaseId(p?.id) ? 'base' : 'poi';
      pins.push({
        type: 'Feature',
        id: idForMapPin(p, dayIndex, day?.data, kind),
        geometry: { type: 'Point', coordinates: p.coordinates },
        properties: {
          kind,
          label: p?.label,
          colorHex: hex,
          colorRGBA: rgba,
          day: day?.data,
          dayIndex,
        },
      });
    }
  }
  return pins;
}

/* ========= Componente principal ========= */
function TerraTripperPluginContent() {
  const { changeMenuOption } = TT_useMenu();

  const [formRoteiro, setFormRoteiro] = _R.useState<any>(null);
  const [directions, setDirections]   = _R.useState<any[]>([]);
  const [board, setBoard]             = _R.useState<any[]>([]);      // dias normalizados
  const [disponiveis, setDisponiveis] = _R.useState<any[]>([]);
  const [mostrarQuadro, setMostrar]   = _R.useState(false);
  const [hover, setHover]             = _R.useState(false);

  const recomputeLockRef = _R.useRef(false);
  const queuedBoardRef   = _R.useRef<any[] | null>(null);
  const lastSigRef       = _R.useRef<string>('');
  const tokenRef         = _R.useRef(0);

  // sempre deixamos habilitado redesenho de rotas ao mexer no Board
  _R.useEffect(() => { (window as any).TT_DRAW_ROUTES = true; }, []);

  async function clearAllRoutes(prevList?: any[]) {
    try {
      let any = false;
      if (TT_directionService?.clear)       { await TT_directionService.clear(); any = true; }
      if (TT_directionService?.clearSource) { await TT_directionService.clearSource(); any = true; }
      if (TT_directionService?.reset)       { await TT_directionService.reset(); any = true; }
      if (TT_directionService?.removeAll)   { await TT_directionService.removeAll(); any = true; }
      if (!any && prevList?.length && TT_directionService?.removeDirection) {
        for (const d of prevList) await TT_directionService.removeDirection(d.id);
      }
    } catch (e) {
      console.warn('Não foi possível limpar rotas antigas:', e);
    }
  }

  /** ==================== O coração: recalcula rotas + cores + métricas ==================== */
  const recomputeRoutes = _R.useCallback(async (novoBoard: any[]) => {
    const sig = boardSignature(novoBoard);
    if (sig === lastSigRef.current) return;

    if (recomputeLockRef.current) {
      queuedBoardRef.current = novoBoard;
      return;
    }
    recomputeLockRef.current = true;
    queuedBoardRef.current = null;
    lastSigRef.current = sig;

    const myToken = ++tokenRef.current;

    try {
      // PINS — sobrescreve gotinhas com as cores do dia
      await replaceAllPins(buildPinsFromBoard(novoBoard));

      // LIMPA DIREÇÕES
      await clearAllRoutes(directions);
      setDirections([]);

      const ordered = orderedDaysForRouting(novoBoard);
      const { fetchDirectionsController } = __PD;

      const novas: any[] = [];
      const viagensPorDia: any[] = [];
      const durationIndex: Record<string, number> = {}; // "lon1,lat1|lon2,lat2" -> minutos

      for (let dayIndex = 0; dayIndex < ordered.length; dayIndex++) {
        const dia   = ordered[dayIndex];
        const pts   = (dia?.pontos || []);
        const rgba  = colorForDay(dayIndex);
        const hex   = rgbaToHex(rgba);

        const legs: any[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
          if (myToken !== tokenRef.current) return; // cancelado

          const origin = pts[i];
          const destination = pts[i + 1];
          const [ol, oa] = origin.coordinates || [];
          const [dl, da] = destination.coordinates || [];
          if (ol === dl && oa === da) continue;

          try {
            const result: any = await fetchDirectionsController.execute({
              origin, destination,
              profile: 'driving-car',
              preference: 'recommended',
              options: { avoidBorders: 'none', avoidFeatures: { highways: false, tollways: false, ferries: false } },
            });

            const props: any = (result?.geojson?.properties ?? {});
            props.color = rgba;               // nosso Direction lê isso
            props.colorHex = hex;
            props.colorIndex = dayIndex % DAY_COLORS.length;
            (result.geojson.properties = props);

            await TT_directionService.addDirection(result);
            try {
              result.setStrokeColor?.(hex);
              TT_directionService.updateDirectionStyle?.(result.id, { color: hex, width: 4 });
              TT_directionService.setColor?.(result.id, hex);
            } catch {}

            novas.push(result);

            const summary = props?.summary || result?.geojson?.properties?.summary || {};
            const distKm = typeof summary.distance === 'number' ? (summary.distance / 1000) : undefined;
            const durMin = typeof summary.duration === 'number' ? Math.round(summary.duration / 60) : undefined;

            legs.push({
              a: origin.coordinates, b: destination.coordinates,
              from: origin?.label ?? `${origin.coordinates}`,
              to:   destination?.label ?? `${destination.coordinates}`,
              distance_km: typeof distKm === 'number' ? Math.round(distKm) : 0,
              eta_min:     typeof durMin === 'number' ? Math.max(1, durMin) : 0,
            });

            if (origin?.coordinates && destination?.coordinates && typeof durMin === 'number') {
              const key = `${origin.coordinates[0]},${origin.coordinates[1]}|${destination.coordinates[0]},${destination.coordinates[1]}`;
              durationIndex[key] = Math.max(1, Math.round(durMin));
            }
          } catch (e) {
            console.warn('Falha ao calcular trecho:', e);
          }
        }

        viagensPorDia.push({
          day: dia?.data,
          color: hex,
          colorRGBA: rgba,
          legs,
          total_km: legs.reduce((a, l) => a + (l.distance_km || 0), 0),
          total_min: legs.reduce((a, l) => a + (l.eta_min || 0), 0),
        });
      }

      // 🔴 Board lê estes objetos para chips “km/min” e “→ X min”
      (window as any).TT_VIAGENS = viagensPorDia;
      (window as any).TT_ROUTE_DURATIONS = durationIndex;

      if (myToken === tokenRef.current) setDirections(novas);
    } finally {
      recomputeLockRef.current = false;
      if (queuedBoardRef.current) {
        const next = queuedBoardRef.current;
        queuedBoardRef.current = null;
        void recomputeRoutes(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directions]);

  /* ==================== Submit inicial (Form) ==================== */
  async function handleSubmit(formData: any) {
    setFormRoteiro(formData);

    // preview neutro (cinza) entre os pontos do formulário
    try {
      if (formData?.pontos?.length >= 2) {
        await clearAllRoutes(directions);
        setDirections([]);

        const { fetchDirectionsController } = __PD;
        const temp: any[] = [];
        for (let i = 0; i < formData.pontos.length - 1; i++) {
          const origin = formData.pontos[i];
          const destination = formData.pontos[i + 1];
          if (!origin?.coordinates || !destination?.coordinates) continue;

          const result: any = await fetchDirectionsController.execute({
            origin, destination,
            profile: 'driving-car',
            preference: 'recommended',
            options: { avoidBorders: 'none', avoidFeatures: { highways: false, tollways: false, ferries: false } },
          });

          const props: any = (result?.geojson?.properties ?? {});
          props.color = [100,116,139,0.95]; // slate-500
          props.colorHex = '#64748b';
          props.colorIndex = -1;
          (result.geojson.properties = props);

          await TT_directionService.addDirection(result);
          temp.push(result);
        }
        setDirections(temp);

        // pins neutros sobrescrevendo ids do MapInput
        if (TT_pinService) {
          const neutrals = (formData.pontos || [])
            .filter((p: any) => Array.isArray(p?.coordinates) && p.coordinates.length === 2)
            .map((p: any, idx: number) => ({
              type: 'Feature',
              id: p?.uid ? `point-${p.uid}` : `point-fallback-${idx}`,
              geometry: { type: 'Point', coordinates: p.coordinates as [number,number] },
              properties: {
                kind: p?.tipo === 'base' ? 'base' : 'poi',
                label: p?.label,
                colorHex: '#64748b',
                colorRGBA: [100,116,139,0.95],
              }
            }));
          await replaceAllPins(neutrals);
        }
      }
    } catch (e) {
      console.warn('Rota inicial (form) falhou:', e);
    }

    // gera Board inicial e já desenha colorido
    try {
      const initialBoard = await generateInitialBoard(formData);
      const diasRoteiro  = convertToDiaRoteiro(initialBoard, formData.pontos);
      setBoard(diasRoteiro);
      setDisponiveis([]);

      lastSigRef.current = boardSignature(diasRoteiro);
      await recomputeRoutes(diasRoteiro);
    } catch (e) {
      console.error('Erro ao preparar/desenhar rotas iniciais:', e);
    }
  }

  /* ==================== Catálogo de bases para o Board ==================== */
  const toKey = _R.useCallback((p: any) => (p?.id ?? `${p?.label}|${p?.coordinates?.[0]},${p?.coordinates?.[1]}`), []);
  const baseCatalog = _R.useMemo(() => {
    const pts = (formRoteiro?.pontos ?? []).filter((p: any) => p && p.tipo === 'base');
    const pairs = pts.map((p: any) => [toKey(p), p]);
    return Array.from(new Map(pairs).values());
  }, [formRoteiro, toKey]);

  /* ==================== Render ==================== */
  return (
    <main className="p-4 flex flex-col gap-4 relative">
      {typeof TT_GoBackButton === 'function' ? (
        <TT_GoBackButton
          title="TerraTripper"
          icon={TT_MdOutlineMap ?? (() => <span>📍</span>)}
          onGoBack={() => changeMenuOption(undefined)}
        />
      ) : (
        <div className="text-red-500 font-bold">Erro: GoBackButton não está disponível</div>
      )}

      <h2 className="text-xl font-bold">Planejador de Roteiro de Viagem</h2>

      <RoteiroForm onSubmit={handleSubmit} />

      {formRoteiro && (
        <>
          <RoteiroResumo roteiro={formRoteiro} directions={directions} />

          {!mostrarQuadro && (
            <div className="w-full mt-4">
              <button
                onClick={() => setMostrar(true)}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{
                  ...styles.botaoPrincipal,
                  backgroundColor: hover ? '#1D4ED8' : styles.botaoPrincipal.backgroundColor,
                }}
              >
                Abrir Quadro de Planejamento
              </button>
            </div>
          )}

          {mostrarQuadro && (
            <div
              className="fixed bottom-0 z-40 bg-white border-t border-l border-gray-300 shadow-xl p-4"
              style={{ left: '380px', width: 'calc(100% - 380px)', height: '60vh', overflow: 'auto' }}
            >
              <TravelPlannerBoard
                roteiro={board}
                onUpdateRoteiro={setBoard}
                pontosDisponiveis={disponiveis}
                baseCatalog={baseCatalog}
                onUpdateDisponiveis={setDisponiveis}
                onRebuildRoutes={recomputeRoutes}   // <- board chamará SEMPRE
              />

              <div className="mt-4">
                <button onClick={() => setMostrar(false)} style={styles.botaoFechar}>
                  Fechar Quadro
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function Planejamento_Viagem() {
  return <TerraTripperPluginContent />;
}

const styles = {
  botaoPrincipal: {
    backgroundColor: '#2563EB',
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    transition: 'background-color 0.2s ease-in-out',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    maxWidth: 'fit-content' as const,
  },
  botaoFechar: {
    backgroundColor: '#DC2626',
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
};
