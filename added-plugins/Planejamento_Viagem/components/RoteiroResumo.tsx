const { React } = window.PluginDependencies;

interface PointResult {
  label?: string;
  coordinates: number[];
}

interface Direction {
  id: string;
  geojson: GeoJSON.Feature<GeoJSON.LineString> & {
    properties: {
      id: string;
      color?: string;
      query?: any;
    };
  };
}

interface Roteiro {
  pontos: PointResult[];
  dataIda: string;
  dataVolta: string;
}

interface Props {
  roteiro: Roteiro;
  directions?: Direction[];
}

export function RoteiroResumo({ roteiro, directions = [] }: Props) {
  const total = roteiro.pontos.length;

  const formatPoint = (p: PointResult | undefined) =>
    p?.label || (p?.coordinates?.length === 2 ? p.coordinates.join(", ") : "---");

  const origem = formatPoint(roteiro.pontos[0]);
  const destino = formatPoint(roteiro.pontos[total - 1]);
  const paradas = roteiro.pontos.slice(1, -1);

  return (
    <section className="mt-4 border-t pt-4 bg-blue-50 p-4 rounded">
      <h3 className="font-semibold text-lg">Resumo do Roteiro</h3>
      <ul className="list-disc ml-5 mt-2 text-sm space-y-1">
        <li><strong>Data de Ida:</strong> {roteiro.dataIda}</li>
        <li><strong>Data de Volta:</strong> {roteiro.dataVolta}</li>
        <li><strong>Origem:</strong> {origem}</li>
        <li><strong>Destino:</strong> {destino}</li>
        {paradas.length > 0 && (
          <li>
            <strong>Paradas:</strong>
            <ul className="list-circle ml-4 mt-1">
              {paradas.map((p, i) => (
                <li key={i}>{formatPoint(p)}</li>
              ))}
            </ul>
          </li>
        )}
        <li><strong>Total de rotas geradas:</strong> {directions.length}</li>
      </ul>
    </section>
  );
}
