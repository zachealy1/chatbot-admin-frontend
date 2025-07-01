interface Translations {
  actionDelete: string;
}

interface ManagedAccount {
  accountId: number;
  userName: string;
  email: string;
  role: string;
  createdDate: string;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load the "Delete" button label from the backend i18n route
  let deleteLabel = 'Delete';
  try {
    const res = await fetch('/i18n/actions', { credentials: 'same-origin' });
    if (!res.ok) {
      throw new Error(`I18n fetch failed: ${res.status}`);
    }
    const t: Translations = await res.json();
    deleteLabel = t.actionDelete;
  } catch (e) {
    console.warn('Falling back to default delete label', e);
  }

  // Grab DOM & pagination elements
  const tbody = document.querySelector('.govuk-table__body--manage-accounts') as HTMLElement;
  const pageLinks = Array.from(document.querySelectorAll('.govuk-pagination__list .govuk-pagination__link'));
  const prevButton = document.querySelector('.govuk-pagination__prev .govuk-pagination__link') as HTMLElement | null;
  const nextButton = document.querySelector('.govuk-pagination__next .govuk-pagination__link') as HTMLElement | null;
  if (!tbody || pageLinks.length === 0) {
    console.error('Cannot find table body or pagination links');
    return;
  }

  let managedAccounts: ManagedAccount[] = [];
  let currentPage = 1;
  const totalPages = pageLinks.length;
  let pageSize = 0;

  // Fetch all accounts and start pagination
  fetch('/account/all', { credentials: 'same-origin' })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch accounts: ${res.status}`);
      }
      return res.json();
    })
    .then((data: any[]) => {
      managedAccounts = data.map(item => ({
        accountId: item.accountId,
        userName: item.username,
        email: item.email,
        role: item.role,
        createdDate: item.createdDate,
      }));
      pageSize = Math.ceil(managedAccounts.length / totalPages) || managedAccounts.length;
      setupManageAccountsPagination();
    })
    .catch(err => {
      console.error('Error loading managed accounts:', err);
    });

  // Render a given page of rows (with only Delete)
  function renderManagedAccountsTable(page: number): void {
    tbody.innerHTML = '';
    const start = (page - 1) * pageSize;
    const slice = managedAccounts.slice(start, start + pageSize);

    slice.forEach(acc => {
      const tr = document.createElement('tr');
      tr.className = 'govuk-table__row';
      tr.innerHTML = `
        <td class="govuk-table__cell">${acc.accountId}</td>
        <td class="govuk-table__cell">${acc.userName}</td>
        <td class="govuk-table__cell">${acc.email}</td>
        <td class="govuk-table__cell">${acc.role}</td>
        <td class="govuk-table__cell">${acc.createdDate}</td>
        <td class="govuk-table__cell">
          <form method="post" action="/accounts/${acc.accountId}/delete" class="govuk-!-display-inline-block">
            <button type="submit" class="govuk-button govuk-button--warning">
              ${deleteLabel}
            </button>
          </form>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Highlight active page link
  function updateManageAccountsCurrentPage(page: number): void {
    pageLinks.forEach(link => link.parentElement?.classList.remove('govuk-pagination__item--current'));
    const activeLink = pageLinks.find(link => link.textContent?.trim() === page.toString());
    activeLink?.parentElement?.classList.add('govuk-pagination__item--current');
  }

  // Wire up clicks on page numbers, prev/next, then render page 1
  function setupManageAccountsPagination(): void {
    pageLinks.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const p = parseInt((e.target as HTMLElement).textContent || '', 10);
        if (!isNaN(p) && p !== currentPage) {
          currentPage = p;
          renderManagedAccountsTable(p);
          updateManageAccountsCurrentPage(p);
        }
      });
    });
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

    renderManagedAccountsTable(currentPage);
    updateManageAccountsCurrentPage(currentPage);
  }
});
