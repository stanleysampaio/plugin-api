// components/plan/RoteiroAgenda.tsx

import { generateTripDays } from "./generateTripDays";

const { React } = window.PluginDependencies;

interface RoteiroAgendaProps {
  dataIda: string;
  dataVolta: string;
}

export function RoteiroAgenda({ dataIda, dataVolta }: RoteiroAgendaProps) {
  const dias = generateTripDays(dataIda, dataVolta);

  return (
    <section className="mt-6">
      <h3 className="font-bold text-lg mb-2">Agenda de Viagem</h3>
      <div className="overflow-x-auto">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${dias.length}, minmax(150px, 1fr))`,
          }}
        >
          {dias.map((dia, index) => (
            <div
              key={dia}
              className="bg-white border rounded shadow-sm min-h-[200px] flex flex-col"
            >
              <div className="bg-blue-500 text-white text-center font-semibold py-1 rounded-t">
                Dia {index + 1} <br /> {formatDate(dia)}
              </div>
              <div className="p-2 text-sm text-gray-700 italic">
                (Vazio por enquanto)
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatDate(dateStr: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  };
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR", options);
}
