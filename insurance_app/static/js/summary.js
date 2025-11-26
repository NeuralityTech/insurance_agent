/*
 * This script generates the content for the form summary page (Summary.html).
 * It retrieves the form data from local storage and dynamically creates the HTML to display it.
 * It is used by: Summary.html and Preview.html
 */
document.addEventListener('DOMContentLoaded', function() {
    const summaryContainer = document.getElementById('summary-container');
    const summaryData = JSON.parse(localStorage.getItem('formSummary'));

    if (!summaryData) {
        summaryContainer.innerHTML = '<p>No summary data found. Please submit the form first.</p>';
        return;
    }

    // --- NEW: Fallback to derive healthHistory from submissionData if missing/empty ---
    try {
        const hasHealthHistory =
            summaryData.healthHistory &&
            typeof summaryData.healthHistory === 'object' &&
            Object.keys(summaryData.healthHistory).length > 0;

        if (!hasHealthHistory) {
            const submissionRaw = JSON.parse(localStorage.getItem('submissionData') || '{}');
            const derived = {};

            Object.entries(submissionRaw).forEach(([key, value]) => {
                if (!value || String(value).trim() === '') return;

                if (
                    key.startsWith('medical-') || key.startsWith('medical_') ||
                    key.startsWith('disease-') || key.startsWith('disease_') ||
                    key === 'self-details' || key === 'self_details'
                ) {
                    derived[key] = value;
                }
            });

            if (Object.keys(derived).length > 0) {
                summaryData.healthHistory = derived;
            }
        }
    } catch (e) {
        console.warn('Health history fallback failed:', e);
    }
    // --- END NEW BLOCK ---

    // Fallbacks to ensure Preview shows data even before final submission
    try {
        if (!summaryData.members || !Array.isArray(summaryData.members) || summaryData.members.length === 0) {
            const storedMembers = JSON.parse(localStorage.getItem('members') || '[]');
            if (Array.isArray(storedMembers) && storedMembers.length > 0) {
                summaryData.members = storedMembers;
            }
        }
    } catch (e) {}

    try {
        if (!summaryData.commentsNoted || !Array.isArray(summaryData.commentsNoted?.comments_noted) || summaryData.commentsNoted.comments_noted.length === 0) {
            const storedComments = JSON.parse(localStorage.getItem('comments_noted') || '[]');
            if (Array.isArray(storedComments) && storedComments.length > 0) {
                summaryData.commentsNoted = { comments_noted: storedComments };
            }
        }
    } catch (e) {}

    let html = '';

    // Function to create a summary section
    /**
     * Creates an HTML fieldset section for a given part of the summary data.
     * @param {string} title - The title of the section.
     * @param {object} data - The data object for the section.
     * @returns {string} The HTML string for the section.
     */
    function createSection(title, data) {
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            return ''; // nothing to render
        }

        let sectionHtml = `<fieldset><legend>${title}</legend><div class="summary-grid">`;
        for (const [key, value] of Object.entries(data)) {
            let displayValue = value;
            if ((key === 'planned-surgeries' || key === 'plannedSurgeries') && (!value || String(value).trim() === '')) {
                displayValue = 'None';
            } else if (!value) {
                continue; // Skip other empty fields
            }
            // Skip internal-only fields that should not be shown
            if (key === 'occupation_value' || key === 'occupationValue') continue;
            // Replace underscores and hyphens for nicer labels
            const formattedKey = key.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${displayValue}</div>`;
        }
        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }

    function renderPrimaryContactSection(primary) {
        let sectionHtml = `<fieldset><legend>Applicant Details</legend><div class="summary-grid">`;

        if (primary && typeof primary === 'object') {

            const cmRaw = primary['self-height'] || primary['height'] || primary['self_height'];
            let heightDisplay = '';
            const heightCm = parseFloat(cmRaw);

            if (!isNaN(heightCm) && heightCm > 0) {
                const parts = cmToFeetInches(heightCm);
                if (parts) {
                    heightDisplay = `${parts.feet} ft ${parts.inches} in`;
                }
            }

            // Hide these
            const excludedKeys = new Set([
                'self-height', 'self_height', 'self-height-ft', 'self-height-in',
                'self_height_ft', 'self_height_in', 'height_ft', 'height_in',
                'occupation_value', 'occupationValue'
            ]);

            // Preferred order with height before weight
            const orderedFields = [
                'unique_id', 'applicant_name', 'gender', 'occupation', 'self-dob',
                'self-age',

                // we inject height here
                '__HEIGHT__',

                'self-weight', 'self-bmi', 'email', 'phone', 'aadhaar_last5', 'address', 'hubs'
            ];

            for (const field of orderedFields) {

                if (field === '__HEIGHT__') {
                    if (heightDisplay) {
                        sectionHtml += `<div class="summary-item"><strong>Height:</strong> ${heightDisplay}</div>`;
                    }
                    continue;
                }

                const value = primary[field];
                if (!value) continue;
                if (excludedKeys.has(field)) continue;

                const formattedKey = field.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${value}</div>`;
            }
        }

        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }


    // Primary Contact
    if (summaryData.primaryContact) {
        html += renderPrimaryContactSection(summaryData.primaryContact);
    }

    // Self Health Details (Proposer)
    if (summaryData.healthHistory && Object.keys(summaryData.healthHistory || {}).length > 0) {
        html += createSection('Proposer\'s Health Details', summaryData.healthHistory);
    }

    // Members
    if (summaryData.members && summaryData.members.length > 0) {
        html += '<fieldset><legend>Members to be Covered</legend>';
        summaryData.members.forEach(member => {
            html += '<div class="summary-member-card">';
            // Compute a combined Height display from stored cm, if available
            let heightDisplay = '';
            const heightCm = parseFloat(member.height || member['member-height'] || member.self_height);
            if (!isNaN(heightCm) && heightCm > 0 && typeof cmToFeetInches === 'function') {
                const parts = cmToFeetInches(heightCm);
                if (parts && (parts.feet || parts.inches === 0)) {
                    heightDisplay = `${parts.feet} ft ${parts.inches} in`;
                }
            }
            // Ordered display of member fields (excluding plannedSurgeries and raw height)
            const memberFieldsOrder = [
                'name', 'relationship', 'occupation', 'gender', 'dob', 'age', '__HEIGHT__', 'weight', 'bmi',
                'smoker', 'alcohol', 'riskyHobbies', 'occupationalRisk', 'occupationalRiskDetails'
            ];
            memberFieldsOrder.forEach(field => {
                if (field === '__HEIGHT__') {
                    if (heightDisplay) {
                        html += `<div class="summary-item"><strong>Height:</strong> ${heightDisplay}</div>`;
                    }
                    return;
                }

                const fieldValue = member[field];
                if (!fieldValue) return;

                const formattedKey = field
                    .replace(/_/g, ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, l => l.toUpperCase());

                html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${fieldValue}</div>`;
            });
            // Disease details for member
            if (member.healthHistory && typeof member.healthHistory === 'object') {
                Object.entries(member.healthHistory).forEach(([disease, detail]) => {
                    if (!disease || !detail) return;
                    
                    // Display disease details
                    const formattedKey = disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' Details';
                    html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${detail}</div>`;
                    
                    // Display disease start date if it exists
                    const startDateKey = `${disease}_start_date`;
                    if (member[startDateKey]) {
                        const startDateFormatted = disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' Start Date';
                        html += `<div class="summary-item"><strong>${startDateFormatted}:</strong> ${member[startDateKey]}</div>`;
                    }
                });
            }
            // Planned Surgeries for member (always after disease details)
            let planned = member.plannedSurgeries;
            if (!planned || planned.toString().trim() === '') {
                planned = 'None';
            }
            html += `<div class="summary-item"><strong>Planned Surgeries:</strong> ${planned}</div>`;
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

    summaryContainer.innerHTML = html;
    // Ensure comments are rendered even if not present in local cache
    renderCommentsSectionIfAvailable();

    // Comments Noted table (with fallback fetch by unique_id if missing)
    async function renderCommentsSectionIfAvailable() {
        let commentsArray = null;
        if (summaryData.commentsNoted && Array.isArray(summaryData.commentsNoted?.comments_noted) && summaryData.commentsNoted.comments_noted.length > 0) {
            commentsArray = summaryData.commentsNoted.comments_noted;
        }
        // If not available, try localStorage mirror (already attempted above), then fetch from server using unique_id
        if (!commentsArray || commentsArray.length === 0) {
            try {
                // Derive unique_id from URL or summary
                const urlParams = new URLSearchParams(window.location.search);
                let uid = urlParams.get('unique_id');
                if (!uid && summaryData && summaryData.primaryContact) {
                    uid = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
                }
                if (uid) {
                    const resp = await fetch(`/submission/${encodeURIComponent(uid)}/comments`);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && Array.isArray(data.comments)) {
                            commentsArray = data.comments;
                        }
                    }
                }
            } catch (e) {
                // Non-fatal if fetch fails; simply skip rendering
            }
        }

        if (commentsArray && commentsArray.length > 0) {
            let cHtml = '<fieldset><legend>Comments Noted</legend>';
            cHtml += '<table class="comments-table"><thead><tr><th>Date/Time</th><th>Author</th><th>Comment</th></tr></thead><tbody>';
            commentsArray.forEach(c => {
                const ts = formatTimestampSummary(c.created_at || c.timestamp);
                const author = escapeHtmlSummary(c.author || c.user || 'User');
                const text = escapeHtmlSummary(c.text || c.comment || '');
                cHtml += `<tr><td>${ts}</td><td>${author}</td><td>${text}</td></tr>`;
            });
            cHtml += '</tbody></table></fieldset>';
            summaryContainer.insertAdjacentHTML('beforeend', cHtml);
        }

        // Wire up Back and Next buttons for Preview/Summary navigation
        const proposedBtn = document.getElementById('proposed-plans-btn');

        if (proposedBtn) {
            let uniqueId = null;

            if (summaryData.primaryContact) {
                uniqueId = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
            }

            if (uniqueId) {
                const targetUrl = `Proposed_Plans.html?unique_id=${encodeURIComponent(uniqueId)}`;

                fetch(targetUrl, { method: 'GET' })
                    .then(resp => {
                        if (resp && resp.ok) {
                            proposedBtn.style.display = 'inline-block';
                            proposedBtn.disabled = false;
                            proposedBtn.onclick = () => { window.location.href = targetUrl; };
                        }
                    })
                    .catch(() => {});
            }
        }

        const backBtn = document.getElementById('back-btn');
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) {
            nextBtn.disabled = true;
            // For Preview.html, Next goes to Proposed_Plans.html with same unique_id (if available)
            let uniqueId = null;
            if (summaryData.primaryContact) {
                uniqueId = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
            }
            // Only enable Next if target page responds OK
            if (uniqueId) {
                const targetUrl = `Proposed_Plans.html?unique_id=${encodeURIComponent(uniqueId)}`;
                fetch(targetUrl, { method: 'GET' })
                    .then(resp => {
                        if (resp && resp.ok) {
                            nextBtn.disabled = false;
                            nextBtn.onclick = () => { window.location.href = targetUrl; };
                        } else {
                            nextBtn.disabled = true;
                        }
                    })
                    .catch(() => { nextBtn.disabled = true; });
            } else {
                nextBtn.disabled = true;
            }
        }
        if (backBtn) {
            backBtn.style.display = 'inline-block';
            backBtn.onclick = () => {
                try { sessionStorage.setItem('returningFromSummary', '1'); } catch (e) {}
                // Compute unique_id as used elsewhere
                const summary = JSON.parse(localStorage.getItem('formSummary'));
                let uniqueId = null;
                if (summary && summary.primaryContact) {
                    uniqueId = summary.primaryContact['unique_id'] || summary.primaryContact['Unique Id'];
                }
                if (uniqueId) {
                    window.location.href = `Existing_User_Request_Page.html?unique_id=${encodeURIComponent(uniqueId)}`;
                } else {
                    window.location.href = 'Existing_User_Request_Page.html';
                }
            };
        }
    }
});

// Helper functions for Comments Noted in summary
function escapeHtmlSummary(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

function cmToFeetInches(cm) {
    const n = parseFloat(cm);
    if (!n || n <= 0) {
        return null;
    }
    const totalInches = n / 2.54;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round(totalInches - feet * 12);
    if (inches === 12) {
        feet += 1;
        inches = 0;
    }
    return { feet, inches };
}

function formatTimestampSummary(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString('en-IN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            });
        }
    } catch {}
    return escapeHtmlSummary(ts);
}
