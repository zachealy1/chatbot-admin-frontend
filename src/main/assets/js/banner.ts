document.addEventListener('DOMContentLoaded', () => {
  // Using ! to tell TypeScript we know these elements are never null
  const bannerTitleInput = document.getElementById('bannerTitle')! as HTMLInputElement;
  const bannerBodyTextarea = document.getElementById('bannerBody')! as HTMLTextAreaElement;
  const bannerPreview = document.getElementById('banner-preview')! as HTMLElement;

  function updateBannerPreview(): void {
    const title = bannerTitleInput.value.trim() || 'Contact Support Team';
    const body =
      bannerBodyTextarea.value.trim() ||
      "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.";

    bannerPreview.innerHTML = `
      <div class="govuk-panel govuk-panel--confirmation">
        <h1 class="govuk-panel__title">${title}</h1>
        <div class="govuk-panel__body">
          ${body}
        </div>
      </div>
    `;
  }

  bannerTitleInput.addEventListener('input', updateBannerPreview);
  bannerBodyTextarea.addEventListener('input', updateBannerPreview);
});
