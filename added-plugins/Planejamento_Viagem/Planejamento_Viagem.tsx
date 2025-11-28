/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */
/* eslint-disable */
/* @ts-nocheck */

/* ========= PluginDependencies ========= */
const __PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = __PD.React;

/* UI/Serviços expostos pelo host (com prefixo para evitar colisões) */
const TT_GoBackButton = __PD.GoBackButton;
const TT_useMenu = __PD.useMenu;
const TT_directionService = __PD.directionService;
const TT_pinService = __PD.pinService;

// Hooks/serviços via CONTRATO
const TT_useDirections = __PD.useDirections;
const TT_useRouteProfile = __PD.useRouteProfile;
const TT_useRange = __PD.useRange;
const TT_useRadius = __PD.useRadius;

// Ícones
const { MdOutlineMap: TT_MdOutlineMap } = (__PD.ReactIcons?.md ?? {}) as any;

// Metadados globais de contratos (preenchidos pelo host)
const __PI: any = (window as any).PluginInterfaces || {};

/* Componentes do plugin */
import { RoteiroForm } from './components/RoteiroForm';
import { RoteiroResumo } from './components/RoteiroResumo';
import { TravelPlannerBoard } from './components/TravelPlannerBoard';
import { generateInitialBoard } from './components/generateInitialBoard';
import { convertToDiaRoteiro } from './components/convertToDiaRoteiro';

/* ========= Paleta por dia ========= (15 cores, sem vermelho) */
const TT_PALETTE_15 = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#6366f1', '#14b8a6',
  '#a855f7', '#10b981', '#84cc16', '#06b6d4', '#f97316',
  '#3b82f6', '#8b5cf6', '#2dd4bf', '#65a30d', '#0891b2',
];

function ttHexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [
    parseInt(m[1], 16),
    parseInt(m[2], 16),
    parseInt(m[3], 16),
  ];
}

const DAY_COLORS: number[][] = TT_PALETTE_15.map((hex) => {
  const [r, g, b] = ttHexToRgb(hex);
  return [r, g, b, 0.95];   // alpha ~95%
});

const colorForDay = (i: number) => DAY_COLORS[i % DAY_COLORS.length];

const rgbaToHex = ([r, g, b]: number[]) =>
  `#${[r, g, b]
    .map(v =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/* ========= Helpers ========= */
function idForMapPin(
  point: any,
  dayIndex: number,
  date?: string,
  kind?: 'base' | 'poi',
) {
  if (point?.uid) return `point-${point.uid}`;
  const base =
    point?.id ||
    point?.label ||
    `${point.coordinates?.[0]},${point.coordinates?.[1]}`;
  return `pin::${date ?? 'nodate'}::${dayIndex}::${kind ?? 'poi'}::${base}`;
}

function isBaseId(id?: string) {
  if (!id) return false;
  return (
    id.startsWith('base-start-') ||
    id.startsWith('base-end-') ||
    id.startsWith('__base_of_')
  );
}

function orderedDaysForRouting(board: any[]) {
  return (board || []).map((d) => {
    // usa a ordem EXATA do board, apenas filtrando quem não tem coordenadas válidas
    const pts = (d?.pontos || []).filter(
      (p: any) =>
        p &&
        Array.isArray(p.coordinates) &&
        p.coordinates.length === 2
    );

    return {
      ...d,
      pontos: pts,
    };
  });
}

function boardSignature(board: any[]): string {
  return (board || [])
    .map(d => {
      const ids = (d?.pontos || [])
        .map((p: any) => (p?.uid ? `point-${p.uid}` : p?.id))
        .filter(Boolean);
      const pairs: string[] = [];
      for (let i = 0; i < ids.length - 1; i++) {
        pairs.push(`${ids[i]}->${ids[i + 1]}`);
      }
      return `${d?.data ?? ''}::${pairs.join('|')}`;
    })
    .join('||');
}

function toDirectionPointFromPluginPoint(point: any) {
  if (
    !point ||
    !Array.isArray(point.coordinates) ||
    point.coordinates.length !== 2
  ) {
    return null;
  }

  const [lon, lat] = point.coordinates;

  const baseLabel =
    point.label ||
    [point.name, point.city, point.uf].filter(Boolean).join(', ') ||
    `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

  return {
    id: String(point.id ?? point.uid ?? baseLabel),
    name: String(point.name ?? baseLabel),
    uf: point.uf ?? '',
    coordinates: point.coordinates,
  };
}

/* ========= Pins ========= */
async function replaceAllPins(features: any[]) {
  if (!TT_pinService) return;
  try {
    if (typeof TT_pinService.updateAllPins === 'function') {
      return void (await TT_pinService.updateAllPins(features));
    }
    if (typeof TT_pinService.setPins === 'function') {
      return void (await TT_pinService.setPins(features));
    }
    if (typeof TT_pinService.replaceAll === 'function') {
      return void (await TT_pinService.replaceAll(features));
    }
    if (typeof TT_pinService.clear === 'function') {
      await TT_pinService.clear();
    }
    if (typeof TT_pinService.addPins === 'function') {
      await TT_pinService.addPins(features);
    }
  } catch (e) {
    console.warn('[TerraTripper] Falha ao atualizar pins:', e);
  }
}

function buildPinsFromBoard(board: any[]) {
  const pins: any[] = [];
  for (let dayIndex = 0; dayIndex < board.length; dayIndex++) {
    const day = board[dayIndex];
    const rgba = colorForDay(dayIndex) as [
      number,
      number,
      number,
      number,
    ];
    const hex = rgbaToHex(rgba);
    for (const p of day?.pontos || []) {
      if (p?.id && p.id.startsWith('__base_of_')) continue;
      const kind: 'base' | 'poi' =
        p?.tipo === 'base' || isBaseId(p?.id) ? 'base' : 'poi';
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

/* ========= Catálogo de deps usadas (quase automático) ========= */
const RAW_DEPENDENCY_LABELS: Record<string, string> = {
  useDirections: 'useDirections (rotas)',
  useRouteProfile: 'useRouteProfile (perfil de rota)',
  useRange: 'useRange (isócronas)',
  useRadius: 'useRadius (raios)',
  pinService: 'pinService (pins no mapa)',
  directionService: 'directionService (direções legado)',
};

const RAW_DEPENDENCIES: Record<string, () => any> = {
  useDirections: () => TT_useDirections,
  useRouteProfile: () => TT_useRouteProfile,
  useRange: () => TT_useRange,
  useRadius: () => TT_useRadius,
  pinService: () => TT_pinService,
  directionService: () => TT_directionService,
};

/* ========= Componente principal ========= */
function TerraTripperPluginContent() {
  const { changeMenuOption } = TT_useMenu();

  // API de direções via contrato (hook do host)
  const directionsAPI = TT_useDirections ? TT_useDirections() : ({} as any);
  const {
    addDirection: addDirectionAPI,
    clearSource: clearDirectionsSourceAPI,
    saveDirection: saveDirectionAPI,
    renderDirections: renderDirectionsAPI,
  } = directionsAPI || {};

  // Perfil de rota (driving-car, etc) via contrato
  const routeProfile = TT_useRouteProfile
    ? TT_useRouteProfile()
    : { profile: 'driving-car', changeProfile: () => {} };

  // API de ranges (isócronas) via contrato
  const rangeAPI = TT_useRange ? TT_useRange() : ({} as any);
  const {
    addRange,
    saveRange,
    renderRanges,
    fetchRange,     // do contrato
    clearSource: clearRangeSource,
  } = rangeAPI || {};

  // API de raios (geometria simples) via contrato
  const radiusAPI = TT_useRadius ? TT_useRadius() : ({} as any);
  const {
    addRadius: addRadiusFeature,
    clearSource: clearRadiusSource,
  } = radiusAPI || {};

  const [formRoteiro, setFormRoteiro] = _R.useState<any>(null);
  const [directions, setDirections] = _R.useState<any[]>([]);
  const [board, setBoard] = _R.useState<any[]>([]);
  const [disponiveis, setDisponiveis] = _R.useState<any[]>([]);
  const [mostrarQuadro, setMostrar] = _R.useState(false);
  const [hover, setHover] = _R.useState(false);

  const [rangesLoading, setRangesLoading] = _R.useState(false);
  const [rangesError, setRangesError] = _R.useState<string | null>(null);

  const [radiusLoading, setRadiusLoading] = _R.useState(false);
  const [radiusError, setRadiusError] = _R.useState<string | null>(null);

  const [showDeps, setShowDeps] = _R.useState(false);

  const [routesSaving, setRoutesSaving] = _R.useState(false);
  const [routesSaveMessage, setRoutesSaveMessage] = _R.useState<string | null>(
    null,
  );

  const recomputeLockRef = _R.useRef(false);
  const queuedBoardRef = _R.useRef<any[] | null>(null);
  const lastSigRef = _R.useRef<string>('');
  const tokenRef = _R.useRef(0);

  // versões vindas dos próprios hooks (para título)
  const directionsAPIVersion =
    typeof TT_useDirections?.version === 'function'
      ? TT_useDirections.version()
      : 'hook';

  (window as any).TT_DIRECTIONS_API_VERSION = directionsAPIVersion;

  // Lista de dependências realmente usadas
  const depsUsed = _R.useMemo(() => {
    const pi: any = __PI || {};
    const list: {
      id: string;
      label: string;
      kind: string;
      version: string;
      description?: string;
    }[] = [];

    for (const key of Object.keys(RAW_DEPENDENCIES)) {
      const getter = RAW_DEPENDENCIES[key];
      if (typeof getter !== 'function') continue;
      const value = getter();
      if (!value) continue;

      const meta = pi[key] || {};
      const versionFromMeta = meta.version;
      const versionFromFn =
        typeof value?.version === 'function' ? value.version() : undefined;

      const version =
        versionFromMeta ||
        versionFromFn ||
        (key.startsWith('use') ? 'hook' : 'host');

      const label =
        meta.name ||
        RAW_DEPENDENCY_LABELS[key] ||
        key;

      const kind =
        meta.kind ||
        (key.startsWith('use') ? 'hook' : 'service');

      list.push({
        id: key,
        label,
        kind,
        version,
        description: meta.description,
      });
    }

    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  /* ==== Redraw “de segurança” quando o quadro abre ==== */
  _R.useEffect(() => {
    if (mostrarQuadro) {
      const ping = () => (window as any).TT_ON_BOARD_OPEN?.();
      ping();
      setTimeout(ping, 120);
      setTimeout(ping, 300);
    }
  }, [mostrarQuadro]);

  // tenta usar clearSource() do contrato; se não tiver, cai no serviço legado
  async function clearAllRoutes(prevList?: any[]) {
    try {
      if (typeof clearDirectionsSourceAPI === 'function') {
        await clearDirectionsSourceAPI();
        return;
      }
      let any = false;
      if (TT_directionService?.clear) {
        await TT_directionService.clear();
        any = true;
      }
      if (TT_directionService?.clearSource) {
        await TT_directionService.clearSource();
        any = true;
      }
      if (TT_directionService?.reset) {
        await TT_directionService.reset();
        any = true;
      }
      if (TT_directionService?.removeAll) {
        await TT_directionService.removeAll();
        any = true;
      }
      if (!any && prevList?.length && TT_directionService?.removeDirection) {
        for (const d of prevList) {
          await TT_directionService.removeDirection(d.id);
        }
      }
    } catch (e) {
      console.warn('Não foi possível limpar rotas antigas:', e);
    }
  }

  // calcula uma rota (HTTP) e desenha no mapa via contrato (ou fallback)
  async function computeSegment({
    origin,
    destination,
    colorRGBA,
    colorHex,
    colorIndex,
  }: {
    origin: any;
    destination: any;
    colorRGBA: [number, number, number, number];
    colorHex: string;
    colorIndex: number;
  }) {
    // Garantimos que há coordenadas
    if (!origin?.coordinates || !destination?.coordinates) return null;

    const [ol, oa] = origin.coordinates || [];
    const [dl, da] = destination.coordinates || [];
    if (ol === dl && oa === da) return null;

    // Convertemos para o tipo DirectionPoint do contrato,
    // garantindo "name" e "id"
    const originDP = toDirectionPointFromPluginPoint(origin);
    const destinationDP = toDirectionPointFromPluginPoint(destination);

    if (!originDP || !destinationDP) return null;

    let result: any = null;

    try {
      if (__PD.fetchDirectionsController) {
        result = await __PD.fetchDirectionsController.execute({
          origin: originDP,
          destination: destinationDP,
          profile: routeProfile?.profile ?? 'driving-car',
          preference: 'recommended',
          options: {
            avoidBorders: 'none',
            avoidFeatures: {
              highways: false,
              tollways: false,
              ferries: false,
            },
          },
        });
      } else {
        return null;
      }

      const props: any = result?.geojson?.properties ?? {};
      props.color = colorRGBA;
      props.colorHex = colorHex;
      props.colorIndex = colorIndex;
      result.geojson.properties = props;

      if (typeof addDirectionAPI === 'function') {
        await addDirectionAPI(result);
      } else if (TT_directionService?.addDirection) {
        await TT_directionService.addDirection(result);
      }

      try {
        result.setStrokeColor?.(colorHex);
        TT_directionService?.updateDirectionStyle?.(result.id, {
          color: colorHex,
          width: 4,
        });
        TT_directionService?.setColor?.(result.id, colorHex);
      } catch {}

      return result;
    } catch (e) {
      console.warn('Falha ao calcular trecho:', e);
      return null;
    }
  }

  /** ==================== Cálculo de rotas + cores + métricas ==================== */
  const recomputeRoutes = _R.useCallback(
    async (novoBoard: any[]) => {
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
        await replaceAllPins(buildPinsFromBoard(novoBoard));

        await clearAllRoutes(directions);
        setDirections([]);

        const ordered = orderedDaysForRouting(novoBoard);

        const novas: any[] = [];
        const viagensPorDia: any[] = [];
        const durationIndex: Record<string, number> = {};

        for (let dayIndex = 0; dayIndex < ordered.length; dayIndex++) {
          const dia = ordered[dayIndex];
          const pts = dia?.pontos || [];
          const rgba = colorForDay(dayIndex) as [
            number,
            number,
            number,
            number,
          ];
          const hex = rgbaToHex(rgba);

          const legs: any[] = [];
          for (let i = 0; i < pts.length - 1; i++) {
            if (myToken !== tokenRef.current) return;

            const origin = pts[i];
            const destination = pts[i + 1];

            const result: any = await computeSegment({
              origin,
              destination,
              colorRGBA: rgba,
              colorHex: hex,
              colorIndex: dayIndex % DAY_COLORS.length,
            });
            if (!result) continue;

            novas.push(result);

            const props = result?.geojson?.properties ?? {};
            const summary =
              props?.summary || result?.geojson?.properties?.summary || {};
            const distKm =
              typeof summary.distance === 'number'
                ? summary.distance / 1000
                : undefined;
            const durMin =
              typeof summary.duration === 'number'
                ? Math.round(summary.duration / 60)
                : undefined;

            legs.push({
              a: origin.coordinates,
              b: destination.coordinates,
              from: origin?.label ?? `${origin.coordinates}`,
              to: destination?.label ?? `${destination.coordinates}`,
              distance_km:
                typeof distKm === 'number' ? Math.round(distKm) : 0,
              eta_min:
                typeof durMin === 'number' ? Math.max(1, durMin) : 0,
            });

            if (
              origin?.coordinates &&
              destination?.coordinates &&
              typeof durMin === 'number'
            ) {
              const key = `${origin.coordinates[0]},${origin.coordinates[1]}|${destination.coordinates[0]},${destination.coordinates[1]}`;
              durationIndex[key] = Math.max(1, Math.round(durMin));
            }
          }

          viagensPorDia.push({
            day: dia?.data,
            color: hex,
            colorRGBA: rgba,
            legs,
            total_km: legs.reduce(
              (a, l) => a + (l.distance_km || 0),
              0,
            ),
            total_min: legs.reduce(
              (a, l) => a + (l.eta_min || 0),
              0,
            ),
          });
        }

        /* —— liga o fim do dia i ao início do dia i+1 —— */
        for (let i = 0; i < ordered.length - 1; i++) {
          const dayA = ordered[i];
          const dayB = ordered[i + 1];
          const lastA = (dayA?.pontos || []).slice(-1)[0];
          const firstB = (dayB?.pontos || [])[0];

          if (!lastA?.coordinates || !firstB?.coordinates) continue;
          const [ol, oa] = lastA.coordinates;
          const [dl, da] = firstB.coordinates;
          if (ol === dl && oa === da) continue;

          const rgba = colorForDay(i) as [
            number,
            number,
            number,
            number,
          ];
          const hex = rgbaToHex(rgba);

          const result: any = await computeSegment({
            origin: lastA,
            destination: firstB,
            colorRGBA: rgba,
            colorHex: hex,
            colorIndex: i % DAY_COLORS.length,
          });
          if (!result) continue;

          novas.push(result);

          const props = result?.geojson?.properties ?? {};
          const summary =
            props?.summary || result?.geojson?.properties?.summary || {};
          const distKm =
            typeof summary.distance === 'number'
              ? summary.distance / 1000
              : undefined;
          const durMin =
            typeof summary.duration === 'number'
              ? Math.round(summary.duration / 60)
              : undefined;

          viagensPorDia[i].legs.push({
            a: lastA.coordinates,
            b: firstB.coordinates,
            from: lastA?.label ?? `${lastA.coordinates}`,
            to: firstB?.label ?? `${firstB.coordinates}`,
            distance_km:
              typeof distKm === 'number' ? Math.round(distKm) : 0,
            eta_min:
              typeof durMin === 'number' ? Math.max(1, durMin) : 0,
          });
          viagensPorDia[i].total_km +=
            typeof distKm === 'number' ? Math.round(distKm) : 0;
          viagensPorDia[i].total_min +=
            typeof durMin === 'number' ? Math.max(1, durMin) : 0;

          if (typeof durMin === 'number') {
            const key = `${lastA.coordinates[0]},${lastA.coordinates[1]}|${firstB.coordinates[0]},${firstB.coordinates[1]}`;
            durationIndex[key] = Math.max(1, Math.round(durMin));
          }
        }
        /* —— FIM “liga-dias” —— */

        (window as any).TT_VIAGENS = viagensPorDia;
        (window as any).TT_ROUTE_DURATIONS = durationIndex;

        if (myToken === tokenRef.current) {
          setDirections(novas);
          requestAnimationFrame(() =>
            window.dispatchEvent(new Event('tt:please-redraw')),
          );
        }
      } finally {
        recomputeLockRef.current = false;
        if (queuedBoardRef.current) {
          const next = queuedBoardRef.current;
          queuedBoardRef.current = null;
          void recomputeRoutes(next);
        }
      }
    },
    [directions],
  );

  /* ==================== Isócronas nas bases (via contrato, sem hook dentro) ==================== */
   /* ==================== Isócronas nas bases (via contrato, sem hook dentro) ==================== */
  async function drawRangesForBases() {
    console.log('[TerraTripper] drawRangesForBases clicado');
    setRangesError(null);

    if (!board || !board.length) {
      setRangesError('Nenhum roteiro calculado ainda.');
      return;
    }

    if (!fetchRange || !addRange) {
      console.warn(
        '[TerraTripper] useRange.fetchRange ou addRange não disponível no hook.',
      );
      setRangesError(
        'API de isócrona (useRange.fetchRange) não está disponível neste ambiente.',
      );
      return;
    }

    try {
      setRangesLoading(true);

      // Opcional: limpar ranges existentes
      if (typeof clearRangeSource === 'function') {
        console.log('[TerraTripper] Limpando ranges anteriores com clearSource()');
        await clearRangeSource();
      }

      // ========= 1) Coletar bases únicas (por coordenada) =========
      type UniqueBase = {
        base: any;
        diaData?: string;
        dayIndex: number;
        colorHex: string;
        colorRGBA: [number, number, number, number];
      };

      const uniqueBases: UniqueBase[] = [];
      const seenCoords = new Set<string>();

      board.forEach((dia, dayIndex) => {
        const bases = (dia?.pontos || []).filter(
          (p: any) => p?.tipo === 'base',
        );

        const rgba = colorForDay(dayIndex) as [
          number,
          number,
          number,
          number
        ];
        const hex = rgbaToHex(rgba);

        for (const base of bases) {
          if (
            !Array.isArray(base.coordinates) ||
            base.coordinates.length !== 2
          ) {
            console.warn('[TerraTripper] Base sem coordenadas válidas:', base);
            continue;
          }

          const coordKey = `${base.coordinates[0]},${base.coordinates[1]}`;
          if (seenCoords.has(coordKey)) continue;
          seenCoords.add(coordKey);

          uniqueBases.push({
            base,
            diaData: dia?.data,
            dayIndex,
            colorHex: hex,
            colorRGBA: rgba,
          });
        }
      });

      console.log('[TerraTripper] Bases únicas para isócronas:', uniqueBases);

      if (!uniqueBases.length) {
        setRangesError('Nenhuma base com coordenadas válidas encontrada no roteiro.');
        return;
      }

      // ========= 2) Gerar isócrona para cada base única =========
      for (const { base, diaData, dayIndex, colorHex, colorRGBA } of uniqueBases) {
        const place = {
          id: base.id || base.uid || `base-${diaData || ''}`,
          name: base.label || base.name || 'Base',
          uf: base.uf || '',
          coordinates: base.coordinates, // [lon, lat]
        };

        const profile = routeProfile?.profile ?? 'driving-car';

        const params = {
          place,
          range: 30,        // 30 minutos
          interval: 10,     // 10 / 20 / 30
          maxRange: 30,
          rangeType: 'time',
          profile,
          options: {
            avoidBorders: 'none',
            avoidFeatures: {
              highways: false,
              tollways: false,
              ferries: false,
            },
          },
          previousRange: undefined,
        };

        console.log('[TerraTripper] Chamando fetchRange com params:', params);
        const range = await fetchRange(params);
        console.log('[TerraTripper] Range recebido:', range);

        // ===== injetar cor da PALETA DO DIA em todos os lugares possíveis =====
        try {
          // topo do objeto
          (range as any).colorHex = colorHex;
          (range as any).colorRGBA = colorRGBA;
          (range as any).dayIndex = dayIndex;
          (range as any).color = colorHex;
          (range as any).fillColor = colorHex;
          (range as any).strokeColor = colorHex;
          (range as any).outlineColor = colorHex;
          (range as any).style = {
            ...(range as any).style,
            color: colorHex,
            outlineColor: colorHex,
            fillColor: colorHex,
            strokeColor: colorHex,
            fillOpacity: 0.15,
          };

          // dentro do geojson
          if (range?.geojson?.features && Array.isArray(range.geojson.features)) {
            range.geojson.features = range.geojson.features.map((f: any) => {
              const prevProps = f.properties || {};
              const props = {
                ...prevProps,
                color: colorHex,
                colorHex,
                colorRGBA,
                outlineColor: colorHex,
                strokeColor: colorHex,
                fillColor: colorHex,
                fillOpacity:
                  typeof prevProps.fillOpacity === 'number'
                    ? prevProps.fillOpacity
                    : 0.15,
                dayIndex,
                origem: 'TerraTripper',
              };
              return {
                ...f,
                properties: props,
              };
            });
          }
        } catch (e) {
          console.warn('[TerraTripper] Falha ao injetar cor nas isócronas:', e);
        }

        await addRange(range);
        if (typeof saveRange === 'function') {
          await saveRange(range);
        }
      }

      if (typeof renderRanges === 'function') {
        console.log('[TerraTripper] Chamando renderRanges()');
        await renderRanges();
      }

      console.log('[TerraTripper] Isócronas desenhadas com sucesso.');
    } catch (e: any) {
      console.warn('Erro ao gerar isócronas das bases via useRange:', e);
      setRangesError('Falha ao gerar isócronas das bases.');
    } finally {
      setRangesLoading(false);
    }
  }

  /* ==================== Raios simples nas bases ==================== */
  async function drawRadiusForBases() {
    console.log('[TerraTripper] drawRadiusForBases clicado');
    setRadiusError(null);

    if (!board || !board.length) {
      setRadiusError('Nenhum roteiro calculado ainda.');
      return;
    }

    if (!addRadiusFeature) {
      console.warn(
        '[TerraTripper] useRadius / addRadiusFeature não disponível no host.',
      );
      setRadiusError('API de raio (useRadius) não está disponível neste ambiente.');
      return;
    }

    try {
      setRadiusLoading(true);

      if (typeof clearRadiusSource === 'function') {
        await clearRadiusSource();
      }

      for (const dia of board) {
        const bases = (dia?.pontos || []).filter((p: any) => p?.tipo === 'base');
        for (const base of bases) {
          if (!base?.coordinates || base.coordinates.length !== 2) continue;

          const [lon, lat] = base.coordinates;

          const radiusFeature = {
            id: `tt-radius-${dia?.data || 'nodate'}-${base.id || lon + '-' + lat}`,
            name: base.label || base.name || 'Raio da base',
            center: base.coordinates,
            geojson: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: base.coordinates,
                  },
                  properties: {
                    radius_km: 10,
                    origem: 'TerraTripper',
                    day: dia?.data,
                  },
                },
              ],
            },
          };

          await addRadiusFeature(radiusFeature);
        }
      }
    } catch (e: any) {
      console.warn('Erro ao desenhar raios das bases:', e);
      setRadiusError('Falha ao desenhar raios das bases.');
    } finally {
      setRadiusLoading(false);
    }
  }

  /* ==================== Salvar itinerário em Rotas ==================== */
  async function saveItineraryToRoutes() {
    setRoutesSaveMessage(null);

    if (!directions || !directions.length) {
      setRoutesSaveMessage('Nenhuma rota calculada para salvar.');
      return;
    }

    if (!saveDirectionAPI) {
      console.warn('[TerraTripper] saveDirection não disponível em useDirections.');
      setRoutesSaveMessage(
        'API de salvar rota (useDirections.saveDirection) não está disponível.',
      );
      return;
    }

    try {
      setRoutesSaving(true);

      for (const dir of directions) {
        await saveDirectionAPI(dir);
      }

      if (typeof renderDirectionsAPI === 'function') {
        await renderDirectionsAPI();
      }

      setRoutesSaveMessage('Itinerário salvo em "Rotas" com sucesso.');
    } catch (e) {
      console.warn('Erro ao salvar itinerário em Rotas:', e);
      setRoutesSaveMessage('Falha ao salvar itinerário em "Rotas".');
    } finally {
      setRoutesSaving(false);
    }
  }

  /* ==================== Submit inicial (Form) ==================== */
  async function handleSubmit(formData: any) {
    setFormRoteiro(formData);
    setRoutesSaveMessage(null);

    try {
      if (formData?.pontos?.length >= 2) {
        await clearAllRoutes(directions);
        setDirections([]);

        const temp: any[] = [];
        const previewRGBA: [number, number, number, number] = [
          100, 116, 139, 0.95,
        ];
        const previewHex = '#64748b';

        for (let i = 0; i < formData.pontos.length - 1; i++) {
          const origin = formData.pontos[i];
          const destination = formData.pontos[i + 1];
          const result: any = await computeSegment({
            origin,
            destination,
            colorRGBA: previewRGBA,
            colorHex: previewHex,
            colorIndex: -1,
          });
          if (result) temp.push(result);
        }
        setDirections(temp);

        if (TT_pinService) {
          const neutrals = (formData.pontos || [])
            .filter(
              (p: any) =>
                Array.isArray(p?.coordinates) &&
                p.coordinates.length === 2,
            )
            .map((p: any, idx: number) => ({
              type: 'Feature',
              id: p?.uid ? `point-${p.uid}` : `point-fallback-${idx}`,
              geometry: {
                type: 'Point',
                coordinates: p.coordinates as [number, number],
              },
              properties: {
                kind: p?.tipo === 'base' ? 'base' : 'poi',
                label: p?.label,
                colorHex: previewHex,
                colorRGBA: previewRGBA,
              },
            }));
          await replaceAllPins(neutrals);
        }
      }
    } catch (e) {
      console.warn('Rota inicial (form) falhou:', e);
    }

    try {
      const initialBoard = await generateInitialBoard(formData);
      const diasRoteiro = convertToDiaRoteiro(initialBoard, formData.pontos);

      setBoard(diasRoteiro);
      setDisponiveis([]);

      await recomputeRoutes(diasRoteiro);

      setTimeout(() => (window as any).TT_ON_BOARD_OPEN?.(), 50);
    } catch (e) {
      console.error('Erro ao preparar/desenhar rotas iniciais:', e);
    }
  }

  /* ==================== Catálogo de bases para o Board ==================== */
  const toKey = _R.useCallback(
    (p: any) =>
      p?.id ??
      `${p?.label}|${p?.coordinates?.[0]},${p?.coordinates?.[1]}`,
    [],
  );

  const baseCatalog = _R.useMemo(() => {
    const pts =
      (formRoteiro?.pontos ?? []).filter(
        (p: any) => p && p.tipo === 'base',
      ) || [];
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
        <div className="text-red-500 font-bold">
          Erro: GoBackButton não está disponível
        </div>
      )}

      <h2 className="text-xl font-bold flex items-center gap-2">
        <span>Planejador de Roteiro de Viagem</span>

        <button
          type="button"
          onClick={() => setShowDeps(prev => !prev)}
          className="ml-auto text-xs px-2 py-1 border rounded-md text-blue-700 border-blue-300 hover:bg-blue-50"
        >
          {showDeps ? 'Ocultar dependências' : 'Ver dependências'}
        </button>
      </h2>

      {showDeps && depsUsed.length > 0 && (
        <div className="mt-2 border rounded-md bg-gray-50 p-3 text-xs text-gray-700 max-w-md">
          <div className="font-semibold mb-1">
            APIs do TerraPlanner utilizadas por este plugin
          </div>
          <ul className="list-disc pl-4 space-y-1">
            {depsUsed.map(dep => (
              <li key={dep.id}>
                <strong>{dep.label}</strong>
                {dep.kind && ` (${dep.kind})`} — v{dep.version}
                {dep.description && (
                  <div className="text-[0.7rem] text-gray-500">
                    {dep.description}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
                  backgroundColor: hover
                    ? '#1D4ED8'
                    : styles.botaoPrincipal.backgroundColor,
                }}
              >
                Abrir Quadro de Planejamento
              </button>
            </div>
          )}

          {mostrarQuadro && (
            <div
              className="fixed bottom-0 z-40 bg-white border-t border-l border-gray-300 shadow-xl p-4"
              style={{
                left: '380px',
                width: 'calc(100% - 380px)',
                height: '60vh',
                overflow: 'auto',
              }}
            >
              <TravelPlannerBoard
                roteiro={board}
                onUpdateRoteiro={setBoard}
                pontosDisponiveis={disponiveis}
                baseCatalog={baseCatalog}
                onUpdateDisponiveis={setDisponiveis}
                onRebuildRoutes={recomputeRoutes}
              />

              {rangesError && (
                <div className="mt-3 text-sm text-red-600">
                  {rangesError}
                </div>
              )}

              {radiusError && (
                <div className="mt-1 text-sm text-red-600">
                  {radiusError}
                </div>
              )}

              {routesSaveMessage && (
                <div className="mt-2 text-sm text-gray-700">
                  {routesSaveMessage}
                </div>
              )}

              <div className="mt-4 flex gap-3 flex-wrap">
                <button
                  onClick={drawRangesForBases}
                  disabled={rangesLoading}
                  style={styles.botaoIso}
                >
                  {rangesLoading
                    ? 'Gerando isócronas das bases...'
                    : 'Desenhar isócronas das bases'}
                </button>

                <button
                  onClick={drawRadiusForBases}
                  disabled={radiusLoading}
                  style={styles.botaoRaio}
                >
                  {radiusLoading
                    ? 'Desenhando raios das bases...'
                    : 'Desenhar raios das bases'}
                </button>

                <button
                  onClick={saveItineraryToRoutes}
                  disabled={routesSaving || !directions?.length}
                  style={styles.botaoSalvar}
                >
                  {routesSaving
                    ? 'Salvando itinerário...'
                    : 'Salvar itinerário em Rotas'}
                </button>

                <button
                  onClick={() => setMostrar(false)}
                  style={styles.botaoFechar}
                >
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
  botaoIso: {
    backgroundColor: '#059669',
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  botaoRaio: {
    backgroundColor: '#10B981',
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  botaoSalvar: {
    backgroundColor: '#4B5563',
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
};
