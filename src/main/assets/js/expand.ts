const expandButton = document.querySelector<HTMLButtonElement>('.expand-button');

if (expandButton) {
  expandButton.addEventListener('click', () => {
    // Open a temporary window
    const newWindow = window.open(
      '', // No URL, open an empty window
      'expandedGraph', // Window name
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );

    if (newWindow) {
      // Set content for the new window
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
            <!-- Insert the HTML structure for your graph -->
            ${document.querySelector('.chart-container')?.outerHTML || ''}
          </div>
        </body>
        </html>
      `);

      newWindow.document.close(); // Finish loading content
    } else {
      console.error('Unable to open a new window. Please check your browser settings.');
    }
  });
}
