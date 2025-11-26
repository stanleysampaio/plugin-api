/* eslint-disable */
/* @ts-nocheck */

import { PontoRoteiro } from "./types";

const _PD: any = (window as any).PluginDependencies || {};
const fetchDirectionsController = _PD.fetchDirectionsController;

interface AgrupamentoPorBase {
  [baseIndex: number]: {
    base: PontoRoteiro;
    pontos: PontoRoteiro[];
  };
}

/**
 * Agrupa os pontos de interesse pela base "mais próxima",
 * usando a API de rotas via `fetchDirectionsController`.
 *
 * Se der erro ou não houver controller, o generateInitialBoard
 * já tem fallback para distribuição simples.
 */
export async function groupPointsByBase(
  bases: PontoRoteiro[],
  interesses: PontoRoteiro[]
): Promise<AgrupamentoPorBase> {
  const agrupamento: AgrupamentoPorBase = {};

  // Inicializa estrutura
  bases.forEach((base, index) => {
    agrupamento[index] = {
      base,
      pontos: [],
    };
  });

  if (!fetchDirectionsController?.execute || bases.length === 0) {
    // sem controller → deixa tudo vazio, o caller faz fallback
    return agrupamento;
  }

  // Para cada ponto de interesse, busca a base com menor distância de rota
  for (const ponto of interesses) {
    let menorDistancia = Infinity;
    let baseMaisProximaIndex = -1;

    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];

      try {
        const rota: any = await fetchDirectionsController.execute({
          origin: base,
          destination: ponto,
          profile: "driving-car",
          preference: "recommended",
          options: {
            avoidBorders: "none",
            avoidFeatures: {
              highways: false,
              tollways: false,
              ferries: false,
            },
          },
        });

        // mesmo padrão que usamos no plugin principal
        const distancia =
          rota?.geojson?.properties?.summary?.distance ?? Infinity;

        if (typeof distancia === "number" && distancia < menorDistancia) {
          menorDistancia = distancia;
          baseMaisProximaIndex = i;
        }
      } catch (err) {
        console.warn(
          `Erro ao calcular rota de "${base.label}" até "${ponto.label}":`,
          err
        );
      }
    }

    if (baseMaisProximaIndex !== -1) {
      agrupamento[baseMaisProximaIndex].pontos.push(ponto);
    }
  }

  return agrupamento;
}
