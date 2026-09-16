export function formatKc(amount: number): string {
  return `${new Intl.NumberFormat("cs-CZ").format(amount)} Kč`;
}

export function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
