interface TableRow {
  order:   number;
  name:    string;
  queries: number;
  first:   string;
  last:    string;
}

const SIZE = 6;
const tableData: Record<number, TableRow[]> = {};

async function fetchAndInit() {
  try {
    const res = await fetch('/popular-chat-categories', { credentials: 'same-origin' });
    if (!res.ok) {throw new Error(`Fetch failed: ${res.status}`);}
    const data: any[] = await res.json();

    // Map to our shape
    const allRows: TableRow[] = data.map(item => ({
      order:   item.order,
      name:    item.name,
      queries: item.queries,
      first:   item.firstQuery.split('T')[0],
      last:    item.lastQuery.split('T')[0],
    }));

    // Chunk into pages
    for (let i = 0; i < allRows.length; i += SIZE) {
      const page = Math.floor(i / SIZE) + 1;
      tableData[page] = allRows.slice(i, i + SIZE);
    }

    buildPagination();      // ← build the <li> links
    setupPagination();      // ← wire up events and render page 1
  } catch (err) {
    console.error('Error loading chat categories:', err);
    const tbody = document.querySelector('.govuk-table__body') as HTMLElement;
    tbody.innerHTML = `
      <tr><td colspan="5" class="govuk-body">Could not load data</td></tr>
    `;
  }
}

function buildPagination() {
  const list = document.querySelector('.govuk-pagination__list') as HTMLElement;
  list.innerHTML = ''; // clear existing

  const totalPages = Object.keys(tableData).length || 1;
  for (let p = 1; p <= totalPages; p++) {
    const li = document.createElement('li');
    li.className = 'govuk-pagination__item' + (p === 1 ? ' govuk-pagination__item--current' : '');
    li.innerHTML = `
      <a class="govuk-link govuk-pagination__link" href="#" aria-label="Page ${p}" ${p === 1 ? 'aria-current="page"' : ''}>
        ${p}
      </a>
    `;
    list.appendChild(li);
  }
}

function renderTable(page: number) {
  const tbody = document.querySelector('.govuk-table__body') as HTMLElement;
  tbody.innerHTML = '';

  const rows = tableData[page] || [];
  if (!rows.length) {
    tbody.innerHTML = `
      <tr><td colspan="5" class="govuk-body">No data for this page.</td></tr>
    `;
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'govuk-table__row';
    tr.innerHTML = `
      <td class='govuk-table__cell'>${row.order}</td>
      <td class='govuk-table__cell'>${row.name}</td>
      <td class='govuk-table__cell'>${row.queries}</td>
      <td class='govuk-table__cell'>${row.first}</td>
      <td class='govuk-table__cell'>${row.last}</td>
    `;
    tbody.appendChild(tr);
  });
}

function setupPagination() {
  const paginationItems = document.querySelectorAll('.govuk-pagination__item');
  const pageLinks       = Array.from(document.querySelectorAll('.govuk-pagination__link'));
  const prevButton      = document.querySelector('.govuk-pagination__prev .govuk-pagination__link') as HTMLElement | null;
  const nextButton      = document.querySelector('.govuk-pagination__next .govuk-pagination__link') as HTMLElement | null;

  let currentPage = 1;
  const totalPages = pageLinks.length;

  const updateActive = (p: number) => {
    paginationItems.forEach(li => li.classList.remove('govuk-pagination__item--current'));
    const activeLi = Array.from(paginationItems)[p - 1];
    activeLi?.classList.add('govuk-pagination__item--current');
  };

  // Page number clicks
  pageLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const p = parseInt((e.target as HTMLElement).textContent || '', 10);
      if (p && p !== currentPage) {
        currentPage = p;
        renderTable(p);
        updateActive(p);
      }
    });
  });

  // Prev
  prevButton?.addEventListener('click', e => {
    e.preventDefault();
    if (currentPage > 1) {
      currentPage--;
      renderTable(currentPage);
      updateActive(currentPage);
    }
  });

  // Next
  nextButton?.addEventListener('click', e => {
    e.preventDefault();
    if (currentPage < totalPages) {
      currentPage++;
      renderTable(currentPage);
      updateActive(currentPage);
    }
  });

  // Initial
  renderTable(1);
  updateActive(1);
}

document.addEventListener('DOMContentLoaded', fetchAndInit);
