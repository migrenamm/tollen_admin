/**
 * Express delivery fee: a FLAT 9 SAR charged once on an express order. Mirrors
 * EXPRESS_FEE in the customer app (lib/utils.ts) and the edge functions.
 * Replaced the old per-item 30% (×0.3) surcharge.
 */
export const EXPRESS_FEE = 9;

export function formatDistanceToNow(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-SA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
