// Select all expand buttons
const expandButtons = document.querySelectorAll<HTMLButtonElement>('.expand-button');

// Loop through all buttons and attach the event listener
expandButtons.forEach((button) => {
  button.addEventListener('click', () => {
    // Find the corresponding chart-container
    const chartContainer = button.closest('.chart-container');

    if (!chartContainer) {
      console.error('No chart container found for expansion.');
      return;
    }

    // Open a new window for the expanded graph
    const newWindow = window.open(
      '', // No URL, open an empty window
      'expandedGraph', // Window name
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );

    if (newWindow) {
      // Inject the HTML structure of the chart-container into the new window
      newWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Expanded Graph</title>
          <link rel="stylesheet" href="path/to/your/styles.css">
        </head>
        <body>
          <h1>Expanded Graph</h1>
          <div class="chart-container">
            ${chartContainer.outerHTML || ''}
          </div>
        </body>
        </html>
      `);

      newWindow.document.close(); // Finish loading content
    } else {
      console.error('Unable to open a new window. Please check your browser settings.');
    }
  });
});
