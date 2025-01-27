document.addEventListener('DOMContentLoaded', () => {
  // Define types for elements
  const previewButton = document.getElementById('previewButton') as HTMLButtonElement;
  const discardButton = document.getElementById('discardButton') as HTMLButtonElement;
  const bannerTitleInput = document.getElementById('bannerTitle') as HTMLInputElement;
  const bannerBodyInput = document.getElementById('bannerBody') as HTMLTextAreaElement;
  const bannerPreview = document.getElementById('banner-preview') as HTMLElement;

  // Default values
  const defaultTitle = 'Contact Support Team';
  const defaultBody =
    "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.";

  if (previewButton && discardButton && bannerTitleInput && bannerBodyInput && bannerPreview) {
    // Preview button event
    previewButton.addEventListener('click', (event: Event) => {
      event.preventDefault();

      // Get the values from the input fields
      const newTitle: string = bannerTitleInput.value.trim();
      const newBody: string = bannerBodyInput.value.trim();

      // Update the preview panel
      bannerPreview.innerHTML = `
        <div class="govuk-panel govuk-panel--confirmation">
          <h1 class="govuk-panel__title">${newTitle || defaultTitle}</h1>
          <div class="govuk-panel__body">
            ${newBody || defaultBody}
          </div>
        </div>
      `;
    });

    // Discard button event
    discardButton.addEventListener('click', (event: Event) => {
      event.preventDefault();

      // Reset form fields to default values
      bannerTitleInput.value = defaultTitle;
      bannerBodyInput.value = defaultBody;

      // Reset the preview panel to default values
      bannerPreview.innerHTML = `
        <div class="govuk-panel govuk-panel--confirmation">
          <h1 class="govuk-panel__title">${defaultTitle}</h1>
          <div class="govuk-panel__body">
            ${defaultBody}
          </div>
        </div>
      `;
    });
  } else {
    console.error('Required elements are missing from the DOM.');
  }
});
