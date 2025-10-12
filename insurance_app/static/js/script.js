/*
 * This is the main controller script for the entire insurance requirement form.
 * It dynamically loads all form sections, initializes their respective JavaScript functionalities,
 * and handles the final form submission and preview generation.
 * It is used by: Health_Insurance_Requirement_Form.html
 */
document.addEventListener('DOMContentLoaded', function() {
        // @Srihari
    // Reset submit button state on page load
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
    }
    // Also reset on pageshow (for bfcache/back navigation)
    window.addEventListener('pageshow', function() {
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
        }
    });
    // --- Session Management ---
    // Clear previous members and summary data on fresh form load,
    // but preserve state when returning from Summary/Preview.
    try {
        const returning = sessionStorage.getItem('returningFromSummary') === '1';
        if (!returning) {
            localStorage.removeItem('members');
            localStorage.removeItem('formSummary');
            localStorage.removeItem('editMemberId');
        } else {
            // Clear the one-time flag
            sessionStorage.removeItem('returningFromSummary');
        }
    } catch (e) { /* ignore */ }
    sessionStorage.setItem('formSessionActive', 'true');

    // Function to load HTML content into a placeholder and return a promise
        /**
     * Fetches and loads the content of an HTML file into a specified placeholder.
     * It wraps the content in a collapsible <details> element.
     * @param {string} file - The HTML file to load.
     * @param {string} placeholderId - The ID of the element to load the content into.
     * @param {string} title - The title for the collapsible section.
     * @param {number} index - The index of the section, used to keep the first section open by default.
     */
    function loadHTML(file, placeholderId, title, index) {
        // Load from /html directory explicitly

        return fetch(file)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok for ' + file);
                }
                return response.text();
            })
            .then(data => {
                const placeholder = document.getElementById(placeholderId);
                if (placeholder) {
                    // Create details and summary elements for collapsible sections
                    const details = document.createElement('details');
                    const summary = document.createElement('summary');
                    
                    // The first section ('Primary Contact') will be open by default
                    if (index === 0) {
                        details.open = true;
                    }

                    summary.textContent = title;

                    // Create a div to hold the fetched content
                    const contentDiv = document.createElement('div');
                    contentDiv.innerHTML = data;

                    // Assemble the structure
                    details.appendChild(summary);
                    details.appendChild(contentDiv);

                    // Clear the placeholder and append the new structure
                    placeholder.innerHTML = '';
                    placeholder.appendChild(details);
                }
            });
    }

    // --- Section Definitions ---
    const sections = [
        { file: 'Primary_contact.html', placeholder: 'primary-contact-placeholder', title: 'Primary Contact', init: ['initializePrimaryContactValidation', 'initializeDataFetch'] },
        { file: 'Health_History.html', placeholder: 'Health-History-placeholder', title: 'Personal Details & Health History', init: ['initializeSelfDetailsValidation', 'initializeDiseaseDetails'] },
        { file: 'Members_to_be_Covered.html', placeholder: 'members-covered-placeholder', title: 'Members to be Covered', init: ['initializeMemberManagement'] },
        { file: 'Cover_&_Cost_Preferences.html', placeholder: 'cover-cost-placeholder', title: 'Cover & Cost Preferences' },
        { file: 'Existing_Coverage_&_Portability.html', placeholder: 'existing-coverage-placeholder', title: 'Existing Coverage & Portability' },
        { file: 'Claims_&_Service.html', placeholder: 'claims-service-placeholder', title: 'Claims & Service' },
        { file: 'Finance_&_Documentation.html', placeholder: 'Finance-Documentation-placeholder', title: 'Finance & Documentation' },
        { file: 'Comments_Noted.html', placeholder: 'comments-noted-placeholder', title: 'Comments Noted', init: ['initializeCommentsNoted'] }
    ];

    // --- Load all sections ---
    sections.forEach((section, index) => {
        loadHTML(section.file, section.placeholder, section.title, index)
            .then(() => {
                if (section.init) {
                    section.init.forEach(funcName => {
                        if (typeof window[funcName] === 'function') {
                            window[funcName]();
                        }
                    });
                }
            })
            .catch(error => console.error(`Error loading ${section.title}:`, error));
    });

    // --- Helper function to get data from a section ---
        /**
     * Extracts all form data from a given section based on its placeholder ID.
     * @param {string} placeholderId - The ID of the section's placeholder element.
     * @returns {object|null} An object containing the form data, or null if the container is not found.
     */
    const getSectionData = (placeholderId) => {
        const container = document.getElementById(placeholderId);
        if (!container) return null;
        const data = {};
        container.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.name) {
                if (el.type === 'radio') {
                    if (el.checked) data[el.name] = el.value;
                } else if (el.type === 'checkbox') {
                    if (!data[el.name]) data[el.name] = [];
                    if (el.checked) data[el.name].push(el.value);
                } else {
                    data[el.name] = el.value;
                }
            }
        });
        return data;
    };

        /**
     * Utility to apply default values for empty or 'Select' fields
     */
    function applyDefaults(target, defaults) {
        for (const key in defaults) {
            if (!target[key] || target[key] === 'Select' || target[key].toString().trim() === '') {
                target[key] = defaults[key];
            }
        }
    }

    // --- Update People Counter ---
    window.updatePeopleCounter = function() {
        const ageInput = document.getElementById('self-age');
        const adultCountEl = document.getElementById('adult-count');
        const childCountEl = document.getElementById('child-count');
        let adults = 0, children = 0;
        const ageVal = ageInput ? parseInt(ageInput.value, 10) : NaN;
        if (!isNaN(ageVal)) {
            if (ageVal < 26) children++;
            else adults++;
        }
        const members = JSON.parse(localStorage.getItem('members')) || [];
        members.forEach(m => {
            const a = parseInt(m.age, 10);
            if (!isNaN(a)) {
                if (a < 26) children++;
                else adults++;
            }
        });
        if (adultCountEl) adultCountEl.textContent = adults;
        if (childCountEl) childCountEl.textContent = children;
    };

// --- Main Form Logic ---
    const form = document.getElementById('insurance-form');
    if (!form) return;

    // --- Submit Functionality ---
    form.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent default form submission

        // Custom per-field validation
        const errors = [];
        // 1) Desired Sum Insured must be numeric
        const sumEl = document.querySelector('#cover-cost-placeholder input[name="sum-insured"]');
        if (sumEl.value.trim() && !sumEl.value.trim().match(/^[0-9]+$/)) {
            errors.push({ el: sumEl, msg: 'Desired Sum Insured must be numeric.' });
        }
        // 2) Annual Budget must be numeric
        const budgetEl = document.querySelector('#cover-cost-placeholder input[name="annual-budget"]');
        if (budgetEl.value.trim() && !budgetEl.value.trim().match(/^[0-9]+$/)) {
            errors.push({ el: budgetEl, msg: 'Annual Budget must be numeric.' });
        }

        
        if (errors.length) {
            const firstError = errors[0];
            const sec = firstError.el.closest('details');
            if (sec && !sec.open) sec.open = true;
            firstError.el.focus();
            alert(firstError.msg);
            return; // Stop before fetch
        }

        const primaryContactData = getSectionData('primary-contact-placeholder');

        const formData = {
            // Lift key fields to the top level for the server
            unique_id: primaryContactData ? primaryContactData.unique_id : null,
            applicant_name: primaryContactData ? primaryContactData.applicant_name : null,
            
            // Keep the nested structure for full data preservation
            primaryContact: primaryContactData,
            healthHistory: getSectionData('Health-History-placeholder'),
            members: JSON.parse(localStorage.getItem('members')) || [],
            coverAndCost: getSectionData('cover-cost-placeholder'),
            existingCoverage: getSectionData('existing-coverage-placeholder'),
            claimsAndService: getSectionData('claims-service-placeholder'),
            financeAndDocumentation: getSectionData('Finance-Documentation-placeholder'),
            commentsNoted: window.getCommentsData ? window.getCommentsData() : { comments_noted: [] }
        };

        const userId = localStorage.getItem('loggedInUserId');

            // Apply default values to unset fields
    applyDefaults(formData.primaryContact, { hubs: 'Nation wide' });
    applyDefaults(formData.coverAndCost, {
        'policy-type': 'individual',
        'policy-term': '1-year',
        'payment-mode': 'annual',
        'room-preference': 'any',
        'co-pay': 'no',
        'ncb-importance': 'high',
        'maternity-cover': 'no',
        'opd-cover': 'no',
        'top-up': 'no'
    });

        applyDefaults(formData.existingCoverage, {
        'existing-policies': 'None',
        'port-policy': 'No',
        'critical-illness': 'None',
        'worldwide-cover': 'No'
    });
    applyDefaults(formData.claimsAndService, {
        'past-claims': 'None',
        'claim-issues': 'None',
        'service-expectations': 'None',
        'network-hospitals': 'None'
    });
    applyDefaults(formData.financeAndDocumentation, {
        'tax-benefit': 'yes',
        'address_proof_details': 'Not Submitted'
    });

    // Disable submit button to prevent double submission
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
        }

        fetch('/submit', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-User-Id': userId || 'Unknown'
            },
            body: JSON.stringify({ userId, formData }),
        })
        .then(async response => {
            if (response.ok) {
                const result = await response.json();
                // Store the full form data for the summary page
                localStorage.setItem('submissionData', JSON.stringify(formData));
                // Also store it under formSummary for the summary script
                localStorage.setItem('formSummary', JSON.stringify(formData));
                // Store returned plan suggestions
                localStorage.setItem('plans', JSON.stringify(result.plans));
                
                if (submitBtn) {
                    submitBtn.textContent = 'Submitted Successfully!';
                    submitBtn.style.backgroundColor = '#28a745';
                }
                
                alert('Form submitted successfully! Submission ID: ' + result.submissionId);
                // Redirect to summary page
                window.location.href = `Summary.html?unique_id=${formData.unique_id}`;
            } else {
                let errorMessage = 'Please check your connection and try again.';
                try {
                    const error = await response.json();
                    errorMessage = error.error || error.message || errorMessage;
                } catch (e) {
                    const textError = await response.text().catch(() => '');
                    errorMessage = textError || `Server error (${response.status})`;
                }
                console.error('Submission failed:', errorMessage);
                alert(`Submission failed: ${errorMessage}`);
                
                // Re-enable submit button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit';
                    submitBtn.style.backgroundColor = '';
                }
            }
        })
        .catch(error => {
            console.error('Error submitting form:', error);
            let errorMessage = 'Please check your connection and try again.';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Network connection failed. Please check your internet connection.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            alert(`Connection error: ${errorMessage}`);
            
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit';
                submitBtn.style.backgroundColor = '';
            }
        });
    });

    // --- Preview Functionality ---
    const previewBtn = document.getElementById('preview-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', function() {
            const summaryData = {
                primaryContact: getSectionData('primary-contact-placeholder'),
                healthHistory: getSectionData('Health-History-placeholder'),
                members: JSON.parse(localStorage.getItem('members')) || [],
                coverAndCost: getSectionData('cover-cost-placeholder'),
                existingCoverage: getSectionData('existing-coverage-placeholder'),
                claimsAndService: getSectionData('claims-service-placeholder'),
                financeAndDocumentation: getSectionData('Finance-Documentation-placeholder'),
                commentsNoted: window.getCommentsData ? window.getCommentsData() : { comments_noted: [] }
            };

                // Apply default values for preview
            applyDefaults(summaryData.primaryContact, { hubs: 'Nation wide' });
            applyDefaults(summaryData.coverAndCost, {
                'policy-type': 'individual',
        'sum-insured': '00',
        'annual-budget': '00',
        'payment-mode': 'annual',
        'room-preference': 'any',
        'co-pay': 'no',
        'ncb-importance': 'high',
        'maternity-cover': 'no',
        'opd-cover': 'no',
        'top-up': 'no'
    });
        // Apply default values for preview on remaining sections
    applyDefaults(summaryData.existingCoverage, {
        'existing-policies': 'None',
        'port-policy': 'No',
        'critical-illness': 'None',
        'worldwide-cover': 'No'
    });
    applyDefaults(summaryData.claimsAndService, {
        'past-claims': 'None',
        'claim-issues': 'None',
        'service-expectations': 'None',
        'network-hospitals': 'None'
    });
    applyDefaults(summaryData.financeAndDocumentation, {
        'tax-benefit': 'yes',
        'address_proof_details': 'Not Submitted'
    });
    localStorage.setItem('formSummary', JSON.stringify(summaryData));
            try { sessionStorage.setItem('previousFormPage', window.location.pathname); } catch(e) {}
            window.open('Preview.html', '_blank');
        });
    }
});
