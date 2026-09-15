export function formatKc(amount: number): string {
  return `${new Intl.NumberFormat("cs-CZ").format(amount)} Kč`;
}
