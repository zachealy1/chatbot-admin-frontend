interface SessionActivity {
  createdAt: string;   // e.g. "2025-04-27T14:11:31.882879"
  ageGroup:  string;   // one of "20 to 30", "31 to 40", "41 to 50", "51 and over"
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1) fetch the raw activity
  const res = await fetch('/user-activity', { credentials: 'same-origin' });
  if (!res.ok) {
    console.error('Failed to load user activity', res.status);
    return;
  }
  const data: SessionActivity[] = await res.json();

  // 2) define our buckets and now 12 months
  const ageGroups = ['20 to 30', '31 to 40', '41 to 50', '51 and over'];
  const months    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // 3) init counts[ageGroupIndex][monthIndex]
  const counts: number[][] = ageGroups.map(() => Array(months.length).fill(0));
  data.forEach(({ createdAt, ageGroup }) => {
    const date = new Date(createdAt);
    const m = date.getMonth();       // 0–11
    const gi = ageGroups.indexOf(ageGroup);
    if (gi >= 0 && m < months.length) {
      counts[gi][m] += 1;
    }
  });

  // 4) find max count for y-scale
  const maxCount = Math.max(...counts.flat(), 1);

  // grab the SVG and the Y-axis labels group
  const svg        = document.querySelector<SVGSVGElement>('.line-graph-svg')!;
  const tickGroup  = svg.querySelector<SVGGElement>('#y-axis-labels')!;

  // 4a) dynamically generate Y-axis labels & optional grid lines
  const NUM_TICKS = 5;
  tickGroup.innerHTML = '';

  for (let i = 0; i <= NUM_TICKS; i++) {
    const value = Math.round((maxCount / NUM_TICKS) * i);
    const y = 550 - (500 * i / NUM_TICKS);

    // label
    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('x', '35');
    label.setAttribute('y', String(y));
    label.setAttribute('font-size','14');
    label.setAttribute('text-anchor','end');
    label.classList.add('line-graph-axis');
    label.textContent = String(value);
    tickGroup.appendChild(label);

    // horizontal grid line
    const grid = document.createElementNS('http://www.w3.org/2000/svg','line');
    grid.setAttribute('x1','50');
    grid.setAttribute('y1',String(y));
    grid.setAttribute('x2','1200');  // extend to match 12-month width
    grid.setAttribute('y2',String(y));
    grid.setAttribute('stroke','#e6e6e6');
    grid.setAttribute('stroke-width','1');
    tickGroup.appendChild(grid);
  }

  // 5) build pointSets
  const pointSets = counts.map(arr =>
    arr.map((c, i) => {
      const x = 50 + i * 100;              // now covers 12 points: 50→1150
      const y = 550 - (c / maxCount) * 500;
      return `${x},${y}`;
    }).join(' ')
  );

  // 6) grab our data groups
  const lineGroup   = svg.querySelector<SVGGElement>('#chart-lines')!;
  const pointGroup  = svg.querySelector<SVGGElement>('#chart-points')!;

  lineGroup.innerHTML  = '';
  pointGroup.innerHTML = '';

  // 7) dynamically append polylines & circles
  const colors = ['#12436d','#28a197','#801650','#f46a25'];

  pointSets.forEach((pts, gi) => {
    // 7a) polyline
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', colors[gi]);
    poly.setAttribute('stroke-width', '2');
    lineGroup.appendChild(poly);

    // 7b) circles
    pts.split(' ').forEach(pt => {
      const [xStr, yStr] = pt.split(',');
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx', xStr);
      circle.setAttribute('cy', yStr);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', colors[gi]);
      pointGroup.appendChild(circle);
    });
  });
});
