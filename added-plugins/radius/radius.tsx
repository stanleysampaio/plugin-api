import { useRef, useState } from 'react';
import { RiLoader3Line } from 'react-icons/ri';
import { GoBackButton, MapInput, Slider, useRadius } from '@terraplanner/sdk';

interface Point {
  id: string;
  name: string;
  uf: string;
  city: string;
  coordinates: number[];
}

export default function Radius() {
  const formRef = useRef<HTMLFormElement>(null);
  const [point, setPoint] = useState<Point>();
  const [distance, setDistance] = useState(1);
  const [quantity, setQuantity] = useState(1);

  const { addRadius, removeRadius } = useRadius();

  // Os valores vêm por parâmetro porque o Slider dispara onValueChange e onValueCommit
  // no mesmo evento (teclado/clique na trilha): ler o estado aqui pegaria o valor anterior.
  function handleRadius(point?: Point, km = distance, qtd = quantity) {
    if (!point) {
      return;
    }

    removeRadius(point.id);

    addRadius({
      id: point.id,
      center: point.coordinates,
      radius: km * 1000,
      quantity: qtd
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    handleRadius(point);
  }

  function handleSelectPoint(value: Point | undefined) {
    setPoint(value);
    handleRadius(value);
  }


  return (
    <main className="flex flex-col gap-2 mb-4 px-2">
      <GoBackButton
        title="Calcular raios"
        icon={RiLoader3Line}
        data-testid="go-back-button-radius-geotool"
      />
      <form ref={formRef} onSubmit={handleSubmit}>
        <MapInput
          id="radius"
          label="Busca por local:"
          placeholder="Pesquise a origem no mapa"
          selectedValue={point}
          onSelectValue={handleSelectPoint}
          data-testid="input-field-radius-search"
          onUnselectValue={() => setPoint(undefined)}
        />

        <section className="my-4 flex flex-col gap-4">
          <label htmlFor="distance-slider">
            <span>Distância</span>
            <Slider
              min={1}
              max={10}
              showValue
              defaultValue={[distance]}
              value={[distance]}
              onValueChange={(value: number[]) => setDistance(value[0])}
              onValueCommit={(value: number[]) => handleRadius(point, value[0], quantity)}
              data-testid="slider-distance-radius"
            />
          </label>
          <label htmlFor="radius-quantity-slider">
            <span>Quantidade de raios</span>
            <Slider
              min={1}
              max={10}
              showValue
              defaultValue={[quantity]}
              value={[quantity]}
              onValueChange={(value: number[]) => setQuantity(value[0])}
              onValueCommit={(value: number[]) => handleRadius(point, distance, value[0])}
            />
          </label>
        </section>
      </form>
    </main>
  );
}
