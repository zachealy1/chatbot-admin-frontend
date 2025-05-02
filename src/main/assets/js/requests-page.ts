interface Translations {
  actionAccept: string;
  actionReject: string;
}

interface AccountRequest {
  requestId:    number;
  userName:     string;
  email:        string;
  status:       string;
  submittedDate:string;
}

const PAGE_SIZE = 5;
let accountRequests: Record<number, AccountRequest[]> = {};

let acceptLabel = 'Accept';
let rejectLabel = 'Reject';

document.addEventListener('DOMContentLoaded', async () => {
  // 0) Fetch our two translated labels
  try {
    const res = await fetch('/i18n/buttons', { credentials: 'same-origin' });
    if (!res.ok) {throw new Error(`I18n fetch failed: ${res.status}`);}
    const t: Translations = await res.json();
    acceptLabel = t.actionAccept;
    rejectLabel = t.actionReject;
  } catch (e) {
    console.warn('Could not load translations; using defaults', e);
  }

  // 1) Fetch pending requests
  fetch('/requests/pending', { credentials: 'same-origin' })
    .then(res => {
      if (!res.ok) {throw new Error(`Fetch failed: ${res.status}`);}
      return res.json();
    })
    .then((data: any[]) => {
      // map + paginate…
      const all: AccountRequest[] = data.map(item => ({
        requestId:     item.requestId,
        userName:      item.userName,
        email:         item.email,
        status:        item.status,
        submittedDate: item.submittedDate.split('T')[0]
      }));

      accountRequests = {};
      for (let i = 0; i < all.length; i += PAGE_SIZE) {
        const page = Math.floor(i / PAGE_SIZE) + 1;
        accountRequests[page] = all.slice(i, i + PAGE_SIZE);
      }

      setupPaginationLinks();
    })
    .catch(err => console.error('Error loading pending requests:', err));
});

// … then renderTableRows, setupPaginationLinks, updateCurrentPage exactly as before …
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
      <td class="govuk-table__cell">${req.requestId}</td>
      <td class="govuk-table__cell">${req.userName}</td>
      <td class="govuk-table__cell">${req.email}</td>
      <td class="govuk-table__cell">${req.status}</td>
      <td class="govuk-table__cell">${req.submittedDate}</td>
      <td class="govuk-table__cell">
        <form method="post" action="/requests/${req.requestId}/accept" class="govuk-!-display-inline-block">
          <button type="submit" class="govuk-button govuk-!-margin-right-1">
            ${acceptLabel}
          </button>
        </form>
        <form method="post" action="/requests/${req.requestId}/reject" class="govuk-!-display-inline-block">
          <button type="submit" class="govuk-button govuk-button--warning">
            ${rejectLabel}
          </button>
        </form>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// …pagination helpers unchanged…
function setupPaginationLinks(): void {
  const paginationLinks = document.querySelectorAll('.govuk-pagination__link');
  const prevButton      = document.querySelector('.govuk-pagination__prev a') as HTMLElement;
  const nextButton      = document.querySelector('.govuk-pagination__next a') as HTMLElement;

  let currentPage = 1;
  const totalPages = Object.keys(accountRequests).length;

  paginationLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const p = parseInt((e.target as HTMLElement).textContent||'', 10);
      if (!isNaN(p) && p !== currentPage) {
        currentPage = p;
        renderTableRows(p);
        updateCurrentPage(p);
      }
    });
  });

  prevButton.addEventListener('click', e => {
    e.preventDefault();
    if (currentPage > 1) {
      currentPage--;
      renderTableRows(currentPage);
      updateCurrentPage(currentPage);
    }
  });

  nextButton.addEventListener('click', e => {
    e.preventDefault();
    if (currentPage < totalPages) {
      currentPage++;
      renderTableRows(currentPage);
      updateCurrentPage(currentPage);
    }
  });

  renderTableRows(1);
  updateCurrentPage(1);
}

function updateCurrentPage(page: number): void {
  document.querySelectorAll('.govuk-pagination__item')
    .forEach(item => item.classList.remove('govuk-pagination__item--current'));
  const activeLink = Array.from(document.querySelectorAll('.govuk-pagination__link'))
    .find(link => link.textContent?.trim() === page.toString());
  activeLink?.parentElement?.classList.add('govuk-pagination__item--current');
}
