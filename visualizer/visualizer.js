document.addEventListener('DOMContentLoaded', function() {
    // Initialize DataTable
    const table = $('#analysisTable').DataTable({
        ajax: {
            url: 'data.json',
            dataSrc: ''
        },
        columns: [
            { data: 'Category' },
            { data: 'Type' },
            { data: 'Name' },
            { data: 'File' },
            { data: 'Line' }
        ],
        dom: 'Bfrtip',
        buttons: [
            'copy', 'csv', 'excel'
        ],
        pageLength: 25,
        order: [[0, 'asc'], [4, 'asc']],
        initComplete: function(settings, json) {
            updateSummaryStats(json);
        }
    });

    // Add category filter
    $('.category-filter').on('click', function() {
        const category = $(this).data('category');
        table.column(0).search(category).draw();
    });

    // Update summary statistics
    function updateSummaryStats(data) {
        const stats = data.reduce((acc, curr) => {
            const category = curr.Category;
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        document.getElementById('sinks-count').textContent = stats['DataSink'] || 0;
        document.getElementById('sources-count').textContent = stats['DataSource'] || 0;
        document.getElementById('auth-count').textContent = stats['AuthFlow'] || 0;
        document.getElementById('models-count').textContent = stats['DataModel'] || 0;
    }

    // Add row click handler for details
    $('#analysisTable tbody').on('click', 'tr', function() {
        const data = table.row(this).data();
        if (data) {
            showDetails(data);
        }
    });

    function showDetails(data) {
        // You can implement a modal or side panel to show more details
        console.log('Row details:', data);
    }
});
