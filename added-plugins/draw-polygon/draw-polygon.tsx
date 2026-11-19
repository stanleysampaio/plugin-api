import { useEffect } from 'react';
import { FaDrawPolygon } from 'react-icons/fa';
import { MdAdd, MdRemove } from 'react-icons/md';
import { GoBackButton, usePolygons } from '@terraplanner/sdk';

export default function DrawPolygons() {
  const { startDraw, stopDraw, removeDraw } = usePolygons();

  useEffect(() => {
    return () => stopDraw();
  }, [stopDraw]);

  return (
    <div>
      <GoBackButton
        title="Desenhar Polígonos"
        icon={FaDrawPolygon}
        data-testid="go-back-button-polygon-geotool"
      />
      <nav className="flex justify-around mt-4">
        <button
          id="button-start-draw"
          type="button"
          onClick={startDraw}
          className="flex flex-col items-center text-sm gap-2"
        >
          <MdAdd
            className="size-5 rounded transition-transform delay-200 ease-in-out
            hover:bg-blue-100 -translate-y-0.5"
          />
          Adicionar novo desenho
        </button>

        <button
          id="button-remove-draw"
          type="button"
          className="flex flex-col items-center text-sm gap-2"
          onClick={() => removeDraw()}
        >
          <MdRemove
            className="size-5 rounded transition-transform delay-200 ease-in-out
            hover:bg-blue-100 -translate-y-0.5"
          />
          Remover desenho
        </button>
      </nav>
    </div>
  );
}
