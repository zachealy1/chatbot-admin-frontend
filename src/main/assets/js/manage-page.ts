interface ManagedAccount {
  accountId: number;
  userName:   string;
  email:      string;
  role:       string;
  createdDate:string;
}

document.addEventListener('DOMContentLoaded', () => {
  const tbody           = document.querySelector('.govuk-table__body--manage-accounts') as HTMLElement;
  const pageLinks       = Array.from(document.querySelectorAll('.govuk-pagination__list .govuk-pagination__link'));
  const prevButton      = document.querySelector('.govuk-pagination__prev .govuk-pagination__link') as HTMLElement | null;
  const nextButton      = document.querySelector('.govuk-pagination__next .govuk-pagination__link') as HTMLElement | null;

  if (!tbody || !pageLinks.length) {
    console.error('Cannot find table body or pagination links');
    return;
  }

  let managedAccounts: ManagedAccount[] = [];
  let currentPage = 1;
  const totalPages = pageLinks.length;
  let pageSize = 0;

  function renderManagedAccountsTable(page: number): void {
    tbody.innerHTML = '';
    const start = (page - 1) * pageSize;
    const slice = managedAccounts.slice(start, start + pageSize);

    slice.forEach(acc => {
      const tr = document.createElement('tr');
      tr.className = 'govuk-table__row';
      tr.innerHTML = `
        <td class='govuk-table__cell'>${acc.accountId}</td>
        <td class='govuk-table__cell'>${acc.userName}</td>
        <td class='govuk-table__cell'>${acc.email}</td>
        <td class='govuk-table__cell'>${acc.role}</td>
        <td class='govuk-table__cell'>${acc.createdDate}</td>
        <td class='govuk-table__cell'>
          <form method="post" action="/accounts/${acc.accountId}/delete" class="govuk-!-display-inline-block">
            <button type="submit" class="govuk-button govuk-button--warning">
              Delete
            </button>
          </form>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function updateManageAccountsCurrentPage(page: number): void {
    pageLinks.forEach(link => link.parentElement?.classList.remove('govuk-pagination__item--current'));
    const activeLink = pageLinks.find(link => link.textContent?.trim() === page.toString());
    activeLink?.parentElement?.classList.add('govuk-pagination__item--current');
  }

  function setupManageAccountsPagination(): void {
    // page-number clicks
    pageLinks.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const page = parseInt((e.target as HTMLElement).textContent || '', 10);
        if (page && page !== currentPage) {
          currentPage = page;
          renderManagedAccountsTable(currentPage);
          updateManageAccountsCurrentPage(currentPage);
        }
      });
    });
    // prev/next
    prevButton?.addEventListener('click', e => {
      e.preventDefault();
      if (currentPage > 1) {
        currentPage--;
        renderManagedAccountsTable(currentPage);
        updateManageAccountsCurrentPage(currentPage);
      }
    });
    nextButton?.addEventListener('click', e => {
      e.preventDefault();
      if (currentPage < totalPages) {
        currentPage++;
        renderManagedAccountsTable(currentPage);
        updateManageAccountsCurrentPage(currentPage);
      }
    });

    // initial paint
    renderManagedAccountsTable(currentPage);
    updateManageAccountsCurrentPage(currentPage);
  }

  // Fetch the live data and kick everything off
  fetch('/account/all', { credentials: 'same-origin' })
    .then(res => {
      if (!res.ok) {throw new Error(`Failed to fetch accounts: ${res.status}`);}
      return res.json();
    })
    .then((data: any[]) => {
      // map the JSON fields into our ManagedAccount interface
      managedAccounts = data.map(item => ({
        accountId:   item.accountId,
        userName:    item.username,
        email:       item.email,
        role:        item.role,
        createdDate: item.createdDate
      }));
      // evenly distribute onto your existing page count
      pageSize = Math.ceil(managedAccounts.length / totalPages) || managedAccounts.length;
      setupManageAccountsPagination();
    })
    .catch(err => {
      console.error('Error loading managed accounts:', err);
      // you could show an error row in the table here if you like
    });
});
