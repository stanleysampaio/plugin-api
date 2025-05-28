interface BuildMultiDirectionParams {
  points: { label?: string; coordinates: [number, number] }[];
  color?: string;
}

/**
 * Gera um objeto Direction válido a partir de múltiplos pontos sequenciais.
 */
export function buildMultiDirection({ points, color = "#0061ff" }: BuildMultiDirectionParams) {
  const { Direction } = window.PluginDependencies;

  if (!Direction?.create) {
    throw new Error("Direction.create não está disponível em PluginDependencies");
  }

  const validPoints = points.filter(
    (p) =>
      Array.isArray(p.coordinates) &&
      p.coordinates.length === 2 &&
      p.coordinates.every((n) => typeof n === "number")
  );

  if (validPoints.length < 2) {
    throw new Error("São necessários pelo menos 2 pontos válidos para criar uma rota.");
  }

  const coordinates = validPoints.map((p) => p.coordinates);
  const id = `direction-${Date.now()}`;

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {
      id,
      color,
      query: {
        preference: "recommended",
        origin: validPoints[0],
        destination: validPoints[validPoints.length - 1],
        options: {
          avoidBorders: "none",
          avoidFeatures: {
            highways: false,
            tollways: false,
            ferries: false,
          },
        },
      },
    },
  };

  return Direction.create({ id, geojson });
}
