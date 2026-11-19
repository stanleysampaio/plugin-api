import { useRef, useState } from 'react';
import { MdLinearScale } from 'react-icons/md';
import { GoBackButton, MapInput, useLines } from '@terraplanner/sdk';

interface Point {
  id: string;
  name: string;
  city: string;
  uf: string;
  coordinates: number[];
}

export default function LinearDistance() {
  const formRef = useRef<HTMLFormElement>(null);
  const { addLine, removeLine } = useLines();

  const [lineId, setLineId] = useState('');
  const [distance, setDistance] = useState(0);
  const [origin, setOrigin] = useState<Point>();
  const [destination, setDestination] = useState<Point>();
  const [reverseModeId, setReverseModeId] = useState<string>();

  function createLine(origin?: Point, destination?: Point) {
    if (lineId) {
      removeLine(lineId);
    }
    if (!origin || !destination) {
      return;
    }

    const id = `${origin.id}-${destination.id}`;
    setLineId(id);

    const distance = addLine(id, {
      origin: origin.coordinates,
      destination: destination.coordinates
    });

    setDistance(distance);
  }

  function handleSubmit(event: React.FormEvent) {
    event?.preventDefault();

    createLine(origin, destination);
  }

  function handleSelectOrigin(point?: Point) {
    setOrigin(point);
    createLine(point, destination);
  }

  function handleSelectDestination(point?: Point) {
    setDestination(point);
    createLine(origin, point);
  }

  return (
    <main className="px-2">
      <GoBackButton title="Distância Linear" icon={MdLinearScale} />

      <form
        onSubmit={handleSubmit}
        ref={formRef}
        className="flex flex-col gap-2 mb-4"
      >
        <MapInput
          id="origin"
          label="Ponto de partida"
          placeholder="Escolha o ponto de partida"
          reverseDisabled={reverseModeId === 'destination'}
          onReverse={setReverseModeId}
          selectedValue={origin}
          onSelectValue={handleSelectOrigin}
          onUnselectValue={() => {}}
        />
        <MapInput
          id="destination"
          label="Destino"
          placeholder="Escolha o destino"
          reverseDisabled={reverseModeId === 'origin'}
          onReverse={setReverseModeId}
          selectedValue={destination}
          onSelectValue={handleSelectDestination}
          onUnselectValue={() => {}}
        />
      </form>

      <span data-testid="linear-distance-value">Distância: {distance}km</span>
    </main>
  );
}
