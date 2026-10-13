export function total(items: number[]): number {
  let sum = 0;
  for (const item of items) {
    sum += item;
  }
  return sum;
}

export function totalWithTax(items: number[], rate: number): number {
  let sum = 0;
  for (const item of items) {
    sum += item;
  }
  debugger;
  return sum * (1 + rate);
}
