/* eslint-disable */
/* @ts-nocheck */

// components/plan/generateTripDays.ts

export function generateTripDays(dataIda: string, dataVolta: string): string[] {
  const dias: string[] = [];

  const atual = new Date(dataIda);
  const fim = new Date(dataVolta);

  if (isNaN(atual.getTime()) || isNaN(fim.getTime()) || atual > fim) {
    return dias;
  }

  while (atual <= fim) {
    dias.push(atual.toISOString().split("T")[0]); // "YYYY-MM-DD"
    atual.setDate(atual.getDate() + 1);
  }

  return dias;
}
