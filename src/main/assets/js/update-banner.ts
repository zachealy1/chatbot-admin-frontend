document.addEventListener('DOMContentLoaded', () => {
  // grab your elements
  const previewButton = document.getElementById('previewButton') as HTMLButtonElement;
  const discardButton = document.getElementById('discardButton') as HTMLButtonElement;
  const bannerTitleInput = document.getElementById('bannerTitle') as HTMLInputElement;
  const bannerBodyInput = document.getElementById('bannerBody') as HTMLTextAreaElement;
  const bannerPreview = document.getElementById('banner-preview') as HTMLElement;

  if (!previewButton || !discardButton || !bannerTitleInput || !bannerBodyInput || !bannerPreview) {
    console.error('Required elements are missing from the DOM.');
    return;
  }

  // **Capture the _initial_ values and preview HTML** when the page first loads
  const initialTitle = bannerTitleInput.value;
  const initialBody = bannerBodyInput.value;
  const initialPreviewHTML = bannerPreview.innerHTML;

  // Preview button: overwrite preview with whatever's in the inputs
  previewButton.addEventListener('click', e => {
    e.preventDefault();
    const newTitle = bannerTitleInput.value.trim() || initialTitle;
    const newBody = bannerBodyInput.value.trim() || initialBody;

    bannerPreview.innerHTML = `
      <div class="govuk-panel govuk-panel--confirmation">
        <h1 class="govuk-panel__title">${newTitle}</h1>
        <div class="govuk-panel__body">
          ${newBody}
        </div>
      </div>
    `;
  });

  // Discard button: put _exactly_ the original values (and HTML) back
  discardButton.addEventListener('click', e => {
    e.preventDefault();
    bannerTitleInput.value = initialTitle;
    bannerBodyInput.value = initialBody;
    bannerPreview.innerHTML = initialPreviewHTML;
  });
});
