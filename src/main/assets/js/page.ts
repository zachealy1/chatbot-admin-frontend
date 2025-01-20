interface TableRow {
  order: number;
  name: string;
  queries: number;
  first: string;
  last: string;
}

// Example data for each page
const tableData: { [key: number]: TableRow[] } = {
  1: [
    { order: 1, name: 'Login Issues', queries: 13422, first: '25 Jun 2024', last: '20 Jan 2025' },
    { order: 2, name: 'Payment Queries', queries: 9821, first: '15 Jul 2024', last: '18 Jan 2025' },
    { order: 3, name: 'Order Status', queries: 8765, first: '10 Aug 2024', last: '19 Jan 2025' },
    { order: 4, name: 'Refund Requests', queries: 7543, first: '05 Sep 2024', last: '15 Jan 2025' },
    { order: 5, name: 'Account Management', queries: 6521, first: '20 Oct 2024', last: '18 Jan 2025' },
  ],
  2: [
    { order: 6, name: 'Technical Support', queries: 5200, first: '01 Nov 2024', last: '15 Jan 2025' },
    { order: 7, name: 'Product Issues', queries: 4820, first: '10 Dec 2024', last: '18 Jan 2025' },
    { order: 8, name: 'Delivery Delays', queries: 3980, first: '01 Jan 2025', last: '19 Jan 2025' },
    { order: 9, name: 'Promotions', queries: 3201, first: '05 Jan 2025', last: '19 Jan 2025' },
    { order: 10, name: 'General Queries', queries: 2500, first: '10 Jan 2025', last: '20 Jan 2025' },
  ],
  3: [
    { order: 11, name: 'Cancellations', queries: 1200, first: '12 Jan 2025', last: '20 Jan 2025' },
    { order: 12, name: 'Billing Errors', queries: 980, first: '15 Jan 2025', last: '20 Jan 2025' },
    { order: 13, name: 'Feedback', queries: 750, first: '17 Jan 2025', last: '20 Jan 2025' },
    { order: 14, name: 'Outage Issues', queries: 500, first: '18 Jan 2025', last: '20 Jan 2025' },
    { order: 15, name: 'Service Requests', queries: 300, first: '19 Jan 2025', last: '20 Jan 2025' },
  ],
};

// Function to render table rows
function renderTable(page: number): void {
  const tbody = document.querySelector('.govuk-table__body') as HTMLElement;
  tbody.innerHTML = ''; // Clear existing rows

  if (!tableData[page]) {
    console.error(`No data found for page ${page}`);
    return;
  }

  tableData[page].forEach((row: TableRow) => {
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

// Add event listeners for pagination links
function setupPagination(): void {
  const paginationLinks = document.querySelectorAll('.govuk-pagination__link');
  const prevButton = document.querySelector('.govuk-pagination__prev a') as HTMLElement;
  const nextButton = document.querySelector('.govuk-pagination__next a') as HTMLElement;

  let currentPage = 1;

  // Event listeners for page numbers
  paginationLinks.forEach((link) => {
    link.addEventListener('click', (event: Event) => {
      event.preventDefault();

      const target = event.target as HTMLElement;
      if (target.textContent) {
        const page = parseInt(target.textContent.trim());
        if (!isNaN(page)) {
          currentPage = page;
          renderTable(page);

          // Update active page
          updateActivePage(currentPage);
        }
      }
    });
  });

  // Event listener for the Previous button
  prevButton.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (currentPage > 1) {
      currentPage -= 1;
      renderTable(currentPage);

      // Update active page
      updateActivePage(currentPage);
    }
  });

  // Event listener for the Next button
  nextButton.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (currentPage < Object.keys(tableData).length) {
      currentPage += 1;
      renderTable(currentPage);

      // Update active page
      updateActivePage(currentPage);
    }
  });

  // Load the first page by default
  renderTable(1);
}

function updateActivePage(currentPage: number): void {
  // Remove the 'current' class from all pagination items
  document.querySelectorAll('.govuk-pagination__item').forEach((item) => {
    item.classList.remove('govuk-pagination__item--current');
  });

  // Find the pagination item that matches the currentPage and add the 'current' class
  const activeLink = Array.from(document.querySelectorAll('.govuk-pagination__link')).find(
    (link) => link.textContent?.trim() === currentPage.toString()
  );

  if (activeLink?.parentElement) {
    activeLink.parentElement.classList.add('govuk-pagination__item--current');
  }
}

// Initialize pagination
document.addEventListener('DOMContentLoaded', () => {
  setupPagination();
});
