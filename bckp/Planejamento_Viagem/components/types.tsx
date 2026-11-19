// components/types.tsx

export type TipoPonto = 'base' | 'interesse';

// Representa um ponto no mapa com detalhes adicionais
export interface PontoRoteiro {
  id?: string;                       // ID que o board usa (drag & drop / mapa)
  uid?: string;                      // UID original do MapInput, se existir
  label: string;
  coordinates: [number, number];
  tipo: TipoPonto;
  tempo?: number;                    // Em minutos (apenas para pontos de interesse)
  fixo?: boolean;                    // ponto "ancora" (não pode ser movido)
}

// Representa a agenda de um único dia
export interface DiaRoteiro {
  data: string;                      // Exemplo: "2025-10-27" (ISO do dia)
  pontos: PontoRoteiro[];            // Lista de pontos atribuídos a este dia
}

// Utilizado pelo board (colunas de dias)
export interface BoardItem {
  id: string;
  pointIndex: number;                // índice do ponto na lista original (roteiro.pontos)
  label: string;
  time: number;                      // tempo de consumo em minutos
  type: TipoPonto;                   // 'base' | 'interesse'
  fixo?: boolean;
}

// Estrutura da coluna usada no board
export interface BoardColumn {
  id: string;
  label: string;                     // label amigável (ex: "qui, 27/10")
  data: string;                      // data ISO (YYYY-MM-DD)
  items: BoardItem[];
}

// Dados do formulário principal
export interface Roteiro {
  dataIda: string;                   // YYYY-MM-DD
  dataVolta: string;                 // YYYY-MM-DD
  interesses: string;
  tempo: number;
  // pontos originais vindos do PluginMapInput (sem tipagem forte ainda)
  // normalmente terão shape compatível com PontoRoteiro
  pontos: any[];
}
