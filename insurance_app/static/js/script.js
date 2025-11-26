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
    
    // Session Management 
    try {
        const returning = sessionStorage.getItem('returningFromSummary') === '1';
        if (!returning) {
            localStorage.removeItem('members');
            localStorage.removeItem('formSummary');
            localStorage.removeItem('editMemberId');
        } else {
            sessionStorage.removeItem('returningFromSummary');
        }
    } catch (e) { /* ignore */ }
    sessionStorage.setItem('formSessionActive', 'true');

    // Section Definitions 
    const sections = [
        { file: 'Primary_contact.html', id: 'primary-contact', title: 'Applicant Details', init: ['initializePrimaryContactValidation', 'initializeDataFetch', 'initializeOccupationDropdown'] },
        { file: 'Health_History.html', id: 'health-history', title: 'Health History', init: ['initializeSelfDetailsValidation', 'initializeDiseaseDetails'] },
        { file: 'Members_to_be_Covered.html', id: 'members-covered', title: 'Members Covered', init: ['initializeMemberManagement'] },
        { file: 'Cover_&_Cost_Preferences.html', id: 'cover-cost', title: 'Cover & Cost' },
        { file: 'Existing_Coverage_&_Portability.html', id: 'existing-coverage', title: 'Existing Coverage' },
        { file: 'Claims_&_Service.html', id: 'claims-service', title: 'Claims & Service' },
        { file: 'Finance_&_Documentation.html', id: 'finance-documentation', title: 'Finance & Docs' },
        { file: 'Comments_Noted.html', id: 'comments-noted', title: 'Comments', init: ['initializeCommentsNoted'] }
    ];

    // Dynamic sections that can be added conditionally
    const dynamicSections = [
        {
            id: 'plans-selection',
            title: 'Plans',
            condition: (data) => {
                // Only show if status is SUP_APPROVED
                const status = (data.final_status || data.supervisor_approval_status || '').toUpperCase();
                return status === 'SUP_APPROVED';
            },
            render: async (contentDiv, uniqueId) => {
                // This will render the plans selection interface
                if (typeof window.renderPlansTab === 'function') {
                    await window.renderPlansTab(contentDiv, uniqueId);
                }
            }
        }
    ];

    // Global variable to track which dynamic sections are currently active
    window.activeDynamicSections = [];

    let currentTabIndex = 0;

    // Create tab structure
    function createTabStructure() {
        const form = document.getElementById('insurance-form');
        if (!form) return;

        // Remove old placeholder divs
        const oldPlaceholders = form.querySelectorAll('.section');
        oldPlaceholders.forEach(el => el.remove());

        // Create tab container 
        const tabContainer = document.createElement('div');
        tabContainer.className = 'tab-container';

        // Create tab navigation 
        const tabNav = document.createElement('ul');
        tabNav.className = 'tab-navigation';
        tabNav.setAttribute('role', 'tablist');

        sections.forEach((section, index) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'presentation');
            
            const button = document.createElement('button');
            button.className = 'tab-button';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
            button.setAttribute('aria-controls', `tab-panel-${section.id}`);
            button.setAttribute('id', `tab-${section.id}`);
            button.setAttribute('type', 'button');
            button.textContent = section.title;
            button.dataset.index = index;
            
            if (index === 0) {
                button.classList.add('active');
            }

            button.addEventListener('click', () => switchTab(index));
            
            li.appendChild(button);
            tabNav.appendChild(li);
        });

        // Create content container 
        const contentContainer = document.createElement('div');
        contentContainer.className = 'tab-content-container';

        // Create tab content wrappers
        sections.forEach((section, index) => {
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'tab-content-wrapper';
            contentWrapper.setAttribute('role', 'tabpanel');
            contentWrapper.setAttribute('id', `tab-panel-${section.id}`);
            contentWrapper.setAttribute('aria-labelledby', `tab-${section.id}`);
            contentWrapper.dataset.index = index;
            
            if (index === 0) {
                contentWrapper.classList.add('active');
            }

            // Create content div for loaded HTML
            const contentDiv = document.createElement('div');
            contentDiv.id = `${section.id}-content`;
            contentWrapper.appendChild(contentDiv);

            // Create navigation buttons
            const navButtons = document.createElement('div');
            navButtons.className = 'tab-navigation-buttons';

            const backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'btn tab-nav-btn btn-back';
            backBtn.textContent = 'Back';
            backBtn.addEventListener('click', () => switchTab(index - 1));
            if (index === 0) {
                backBtn.style.visibility = 'hidden';
            }

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'btn tab-nav-btn btn-next';
            nextBtn.textContent = 'Next';
            if(index === sections.length - 1)
            {
                nextBtn.style.display = 'none';
            }
            nextBtn.addEventListener('click', () => {
                if (index < sections.length - 1) {
                    switchTab(index + 1);
                }
            });

            navButtons.appendChild(backBtn);
            navButtons.appendChild(nextBtn);
            contentWrapper.appendChild(navButtons);

            contentContainer.appendChild(contentWrapper);
        });

        tabContainer.appendChild(tabNav);
        tabContainer.appendChild(contentContainer);

        // Insert tab container at the beginning of the form
        const firstChild = form.firstChild;
        form.insertBefore(tabContainer, firstChild);
    }

    // Switch to a specific tab
    function switchTab(index) {
        if (index < 0 || index >= sections.length) return;

        currentTabIndex = index;

        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            }
        });

        // Update tab content
        document.querySelectorAll('.tab-content-wrapper').forEach((wrapper, i) => {
            if (i === index) {
                wrapper.classList.add('active');
            } else {
                wrapper.classList.remove('active');
            }
        });

        // Scroll to top of form
        document.querySelector('.tab-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }


    // Load HTML into tab content
    function loadTabContent(section, index) {
        return fetch(section.file)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok for ' + section.file);
                }
                return response.text();
            })
            .then(data => {
                const contentDiv = document.getElementById(`${section.id}-content`);
                if (contentDiv) {
                    contentDiv.innerHTML = data;
                    
                    // Initialize section-specific JavaScript
                    if (section.init) {
                        section.init.forEach(funcName => {
                            if (typeof window[funcName] === 'function') {
                                window[funcName]();
                            }
                        });
                    }
                }
            })
            .catch(error => console.error(`Error loading ${section.title}:`, error));
    }

    // Initialize tabs and load content
    createTabStructure();
    
    // Load all sections
    Promise.all(sections.map((section, index) => loadTabContent(section, index)))
        .then(() => {
            console.log('All sections loaded');
            
            // Only run setupContinueButton on new applicant form
            if (!window.location.pathname.includes('Existing_Applicant_Request_Form.html')) {
                setupContinueButton();
            }
            
            // Set up validation
            setupFormValidation();
        });

    // Function to set up continue button
    function setupContinueButton() {
        const lastTabButtons = document.querySelector('.tab-content-wrapper:last-of-type .tab-navigation-buttons');
        if (!lastTabButtons) return;
        
        const continueBtn = lastTabButtons.querySelector('.btn-next');
        if (!continueBtn) return;
        
        // Remove it from the tab navigation
        continueBtn.remove();
        
        // Create a new Continue button 
        const formActions = document.querySelector('.form-actions');
        if (!formActions) return;
        
        const newContinueBtn = document.createElement('button');
        newContinueBtn.type = 'button';
        newContinueBtn.id = 'continue-btn';
        newContinueBtn.className = 'btn';
        newContinueBtn.textContent = 'Proceed';
        
        // Insert before Save button
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            formActions.insertBefore(newContinueBtn, saveBtn);
        } else {
            formActions.insertBefore(newContinueBtn, formActions.firstChild);
        }
        
        // Add click handler
        newContinueBtn.addEventListener('click', handleContinueClick);
    }

    // Function to validate all required fields
    function validateRequiredFields() {
        const errors = [];
        
        // Validate Primary Contact required fields
        const primaryContactData = getSectionData('primary-contact');
        
        if (!primaryContactData['applicant_name'] || !primaryContactData['applicant_name'].trim()) {
            errors.push('Full Name is required');
        }
        
        if (!primaryContactData['gender'] || primaryContactData['gender'] === 'Select' || primaryContactData['gender'] === '') {
            errors.push('Gender is required');
        }
        
        if (!primaryContactData['email'] || !primaryContactData['email'].trim()) {
            errors.push('Email is required');
        } else {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(primaryContactData['email'])) {
                errors.push('Email must be valid');
            }
        }
        
        if (!primaryContactData['phone'] || !primaryContactData['phone'].trim()) {
            errors.push('Phone is required');
        } else {
            const phonePattern = /^[6-9][0-9]{9}$/;
            if (!phonePattern.test(primaryContactData['phone'])) {
                errors.push('Phone must be valid');
            }
        }

        if (!primaryContactData['aadhaar_last5'] || !primaryContactData['aadhaar_last5'].trim()) {
            errors.push('Aadhaar Last 5 Digits is required');
        } else {
            const aadhaarPattern = /^[0-9]{5}$/;
            if (!aadhaarPattern.test(primaryContactData['aadhaar_last5'])) {
                errors.push('Aadhaar must be exactly 5 digits');
            }
        }

        if (!primaryContactData['address'] || !primaryContactData['address'].trim()) {
            errors.push('Address is required');
        }
        
        // Validate Health Vitals
        if (!primaryContactData['self-dob'] || !primaryContactData['self-dob'].trim()) {
            errors.push('Date of Birth is required');
        }
        
        if (!primaryContactData['self-height'] || !primaryContactData['self-height'].trim()) {
            errors.push('Height is required');
        } else {
            const height = parseFloat(primaryContactData['self-height']);
            if (isNaN(height) || height <= 0) {
                errors.push('Height must be valid');
            }
        }
        
        if (!primaryContactData['self-weight'] || !primaryContactData['self-weight'].trim()) {
            errors.push('Weight is required');
        } else {
            const weight = parseFloat(primaryContactData['self-weight']);
            if (isNaN(weight) || weight <= 0) {
                errors.push('Weight must be valid');
            }
        }
        
        // Validate Cover & Cost numeric fields
        const sumEl = document.querySelector('#cover-cost-content input[name="sum-insured"]');
        if (sumEl && sumEl.value.trim() && !sumEl.value.trim().match(/^[0-9]+$/)) {
            errors.push('Sum Insured must be numeric');
        }
        
        const budgetEl = document.querySelector('#cover-cost-content input[name="annual-budget"]');
        if (budgetEl && budgetEl.value.trim() && !budgetEl.value.trim().match(/^[0-9]+$/)) {
            errors.push('Annual Budget must be numeric');
        }

        // ✅ Validate Disease start dates for PRIMARY APPLICANT
        const healthHistoryContent = document.getElementById('health-history-content');
        if (healthHistoryContent) {
            const diseaseEntries = healthHistoryContent.querySelectorAll('.disease-entry');

            diseaseEntries.forEach(entry => {
                const checkbox = entry.querySelector('input[type="checkbox"][name="disease"], input[type="checkbox"]');
                const dateInput = entry.querySelector('.disease-date-input');
                const errorSpan = entry.querySelector('.error-message');

                if (!checkbox || !dateInput) return;

                // Clear any previous error state
                if (errorSpan) {
                    errorSpan.textContent = '';
                    errorSpan.style.display = 'none';
                }
                dateInput.classList.remove('input-error');

                // Only validate if disease is selected
                if (checkbox.checked) {
                    if (!dateInput.value || dateInput.value.trim() === '') {
                        // Friendly label from the disease header
                        const headerLabel = entry.querySelector('.disease-header label');
                        const diseaseLabel = headerLabel ? headerLabel.textContent.trim() : 'the selected disease';

                        // Add to the same errors array used for height/DOB/etc.
                        errors.push(`Disease start date for ${diseaseLabel} is required`);

                        if (errorSpan) {
                            errorSpan.textContent = 'Disease start date is required';
                            errorSpan.style.display = 'block';
                        }
                        dateInput.classList.add('input-error');
                    }
                }
            });
        }

        
        return errors;
    }

    // Function to setup validation
    function setupFormValidation() {
        const form = document.getElementById('insurance-form');
        if (!form) return;
        
        // Listen for any input changes
        form.addEventListener('input', updateContinueButtonState, true);
        form.addEventListener('change', updateContinueButtonState, true);
        
        // Initial validation check
        setTimeout(updateContinueButtonState, 500);
    }

    // Handle Continue button click
    async function handleContinueClick() {
        const errors = validateRequiredFields();
        
        if (errors.length > 0) {
            // Show alert with all errors
            alert('Please fix the following errors before proceeding:\n\n• ' + errors.join('\n• '));
            
            // Find which tab has the first error and switch to it
            let errorTab = 0; // Default to Primary Contact tab
            
            if (errors.some(err => 
                err.includes('Full Name') || 
                err.includes('Gender') || 
                err.includes('Email') || 
                err.includes('Phone') || 
                err.includes('Address') ||
                err.includes('Date of Birth') ||
                err.includes('Height') ||
                err.includes('Weight') ||
                err.includes('Aadhaar')
            )) {
                errorTab = 0; // Primary Contact tab
            } else if (errors.some(err => err.includes('Disease start date'))) {
                errorTab = 1; // Health History tab
            } else if (errors.some(err => err.includes('Sum Insured') || err.includes('Budget'))) {
                errorTab = 3; // Cover & Cost tab
            }
            
            // Switch to the tab with errors
            switchTab(errorTab);
            
            // Scroll to first error field
            setTimeout(() => {
                const firstError = document.querySelector('.input-error');
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => firstError.focus(), 300);
                }
            }, 300);
            
            return; // Stop here
        }
        
        // Check for duplicate email/phone before proceeding
        const primaryContactData = getSectionData('primary-contact');
        const email = primaryContactData['email'];
        const phone = primaryContactData['phone'];
        
        try {
            const response = await fetch('/check_duplicates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, phone })
            });
            
            if (!response.ok) {
                throw new Error('Failed to check duplicates');
            }
            
            const result = await response.json();
            
            // Check if either email or phone has exceeded the limit
            if (result.email_exceeded) {
                alert('This email address has already been used 5 times. Please use a different email address.');
                return;
            }
            
            if (result.phone_exceeded) {
                alert('This phone number has already been used 5 times. Please use a different phone number.');
                return;
            }
            
        } catch (error) {
            console.error('Error checking duplicates:', error);
        }
        
        // Validation passed - proceed with preview
        const summaryData = {
            primaryContact: getSectionData('primary-contact'),
            healthHistory: getSectionData('health-history'),
            members: JSON.parse(localStorage.getItem('members')) || [],
            coverAndCost: getSectionData('cover-cost'),
            existingCoverage: getSectionData('existing-coverage'),
            claimsAndService: getSectionData('claims-service'),
            financeAndDocumentation: getSectionData('finance-documentation'),
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
        window.location.href = 'Preview.html';
    }

    // Make switchTab globally available
    window.switchToTab = switchTab;

    // Function to get data from a section ---
    const getSectionData = (sectionId) => {
        const container = document.getElementById(`${sectionId}-content`);
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
    window.getSectionData = getSectionData;
    // Utility to apply default values for empty or 'Select' fields
    function applyDefaults(target, defaults) {
        for (const key in defaults) {
            if (!target[key] || target[key] === 'Select' || target[key].toString().trim() === '') {
                target[key] = defaults[key];
            }
        }
    }

    // Update People Counter 
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

    // Main Form Logic 
    const form = document.getElementById('insurance-form');
    if (!form) return;

    // Preview Functionality 
    const previewBtn = document.getElementById('preview-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', async function() {
            // Validate all required fields before allowing preview
            const validationErrors = [];
            
            // Validate Primary Contact required fields
            const primaryContactData = getSectionData('primary-contact');
            
            if (!primaryContactData['applicant_name'] || !primaryContactData['applicant_name'].trim()) {
                validationErrors.push('Full Name is required');
            }
            
            if (!primaryContactData['gender'] || primaryContactData['gender'] === 'Select') {
                validationErrors.push('Gender is required');
            }
            
            if (!primaryContactData['email'] || !primaryContactData['email'].trim()) {
                validationErrors.push('Email is required');
            } else {
                // Basic email format validation
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailPattern.test(primaryContactData['email'])) {
                    validationErrors.push('Email must be a valid email address');
                }
            }
            
            if (!primaryContactData['phone'] || !primaryContactData['phone'].trim()) {
                validationErrors.push('Phone is required');
            } else {
                // Phone pattern validation (10 digits starting with 6-9)
                const phonePattern = /^[6-9][0-9]{9}$/;
                if (!phonePattern.test(primaryContactData['phone'])) {
                    validationErrors.push('Phone must be a valid 10-digit Indian phone number');
                }
            }
            
            if (!primaryContactData['aadhaar_last5'] || !primaryContactData['aadhaar_last5'].trim()) {
                validationErrors.push('Aadhaar Last 5 Digits is required');
            } else {
                const aadhaarPattern = /^[0-9]{5}$/;
                if (!aadhaarPattern.test(primaryContactData['aadhaar_last5'])) {
                    validationErrors.push('Aadhaar must be exactly 5 digits');
                }
            }
            
            if (!primaryContactData['address'] || !primaryContactData['address'].trim()) {
                validationErrors.push('Address is required');
            }
            
            // Validate Health Vitals
            if (!primaryContactData['self-dob'] || !primaryContactData['self-dob'].trim()) {
                validationErrors.push('Date of Birth is required');
            }
            
            if (!primaryContactData['self-height'] || !primaryContactData['self-height'].trim()) {
                validationErrors.push('Height is required');
            } else {
                // Validate height is numeric
                const height = parseFloat(primaryContactData['self-height']);
                if (isNaN(height) || height <= 0) {
                    validationErrors.push('Height must be a valid number greater than 0');
                }
            }
            
            if (!primaryContactData['self-weight'] || !primaryContactData['self-weight'].trim()) {
                validationErrors.push('Weight is required');
            } else {
                // Validate weight is numeric
                const weight = parseFloat(primaryContactData['self-weight']);
                if (isNaN(weight) || weight <= 0) {
                    validationErrors.push('Weight must be a valid number greater than 0');
                }
            }
            
            // Validate Cover & Cost numeric fields
            const coverCostData = getSectionData('cover-cost');
            const sumEl = document.querySelector('#cover-cost-content input[name="sum-insured"]');
            if (sumEl && sumEl.value.trim() && !sumEl.value.trim().match(/^[0-9]+$/)) {
                validationErrors.push('Desired Sum Insured must be numeric');
            }
            const budgetEl = document.querySelector('#cover-cost-content input[name="annual-budget"]');
            if (budgetEl && budgetEl.value.trim() && !budgetEl.value.trim().match(/^[0-9]+$/)) {
                validationErrors.push('Annual Budget must be numeric');
            }

            // If there are validation errors, show them and stop
            if (validationErrors.length > 0) {
                // Find which tab has the first error and switch to it
                let errorTab = 0; // Default to Primary Contact tab
                
                if (validationErrors.some(err => 
                    err.includes('Full Name') || 
                    err.includes('Gender') || 
                    err.includes('Email') || 
                    err.includes('Phone') || 
                    err.includes('Address') ||
                    err.includes('Date of Birth') ||
                    err.includes('Height') ||
                    err.includes('Weight') ||
                    err.includes('Aadhaar')
                )) {
                    errorTab = 0; // Primary Contact tab
                } else if (validationErrors.some(err => err.includes('Sum Insured') || err.includes('Budget'))) {
                    errorTab = 3; // Cover & Cost tab
                }
                
                // Switch to the tab with errors
                if (typeof switchTab === 'function') {
                    switchTab(errorTab);
                }
                
                // Show all errors in alert
                alert('Please fix the following errors before proceeding:\n\n• ' + validationErrors.join('\n• '));
                
                // Focus on the first error field if possible
                setTimeout(() => {
                    const firstErrorField = document.querySelector('#primary-contact-content input.input-error, #primary-contact-content select.input-error');
                    if (firstErrorField) {
                        firstErrorField.focus();
                    }
                }, 300);
                
                return; // Stop preview
            }

            // Check for duplicate email/phone before proceeding
            const email = primaryContactData['email'];
            const phone = primaryContactData['phone'];
            
            try {
                const response = await fetch('/check_duplicates', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, phone })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to check duplicates');
                }
                
                const result = await response.json();
                
                // Check if either email or phone has exceeded the limit
                if (result.email_exceeded) {
                    alert('This email address has already been used 5 times. Please use a different email address.');
                    return;
                }
                
                if (result.phone_exceeded) {
                    alert('This phone number has already been used 5 times. Please use a different phone number.');
                    return;
                }
                
            } catch (error) {
                console.error('Error checking duplicates:', error);
                // Graceful degradation: allow proceed if check fails
            }

            // All validation passed - proceed with preview
            const summaryData = {
                primaryContact: primaryContactData,
                healthHistory: getSectionData('health-history'),
                members: JSON.parse(localStorage.getItem('members')) || [],
                coverAndCost: getSectionData('cover-cost'),
                existingCoverage: getSectionData('existing-coverage'),
                claimsAndService: getSectionData('claims-service'),
                financeAndDocumentation: getSectionData('finance-documentation'),
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
            window.location.href = 'Preview.html';
        });
    }

});