interface AccountRequest {
  requestId:    number;
  userName:     string;
  email:        string;
  status:       string;
  submittedDate:string;
}

const PAGE_SIZE = 5;
let accountRequests: { [page: number]: AccountRequest[] } = {};

document.addEventListener('DOMContentLoaded', () => {
  // 1) Fetch the live pending requests from our new /requests/pending frontend route
  fetch('/requests/pending', { credentials: 'same-origin' })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch pending requests: ${res.status}`);
      }
      return res.json();
    })
    .then((data: any[]) => {
      // 2) Map raw JSON (flat shape) into our typed interface
      const all: AccountRequest[] = data.map(item => ({
        requestId:     item.requestId,              // flat property
        userName:      item.userName,               // flat property
        email:         item.email,
        status:        item.status,
        submittedDate: item.submittedDate.split('T')[0]
      }));

      // 3) Chunk into pages of PAGE_SIZE
      accountRequests = {};
      for (let i = 0; i < all.length; i += PAGE_SIZE) {
        const page = Math.floor(i / PAGE_SIZE) + 1;
        accountRequests[page] = all.slice(i, i + PAGE_SIZE);
      }

      // 4) Now that accountRequests is populated, wire up pagination + initial render
      setupPaginationLinks();
    })
    .catch(err => {
      console.error('Error loading pending requests:', err);
      // Optionally, you could render a "no data" row here
    });
});

// Function to render table rows for a given page
function renderTableRows(page: number): void {
  const tbody = document.querySelector('.govuk-table__body') as HTMLElement;
  tbody.innerHTML = '';

  const rows = accountRequests[page];
  if (!rows) {
    console.error(`No data for page ${page}`);
    return;
  }

  rows.forEach(req => {
    const tr = document.createElement('tr');
    tr.className = 'govuk-table__row';
    tr.innerHTML = `
      <td class='govuk-table__cell'>${req.requestId}</td>
      <td class='govuk-table__cell'>${req.userName}</td>
      <td class='govuk-table__cell'>${req.email}</td>
      <td class='govuk-table__cell'>${req.status}</td>
      <td class='govuk-table__cell'>${req.submittedDate}</td>
      <td class='govuk-table__cell'>
        <form method="post" action="/requests/${req.requestId}/accept" class="govuk-!-display-inline-block">
          <button type="submit" class="govuk-button govuk-!-margin-right-1">
            Accept
          </button>
        </form>
        <form method="post" action="/requests/${req.requestId}/reject" class="govuk-!-display-inline-block">
          <button type="submit" class="govuk-button govuk-button--warning">
            Reject
          </button>
        </form>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Wire up pagination once accountRequests is ready
function setupPaginationLinks(): void {
  const paginationLinks = document.querySelectorAll('.govuk-pagination__link');
  const prevButton      = document.querySelector('.govuk-pagination__prev a') as HTMLElement;
  const nextButton      = document.querySelector('.govuk-pagination__next a') as HTMLElement;

  let currentPage = 1;
  const totalPages = Object.keys(accountRequests).length;

  // Page number clicks
  paginationLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const txt = (e.target as HTMLElement).textContent?.trim();
      const p   = txt ? parseInt(txt, 10) : NaN;
      if (!isNaN(p) && p !== currentPage) {
        currentPage = p;
        renderTableRows(p);
        updateCurrentPage(p);
      }
    });
  });

  // Previous
  prevButton.addEventListener('click', e => {
    e.preventDefault();
    if (currentPage > 1) {
      currentPage--;
      renderTableRows(currentPage);
      updateCurrentPage(currentPage);
    }
  });

  // Next
  nextButton.addEventListener('click', e => {
    e.preventDefault();
    if (currentPage < totalPages) {
      currentPage++;
      renderTableRows(currentPage);
      updateCurrentPage(currentPage);
    }
  });

  // Initial render of page 1
  renderTableRows(1);
  updateCurrentPage(1);
}

function updateCurrentPage(page: number): void {
  document.querySelectorAll('.govuk-pagination__item').forEach(item =>
    item.classList.remove('govuk-pagination__item--current')
  );
  const activeLink = Array.from(document.querySelectorAll('.govuk-pagination__link'))
    .find(link => link.textContent?.trim() === page.toString());
  if (activeLink?.parentElement) {
    activeLink.parentElement.classList.add('govuk-pagination__item--current');
  }
}
