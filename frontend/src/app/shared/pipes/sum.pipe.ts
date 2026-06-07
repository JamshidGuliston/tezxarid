import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'sum' })
export class SumPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    const n = Number(value ?? 0) || 0;
    const rounded = Math.round(n * 100) / 100;
    const [intPart, decPart] = String(rounded).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const out = decPart ? `${grouped}.${decPart}` : grouped;
    return `${out} сум`;
  }
}
