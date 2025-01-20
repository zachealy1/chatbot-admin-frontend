interface ManagedAccount {
  accountId: number;
  userName: string;
  email: string;
  role: string;
  createdDate: string;
}

// Example data for each page
const managedAccounts: { [key: number]: ManagedAccount[] } = {
  1: [
    { accountId: 1001, userName: 'johnAdmin', email: 'john.admin@example.com', role: 'Admin', createdDate: '2024-12-01' },
    { accountId: 1002, userName: 'janeUser', email: 'jane.user@example.com', role: 'User', createdDate: '2024-11-15' },
    { accountId: 1003, userName: 'aliceUser', email: 'alice.user@example.com', role: 'User', createdDate: '2024-11-01' },
  ],
  2: [
    { accountId: 1004, userName: 'bobStaff', email: 'bob.staff@example.com', role: 'Staff', createdDate: '2024-10-20' },
    { accountId: 1005, userName: 'carolManager', email: 'carol.manager@example.com', role: 'Manager', createdDate: '2024-10-10' },
    { accountId: 1006, userName: 'daveUser', email: 'dave.user@example.com', role: 'User', createdDate: '2024-09-30' },
  ],
  3: [
    { accountId: 1007, userName: 'eveUser', email: 'eve.user@example.com', role: 'User', createdDate: '2024-09-15' },
    { accountId: 1008, userName: 'frankStaff', email: 'frank.staff@example.com', role: 'Staff', createdDate: '2024-09-01' },
    { accountId: 1009, userName: 'graceManager', email: 'grace.manager@example.com', role: 'Manager', createdDate: '2024-08-25' },
  ],
};

/**
 * Renders the Managed Accounts table for the specified page
 */
function renderManagedAccountsTable(page: number): void {
  const tbody = document.querySelector('.govuk-table__body--manage-accounts') as HTMLElement;
  if (!tbody) {
    console.error('Could not find tbody element for manage-accounts table.');
    return;
  }

  // Clear existing rows
  tbody.innerHTML = '';

  if (!managedAccounts[page]) {
    console.error(`No data found for page ${page}`);
    return;
  }

  // Populate rows
  managedAccounts[page].forEach((account: ManagedAccount) => {
    const tr = document.createElement('tr');
    tr.className = 'govuk-table__row';
    tr.innerHTML = `
      <td class='govuk-table__cell'>${account.accountId}</td>
      <td class='govuk-table__cell'>${account.userName}</td>
      <td class='govuk-table__cell'>${account.email}</td>
      <td class='govuk-table__cell'>${account.role}</td>
      <td class='govuk-table__cell'>${account.createdDate}</td>
      <td class='govuk-table__cell'>
        <form method="post" action="/accounts/${account.accountId}/delete" class="govuk-!-display-inline-block">
          <button type="submit" class="govuk-button govuk-button--warning">
            Delete
          </button>
        </form>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Updates the current pagination link highlight
 */
function updateManageAccountsCurrentPage(currentPage: number): void {
  // Remove 'govuk-pagination__item--current' from all items
  const paginationItems = document.querySelectorAll('.govuk-pagination__item');
  paginationItems.forEach((item) => {
    item.classList.remove('govuk-pagination__item--current');
  });

  // Find the link whose text matches the currentPage number
  const activeLink = Array.from(document.querySelectorAll('.govuk-pagination__link')).find(
    (link) => link.textContent?.trim() === currentPage.toString()
  );

  // Add 'govuk-pagination__item--current' to the link's parent <li>
  if (activeLink?.parentElement) {
    activeLink.parentElement.classList.add('govuk-pagination__item--current');
  }
}

/**
 * Sets up pagination for the Manage Accounts screen
 */
function setupManageAccountsPagination(): void {
  let currentPage = 1;

  // Select the page number links (1, 2, 3) within the <ul>
  const pageLinks = document.querySelectorAll('.govuk-pagination__list .govuk-pagination__link');

  // Attach event listeners to each page link
  pageLinks.forEach((link) => {
    link.addEventListener('click', (event: Event) => {
      event.preventDefault();
      const target = event.target as HTMLElement;
      if (target.textContent) {
        const page = parseInt(target.textContent.trim(), 10);
        if (!isNaN(page)) {
          currentPage = page;
          renderManagedAccountsTable(page);
          updateManageAccountsCurrentPage(page);
        }
      }
    });
  });

  // Select the Previous & Next buttons
  const prevButton = document.querySelector('.govuk-pagination__prev .govuk-pagination__link') as HTMLElement | null;
  const nextButton = document.querySelector('.govuk-pagination__next .govuk-pagination__link') as HTMLElement | null;

  // Previous button event
  prevButton?.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (currentPage > 1) {
      currentPage -= 1;
      renderManagedAccountsTable(currentPage);
      updateManageAccountsCurrentPage(currentPage);
    }
  });

  // Next button event
  nextButton?.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (currentPage < Object.keys(managedAccounts).length) {
      currentPage += 1;
      renderManagedAccountsTable(currentPage);
      updateManageAccountsCurrentPage(currentPage);
    }
  });

  // Load the first page by default
  renderManagedAccountsTable(currentPage);
  updateManageAccountsCurrentPage(currentPage);
}

// Initialize Manage Accounts screen once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupManageAccountsPagination();
});
