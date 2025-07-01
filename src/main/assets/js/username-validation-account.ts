document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form') as HTMLFormElement;

  form.addEventListener('submit', (event: Event) => {
    let isValid = true;

    // === Validate Username ===
    const usernameInput = document.querySelector("input[name='username']") as HTMLInputElement;
    const usernameGroup = usernameInput.closest('.govuk-form-group') as HTMLElement;

    // Remove existing error styles and messages
    usernameGroup.classList.remove('govuk-form-group--error');
    usernameInput.classList.remove('govuk-input--error');
    const existingError = usernameGroup.querySelector('#username-error');
    if (existingError) {
      existingError.remove();
    }

    // Username validation: 3-20 characters; letters, numbers, underscores only
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(usernameInput.value)) {
      isValid = false;
      usernameGroup.classList.add('govuk-form-group--error');
      usernameInput.classList.add('govuk-input--error');

      // Create error message element
      const errorMessage = document.createElement('span');
      errorMessage.id = 'username-error';
      errorMessage.className = 'govuk-error-message';
      errorMessage.innerHTML =
        '<span class="govuk-visually-hidden">Error:</span> Username must be 3-20 characters long and can only contain letters, numbers, and underscores.';

      // Insert the error message below the heading and above the input
      const heading = usernameGroup.querySelector('.govuk-label-wrapper') as HTMLElement;
      heading.insertAdjacentElement('afterend', errorMessage);
    }

    if (!isValid) {
      event.preventDefault();
    }
  });
});
