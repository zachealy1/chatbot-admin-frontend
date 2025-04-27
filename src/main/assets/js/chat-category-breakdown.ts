interface BreakdownResponse {
  [category: string]: {
    '20-30': number;
    '31-40': number;
    '41-50': number;
    '51+': number;
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  const res = await fetch('/chat-category-breakdown', { credentials: 'same-origin' });
  if (!res.ok) {
    console.error('Failed to load category breakdown', res.status);
    return;
  }
  const data: BreakdownResponse = await res.json();

  const container = document.querySelector('.chart-container .govuk-grid-column-full')!;
  container.querySelectorAll('.chart-row').forEach(r => r.remove());

  let count = 0;
  for (const [category, buckets] of Object.entries(data)) {
    if (count++ >= 6) {break;}

    const row = document.createElement('div');
    row.className = 'chart-row';

    // ─── label ───
    const label = document.createElement('div');
    label.className = 'chart-label';
    const truncated = category.length > 10
      ? `${category.slice(0, 10)}...`
      : category;
    label.textContent = truncated;
    label.title = category;
    row.appendChild(label);

    // ─── bar segments ───
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    const ageKeys = ['20-30','31-40','41-50','51+'] as const;

    ageKeys.forEach((key, idx) => {
      // round to two decimals
      const pct = Math.round((buckets[key] ?? 0) * 100) / 100;
      // only render if at least 1%
      if (pct < 1) {return;}

      const seg = document.createElement('div');
      seg.className = `bar-segment bar-segment-${idx + 1}`;
      seg.style.width = `${pct}%`;
      seg.textContent = String(pct);
      bar.appendChild(seg);
    });

    row.appendChild(bar);

    // ─── total (always 100) ───
    const total = document.createElement('div');
    total.className = 'chart-total';
    total.textContent = '100';
    row.appendChild(total);

    container.appendChild(row);
  }
});
