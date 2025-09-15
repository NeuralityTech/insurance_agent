/*
 * This script generates the content for the form summary page (Summary.html).
 * It retrieves the form data from local storage and dynamically creates the HTML to display it.
 * It is used by: Summary.html
 */
document.addEventListener('DOMContentLoaded', function() {
    const summaryContainer = document.getElementById('summary-container');
    const summaryData = JSON.parse(localStorage.getItem('formSummary'));

    if (!summaryData) {
        summaryContainer.innerHTML = '<p>No summary data found. Please submit the form first.</p>';
        return;
    }

    let html = '';

    // Function to create a summary section
        /**
     * Creates an HTML fieldset section for a given part of the summary data.
     * @param {string} title - The title of the section.
     * @param {object} data - The data object for the section.
     * @returns {string} The HTML string for the section.
     */
    function createSection(title, data) {
        let sectionHtml = `<fieldset><legend>${title}</legend><div class="summary-grid">`;
        for (const [key, value] of Object.entries(data)) {
            if (value) { // Only display if there is a value
                const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${value}</div>`;
            }
        }
        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }

    // Primary Contact
    if (summaryData.primaryContact) {
        html += createSection('Primary Contact', summaryData.primaryContact);
    }

    // Self Health Details
    if (summaryData.healthHistory) {
        html += createSection('Proposer\'s Health Details', summaryData.healthHistory);
    }

    // Members
    if (summaryData.members && summaryData.members.length > 0) {
        html += '<fieldset><legend>Members to be Covered</legend>';
        summaryData.members.forEach(member => {
            html += '<div class="summary-member-card">';
            // Ordered display of member fields
            const memberFieldsOrder = ['name','relationship','occupation','gender','dob','age','height','weight','bmi','plannedSurgeries','smoker','alcohol','riskyHobbies'];
            memberFieldsOrder.forEach(field => {
                const fieldValue = member[field];
                if (fieldValue) {
                    const formattedKey = field.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
                    html += `<div class=\"summary-item\"><strong>${formattedKey}:</strong> ${fieldValue}</div>`;
                }
            });
            // Disease details for member
            if (member.healthHistory && typeof member.healthHistory === 'object') {
                Object.entries(member.healthHistory).forEach(([disease, detail]) => {
                    if (!disease || !detail) return;
                    const formattedKey = disease.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()) + ' Details';
                    html += `<div class=\"summary-item\"><strong>${formattedKey}:</strong> ${detail}</div>`;
                });
            }
            html += '</div>';
        });
        html += '</fieldset>';
    }

    // Cover & Cost Preferences
    if (summaryData.coverAndCost) {
        html += createSection('Cover & Cost Preferences', summaryData.coverAndCost);
    }

    // Existing Coverage
    if (summaryData.existingCoverage) {
        html += createSection('Existing Coverage & Portability', summaryData.existingCoverage);
    }

    // Claims & Service
    if (summaryData.claimsAndService) {
        html += createSection('Claims & Service History', summaryData.claimsAndService);
    }

    // Finance & Documentation
    if (summaryData.financeAndDocumentation) {
        html += createSection('Finance & Documentation', summaryData.financeAndDocumentation);
    }

    // Other Notes
    if (summaryData.otherNotes) {
        html += createSection('Other Notes', summaryData.otherNotes);
    }

    summaryContainer.innerHTML = html;
    // Render plan suggestions if available
    const plans = JSON.parse(localStorage.getItem('plans'));
    if (plans && Array.isArray(plans) && plans.length) {
        let planHtml = '<fieldset><legend>Recommended Plans</legend><div class="plan-grid">';
        plans.forEach(plan => {
            planHtml += `<div class="plan-item">
                <h3>${plan.name || plan.plan_name || 'Plan'}</h3>
                <p>Premium: ${plan.premium}</p>
                <p>Coverage: ${plan.coverage}</p>
            </div>`;
        });
        planHtml += '</div></fieldset>';
        summaryContainer.insertAdjacentHTML('beforeend', planHtml);
    }
});