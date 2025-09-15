/*
 * Renders the proposed plans on a dedicated page.
 * It retrieves the 'plans' object from localStorage and displays each section's plan names.
 */

document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('proposed-container');
    const plansObj = JSON.parse(localStorage.getItem('plans') || 'null');

    if (!plansObj || typeof plansObj !== 'object' || Object.keys(plansObj).length === 0) {
        container.innerHTML = '<p>No proposed plans available.</p>';
        return;
    }

    let html = '';
    Object.entries(plansObj).forEach(([section, names]) => {
        if (Array.isArray(names) && names.length) {
            const sectionTitle = section.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            html += `<fieldset><legend>${sectionTitle}</legend><ul class="plan-list">`;
            names.forEach(name => {
                html += `<li>${name}</li>`;
            });
            html += '</ul></fieldset>';
        }
    });
    container.innerHTML = html;
});
