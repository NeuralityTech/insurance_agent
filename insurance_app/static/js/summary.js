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
        if (!summaryData.commentsNoted || !Array.isArray(summaryData.commentsNoted.comments_noted) || summaryData.commentsNoted.comments_noted.length === 0) {
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
        let sectionHtml = `<fieldset><legend>${title}</legend><div class="summary-grid">`;
        for (const [key, value] of Object.entries(data)) {
            if (value) { // Only display if there is a value
                // Replace underscores and hyphens for nicer labels
                const formattedKey = key.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
        // Ordered display of member fields (excluding plannedSurgeries)
        const memberFieldsOrder = [
            'name','relationship','occupation','gender','dob','age','height','weight','bmi',
            'smoker','alcohol','riskyHobbies','occupationalRisk','occupationalRiskDetails'
        ];
        memberFieldsOrder.forEach(field => {
            const fieldValue = member[field];
            const isNone = typeof fieldValue === 'string' && fieldValue.trim().toLowerCase() === 'none';
            if (fieldValue && !isNone) {
                const formattedKey = field
                    .replace(/_/g, ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, l => l.toUpperCase());
                html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${fieldValue}</div>`;
            }
        });
        // Disease details for member
        if (member.healthHistory && typeof member.healthHistory === 'object') {
            Object.entries(member.healthHistory).forEach(([disease, detail]) => {
                if (!disease || !detail) return;
                const formattedKey = disease.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()) + ' Details';
                html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${detail}</div>`;
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
        if (summaryData.commentsNoted && Array.isArray(summaryData.commentsNoted.comments_noted) && summaryData.commentsNoted.comments_noted.length > 0) {
            commentsArray = summaryData.commentsNoted.comments_noted;
        }
        // If not available, try localStorage mirror (already attempted above), then fetch from server using unique_id
        if (!commentsArray || commentsArray.length === 0) {
            try {
                // Derive unique_id from URL or summary
                const urlParams = new URLSearchParams(window.location.search);
                let uid = urlParams.get('unique_id') || urlParams.get('uid') || null;
                if (!uid && summaryData && summaryData.primaryContact) {
                    uid = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'] || null;
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
            cHtml += `
                <table class="comments-table" style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="border:1px solid #ddd; padding:6px; text-align:left;">Modifier (Agent)</th>
                            <th style="border:1px solid #ddd; padding:6px; text-align:left;">Comments</th>
                            <th style="border:1px solid #ddd; padding:6px; text-align:left;">Date &amp; Time</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            commentsArray.forEach(c => {
                const escapedModifier = escapeHtmlSummary(c.modifier || '');
                const escapedComment = escapeHtmlSummary(c.comment || '');
                const formattedTime = formatTimestampSummary(c.timestamp);
                cHtml += `
                    <tr>
                        <td style="border:1px solid #ddd; padding:6px;">${escapedModifier}</td>
                        <td style="border:1px solid #ddd; padding:6px;">${escapedComment}</td>
                        <td style="border:1px solid #ddd; padding:6px;">${formattedTime}</td>
                    </tr>
                `;
            });
            cHtml += `</tbody></table></fieldset>`;
            // Append to the summary
            summaryContainer.insertAdjacentHTML('beforeend', cHtml);
        } else {
            // Render placeholder section when no comments are available
            const emptyHtml = `
                <fieldset><legend>Comments Noted</legend>
                    <p class="muted" style="margin: 0;">No comments</p>
                </fieldset>
            `;
            summaryContainer.insertAdjacentHTML('beforeend', emptyHtml);
        }
    }

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

    // Show and wire up action buttons
    const printBtn = document.getElementById('btn-print');
    const homeBtn = document.getElementById('btn-home');
    const proposedBtn = document.getElementById('proposed-plans-btn');
    const backBtn = document.getElementById('btn-back');
    const nextBtn = document.getElementById('btn-next');

    if (printBtn) {
        printBtn.style.display = 'inline-block';
        printBtn.onclick = () => window.print();
    }
    if (homeBtn) {
        homeBtn.style.display = 'inline-block';
        homeBtn.onclick = () => window.location.href = 'Health_Insurance_Proposal_Request.html';
    }
    if (proposedBtn) {
        // Always show Proposed Plans button (Option 2)
        proposedBtn.style.display = 'inline-block';
        proposedBtn.disabled = false;
        proposedBtn.onclick = () => {
            // Support both 'unique_id' and 'Unique Id' keys
            const summary = JSON.parse(localStorage.getItem('formSummary'));
            let uniqueId = null;
            if (summary && summary.primaryContact) {
                uniqueId = summary.primaryContact['unique_id'] || summary.primaryContact['Unique Id'];
            }
            if (uniqueId) {
                window.location.href = `Proposed_Plans.html?unique_id=${uniqueId}`;
            } else {
                alert('Could not find unique_id to show plans.');
            }
        };
    }

    // Next button: enable only when we can compute the next page (requires unique_id)
    if (nextBtn) {
        // Try to compute unique_id from current summary
        const summary = JSON.parse(localStorage.getItem('formSummary'));
        let uniqueId = null;
        if (summary && summary.primaryContact) {
            uniqueId = summary.primaryContact['unique_id'] || summary.primaryContact['Unique Id'];
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
            try { sessionStorage.setItem('returningFromSummary', '1'); } catch(e) {}
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
});

// Helper functions for Comments Noted in summary
function escapeHtmlSummary(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
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