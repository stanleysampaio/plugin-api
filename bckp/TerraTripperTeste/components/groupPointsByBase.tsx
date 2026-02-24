import { PontoRoteiro } from './types';

const { fetchDirectionsController } = window.PluginDependencies;

interface AgrupamentoPorBase {
  [baseIndex: number]: {
    base: PontoRoteiro;
    pontos: PontoRoteiro[];
  };
}

/**
 * Agrupa os pontos de interesse por base mais próxima,
 * utilizando a API de rotas via `fetchDirectionsController`.
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

  // Para cada ponto de interesse, busca a base mais próxima
  for (const ponto of interesses) {
    let menorDistancia = Infinity;
    let baseMaisProximaIndex = -1;

    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];

      try {
        const rota = await fetchDirectionsController.execute({
          origin: base,
          destination: ponto,
          profile: 'driving-car',
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

        const distancia = rota?.features?.[0]?.properties?.summary?.distance ?? Infinity;

        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          baseMaisProximaIndex = i;
        }

        // console.log(`Distância entre "${base.label}" e "${ponto.label}": ${distancia}`);
      } catch (err) {
        console.warn(`Erro ao calcular rota de "${base.label}" até "${ponto.label}":`, err);
      }
    }

    if (baseMaisProximaIndex !== -1) {
      agrupamento[baseMaisProximaIndex].pontos.push(ponto);
    }
  }

  return agrupamento;
}
