/**
 * Lightweight, zero-config anonymous analytics for PostalDriver.
 * Tracks total visits, unique visitors, time spent (aggregated minutes),
 * retention checkpoints, and key gameplay milestones.
 */

const API_BASE = 'https://countapi.mileshilliard.com/api/v1';
const PREFIX = 'pd_uaz_2026';

function hit(metric: string): void {
  try {
    fetch(`${API_BASE}/hit/${PREFIX}_${metric}`).catch(() => {});
  } catch {}
}

export function initAnalytics(): void {
  // 1. Total visits
  hit('visits');

  // 2. Unique visitor (checked via localStorage)
  if (!localStorage.getItem('pd_visited')) {
    try {
      localStorage.setItem('pd_visited', '1');
    } catch {}
    hit('unique');
  }

  // 3. Time tracking: every minute active
  let elapsedMinutes = 0;
  setInterval(() => {
    elapsedMinutes++;
    hit('total_minutes');
    if (elapsedMinutes === 1) hit('ret_1m');
    else if (elapsedMinutes === 3) hit('ret_3m');
    else if (elapsedMinutes === 5) hit('ret_5m');
    else if (elapsedMinutes === 10) hit('ret_10m');
    else if (elapsedMinutes === 15) hit('ret_15m');
  }, 60000);
}

export function trackEvent(event: 'engine_start' | 'delivered' | 'police_stop'): void {
  hit(`evt_${event}`);
}
