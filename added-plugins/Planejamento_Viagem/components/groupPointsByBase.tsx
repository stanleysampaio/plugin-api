import { PontoRoteiro } from './types';

const { fetchDirectionsController } = window.PluginDependencies;

interface AgrupamentoPorBase {
  [baseIndex: number]: {
    base: PontoRoteiro;
    pontos: PontoRoteiro[];
  };
}

export async function groupPointsByBase(
  bases: PontoRoteiro[],
  interesses: PontoRoteiro[]
): Promise<AgrupamentoPorBase> {
  const agrupamento: AgrupamentoPorBase = {};

  bases.forEach((base, i) => {
    agrupamento[i] = {
      base,
      pontos: [],
    };
  });

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

        if (!rota || !rota.features || rota.features.length === 0) {
          console.warn(`Rota inválida entre "${base.label}" e "${ponto.label}"`, rota);
          continue;
        }

        const distancia = rota.features[0].properties?.summary?.distance ?? Infinity;
        console.log(`Distância entre "${base.label}" e "${ponto.label}":`, distancia);

        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          baseMaisProximaIndex = i;
        }
      } catch (err) {
        console.error(`Erro ao calcular rota entre base ${i} e ponto ${ponto.label}`, err);
      }
    }

    if (baseMaisProximaIndex !== -1) {
      agrupamento[baseMaisProximaIndex].pontos.push(ponto);
    }
  }

  return agrupamento;
}
