const {
    React,
    PluginMapInput,
    fetchDirectionsController,
    useRouteProfile,
    Direction,
} = window.PluginDependencies;

interface PointResult {
    label: string;
    coordinates: number[];
}

interface TravelRouteFormProps {
    onRouteSubmit: (directions: InstanceType<typeof Direction>[]) => void;
}

export function TravelRouteForm({ onRouteSubmit }: TravelRouteFormProps) {
    const [points, setPoints] = React.useState<PointResult[]>([
        { label: '', coordinates: [] },
        { label: '', coordinates: [] },
    ]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { profile } = useRouteProfile();

    function updatePoint(index: number, value: PointResult) {
        setPoints((prev) => {
            const updated = [...prev];
            updated[index] = value;
            return updated;
        });
    }

    function addNewPoint() {
        // Inserir parada antes do último ponto (destino)
        setPoints((prev) => {
            const updated = [...prev];
            updated.splice(updated.length - 1, 0, { label: '', coordinates: [] });
            return updated;
        });
    }

    function removePoint(index: number) {
        if (points.length <= 2) return; // manter mínimo de origem + destino
        setPoints((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (points.length < 2) {
            alert('Adicione pelo menos dois pontos para gerar uma rota.');
            return;
        }

        const directions: InstanceType<typeof Direction>[] = [];
        setIsSubmitting(true);

        try {
            for (let i = 0; i < points.length - 1; i++) {
                const origin = points[i];
                const destination = points[i + 1];

                if (!origin.coordinates.length || !destination.coordinates.length) continue;

                const direction = await fetchDirectionsController.execute({
                    origin,
                    destination,
                    profile,
                    options: {
                        avoidBorders: 'none',
                        avoidFeatures: {
                            highways: false,
                            tollways: false,
                            ferries: false,
                        },
                    },
                    preference: 'recommended',
                });

                directions.push(direction);
            }

            onRouteSubmit(directions);
        } catch (err) {
            console.error('Erro ao gerar rota com paradas:', err);
            alert('Erro ao gerar rotas. Verifique os pontos informados.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            {points.map((point, index) => {
                let label = `Parada ${index}`;
                if (index === 0) label = 'Origem';
                else if (index === points.length - 1) label = 'Destino';

                return (
                    <div key={index} className="flex flex-col gap-1 w-full">
                        <span className="text-xs font-semibold text-gray-600">{label}</span>

                        <div className="flex items-center gap-2">
                            <PluginMapInput
                                id={`point-${index}`}
                                selectedValue={point}
                                onSelectValue={(val: PointResult) => updatePoint(index, val)}
                                onUnselectValue={() => removePoint(index)}
                            />

                            {points.length > 2 && index !== 0 && index !== points.length - 1 && (
                                <button
                                    type="button"
                                    onClick={() => removePoint(index)}
                                    className="text-red-500 text-sm hover:underline"
                                >
                                    Remover
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}

            <button
                type="button"
                onClick={addNewPoint}
                className="bg-gray-200 text-sm rounded px-2 py-1 self-start"
            >
                + Adicionar parada
            </button>

            <button
                type="submit"
                className="bg-blue-500 text-white rounded p-2 mt-2 disabled:opacity-60"
                disabled={isSubmitting}
            >
                {isSubmitting ? 'Gerando...' : 'Gerar Rota com Paradas'}
            </button>
        </form>
    );
}
