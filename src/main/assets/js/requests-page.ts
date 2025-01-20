interface AccountRequest {
  requestId: number;
  userName: string;
  email: string;
  requestType: string;
  status: string;
  submittedDate: string;
}

// Example data for each page
const accountRequests: { [key: number]: AccountRequest[] } = {
  1: [
    { requestId: 12345, userName: 'John Doe', email: 'john.doe@example.com', requestType: 'Password Reset', status: 'Pending', submittedDate: '2025-01-15' },
    { requestId: 12346, userName: 'Jane Smith', email: 'jane.smith@example.com', requestType: 'Email Update', status: 'Completed', submittedDate: '2025-01-14' },
    { requestId: 12347, userName: 'Alice Brown', email: 'alice.brown@example.com', requestType: 'Account Deletion', status: 'Pending', submittedDate: '2025-01-13' },
    { requestId: 12348, userName: 'Bob Johnson', email: 'bob.johnson@example.com', requestType: 'Username Change', status: 'Denied', submittedDate: '2025-01-12' },
    { requestId: 12349, userName: 'Carol White', email: 'carol.white@example.com', requestType: 'Role Upgrade', status: 'Pending', submittedDate: '2025-01-11' },
  ],
  2: [
    { requestId: 12350, userName: 'Dave Black', email: 'dave.black@example.com', requestType: 'Password Reset', status: 'Completed', submittedDate: '2025-01-10' },
    { requestId: 12351, userName: 'Eve Green', email: 'eve.green@example.com', requestType: 'Email Update', status: 'Pending', submittedDate: '2025-01-09' },
    { requestId: 12352, userName: 'Frank Blue', email: 'frank.blue@example.com', requestType: 'Role Downgrade', status: 'Completed', submittedDate: '2025-01-08' },
    { requestId: 12353, userName: 'Grace Red', email: 'grace.red@example.com', requestType: 'Account Deletion', status: 'Denied', submittedDate: '2025-01-07' },
    { requestId: 12354, userName: 'Hank Yellow', email: 'hank.yellow@example.com', requestType: 'Username Change', status: 'Pending', submittedDate: '2025-01-06' },
  ],
  3: [
    { requestId: 12355, userName: 'Ivan Pink', email: 'ivan.pink@example.com', requestType: 'Password Reset', status: 'Pending', submittedDate: '2025-01-05' },
    { requestId: 12356, userName: 'Julia Violet', email: 'julia.violet@example.com', requestType: 'Email Update', status: 'Completed', submittedDate: '2025-01-04' },
    { requestId: 12357, userName: 'Kevin Orange', email: 'kevin.orange@example.com', requestType: 'Account Deletion', status: 'Denied', submittedDate: '2025-01-03' },
    { requestId: 12358, userName: 'Linda Teal', email: 'linda.teal@example.com', requestType: 'Username Change', status: 'Pending', submittedDate: '2025-01-02' },
    { requestId: 12359, userName: 'Mike Gray', email: 'mike.gray@example.com', requestType: 'Role Upgrade', status: 'Pending', submittedDate: '2025-01-01' },
  ],
};


// Function to render table rows
function renderTableRows(page: number): void {
  const tbody = document.querySelector('.govuk-table__body') as HTMLElement;
  tbody.innerHTML = ''; // Clear existing rows

  if (!accountRequests[page]) {
    console.error(`No data found for page ${page}`);
    return;
  }

  accountRequests[page].forEach((request: AccountRequest) => {
    const tr = document.createElement('tr');
    tr.className = 'govuk-table__row';
    tr.innerHTML = `
      <td class='govuk-table__cell'>${request.requestId}</td>
      <td class='govuk-table__cell'>${request.userName}</td>
      <td class='govuk-table__cell'>${request.email}</td>
      <td class='govuk-table__cell'>${request.requestType}</td>
      <td class='govuk-table__cell'>${request.status}</td>
      <td class='govuk-table__cell'>${request.submittedDate}</td>
      <td class='govuk-table__cell'>
        <form method="post" action="/requests/${request.requestId}/accept" class="govuk-!-display-inline-block">
          <button type="submit" class="govuk-button govuk-!-margin-right-1">
            Accept
          </button>
        </form>
        <form method="post" action="/requests/${request.requestId}/deny" class="govuk-!-display-inline-block">
          <button type="submit" class="govuk-button govuk-button--warning">
            Deny
          </button>
        </form>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Add event listeners for pagination links
function setupPaginationLinks(): void {
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
          renderTableRows(page);

          // Update active page
          updateCurrentPage(currentPage);
        }
      }
    });
  });

  // Event listener for the Previous button
  prevButton.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (currentPage > 1) {
      currentPage -= 1;
      renderTableRows(currentPage);

      // Update active page
      updateCurrentPage(currentPage);
    }
  });

  // Event listener for the Next button
  nextButton.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (currentPage < Object.keys(accountRequests).length) {
      currentPage += 1;
      renderTableRows(currentPage);

      // Update active page
      updateCurrentPage(currentPage);
    }
  });

  // Load the first page by default
  renderTableRows(1);
}

function updateCurrentPage(currentPage: number): void {
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
  setupPaginationLinks();
});
