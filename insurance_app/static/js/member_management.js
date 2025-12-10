/*
 * This script handles all logic for member management with tab-based interface.
 * It manages adding, editing, deleting, and displaying members in tabs.
 * It is used by: Health_Insurance_Requirement_Form.html, Members_to_be_Covered.html.
 */

(function() {
    'use strict';

    let activeMemberId = null;
    let memberTabs = {};
    let hasUnsavedChanges = false;
    let originalFormData = {};

    // Initialize disease details toggles for a form
    function initializeMemberDiseaseDetails(formContainer) {
        const container = formContainer.querySelector('.member-disease-list');
        if (!container) return;

        const currentYear = new Date().getFullYear();

        // Populate year dropdown for members
        function populateMemberYearDropdown(selectEl) {
            if (!selectEl) return;
            
            // Clear existing options except the first placeholder
            while (selectEl.options.length > 1) {
                selectEl.remove(1);
            }
            
            // Add years in descending order (most recent first)
            for (let year = currentYear; year >= 1950; year--) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                selectEl.appendChild(option);
            }
        }

        // Calculate number of years from a given year
        function calculateYearsFromYear(sinceYear) {
            if (!sinceYear || isNaN(sinceYear)) return 0;
            return Math.max(0, currentYear - parseInt(sinceYear));
        }

        // Calculate year from number of years ago
        function calculateYearFromYears(yearsAgo) {
            if (!yearsAgo || isNaN(yearsAgo)) return null;
            return currentYear - parseInt(yearsAgo);
        }

        function setEntryState(entry, checked) {
            const details = entry.querySelector('.disease-details-container');
            const sinceYearSelect = details && details.querySelector('.member-disease-since-year');
            const sinceYearsInput = details && details.querySelector('.member-disease-since-years');
            const textarea = details && details.querySelector('textarea');
            const errorSpan = entry.querySelector('.error-message');

            if (!details) return;

            // Populate year dropdown if present
            if (sinceYearSelect) {
                populateMemberYearDropdown(sinceYearSelect);
            }

            // Check if there's existing data - if so, force checkbox to be checked
            const hasYearValue = sinceYearSelect && sinceYearSelect.value && sinceYearSelect.value !== '';
            const hasYearsValue = sinceYearsInput && sinceYearsInput.value && sinceYearsInput.value !== '' && sinceYearsInput.value !== '0';
            const hasTextValue = textarea && textarea.value && textarea.value.trim() !== '';

            if (!checked && (hasYearValue || hasYearsValue || hasTextValue)) {
                const cb = entry.querySelector('input[type="checkbox"][name="disease"]');
                if (cb) {
                    cb.checked = true;
                    checked = true;
                }
            }

            if (checked) {
                // Show and enable fields
                details.style.display = 'flex';
                
                if (sinceYearSelect) {
                    sinceYearSelect.disabled = false;
                }
                if (sinceYearsInput) {
                    sinceYearsInput.disabled = false;
                }
                if (textarea) {
                    textarea.disabled = false;
                }
                
                // Setup auto-calculation between year and years
                setupMemberAutoCalculation(entry, sinceYearSelect, sinceYearsInput, errorSpan);
                
            } else {
                // Hide and disable fields
                details.style.display = 'none';
                
                if (sinceYearSelect) {
                    sinceYearSelect.value = '';
                    sinceYearSelect.disabled = true;
                }
                if (sinceYearsInput) {
                    sinceYearsInput.value = '';
                    sinceYearsInput.disabled = true;
                }
                if (textarea) {
                    textarea.value = '';
                    textarea.disabled = true;
                }
                
                // Clear error states
                if (sinceYearSelect) sinceYearSelect.classList.remove('input-error');
                if (sinceYearsInput) sinceYearsInput.classList.remove('input-error');
                if (errorSpan) {
                    errorSpan.textContent = '';
                    errorSpan.style.display = 'none';
                }
            }
        }

        function setupMemberAutoCalculation(entry, sinceYearSelect, sinceYearsInput, errorSpan) {
            if (!sinceYearSelect || !sinceYearsInput) return;
            
            // When year is selected, calculate number of years
            if (!sinceYearSelect.dataset.listenerAdded) {
                sinceYearSelect.addEventListener('change', function() {
                    if (this.value && this.value !== '') {
                        const years = calculateYearsFromYear(parseInt(this.value));
                        sinceYearsInput.value = years;
                        validateMemberDiseaseFields(entry, sinceYearSelect, sinceYearsInput, errorSpan);
                    }
                    markFormAsModified();
                });
                sinceYearSelect.dataset.listenerAdded = 'true';
            }
            
            // When years is entered, calculate the year
            if (!sinceYearsInput.dataset.listenerAdded) {
                sinceYearsInput.addEventListener('input', function() {
                    if (this.value && this.value !== '' && !isNaN(this.value)) {
                        const yearsAgo = parseInt(this.value);
                        if (yearsAgo >= 0 && yearsAgo <= 100) {
                            const year = calculateYearFromYears(yearsAgo);
                            if (year >= 1950 && year <= currentYear) {
                                sinceYearSelect.value = year;
                            }
                        }
                        validateMemberDiseaseFields(entry, sinceYearSelect, sinceYearsInput, errorSpan);
                    }
                    markFormAsModified();
                });
                sinceYearsInput.dataset.listenerAdded = 'true';
            }
        }

        function validateMemberDiseaseFields(entry, sinceYearSelect, sinceYearsInput, errorSpan) {
            const checkbox = entry.querySelector('input[type="checkbox"]');
            if (!checkbox || !checkbox.checked) {
                if (errorSpan) {
                    errorSpan.textContent = '';
                    errorSpan.style.display = 'none';
                }
                if (sinceYearSelect) sinceYearSelect.classList.remove('input-error');
                if (sinceYearsInput) sinceYearsInput.classList.remove('input-error');
                return true;
            }
            
            let isValid = true;
            let message = '';
            
            // Check if at least one of year or years is filled
            const hasYear = sinceYearSelect && sinceYearSelect.value && sinceYearSelect.value !== '';
            const hasYears = sinceYearsInput && sinceYearsInput.value && sinceYearsInput.value !== '' && sinceYearsInput.value !== '0';
            
            if (!hasYear && !hasYears) {
                isValid = false;
                message = 'Please enter Since Year or Since Years';
            } else if (sinceYearsInput && sinceYearsInput.value) {
                const yearsVal = parseInt(sinceYearsInput.value);
                if (yearsVal < 0) {
                    isValid = false;
                    message = 'Years cannot be negative';
                } else if (yearsVal > 100) {
                    isValid = false;
                    message = 'Years cannot exceed 100';
                }
            }
            
            if (errorSpan) {
                errorSpan.textContent = message;
                errorSpan.style.display = isValid ? 'none' : 'block';
            }
            
            if (sinceYearSelect) sinceYearSelect.classList.toggle('input-error', !isValid && !hasYear);
            if (sinceYearsInput) sinceYearsInput.classList.toggle('input-error', !isValid && !hasYears);
            
            return isValid;
        }

        container.querySelectorAll('.disease-entry').forEach(entry => {
            const checkbox = entry.querySelector('input[type="checkbox"][name="disease"]');
            if (!checkbox) return;
            setEntryState(entry, checkbox.checked);
            checkbox.addEventListener('change', function() {
                setEntryState(entry, checkbox.checked);
                markFormAsModified();
            });
        });
    }

    // Initialize occupational risk toggle for a form
    function initializeMemberOccupationalRisk(formContainer) {
        const yesRadio = formContainer.querySelector('input[name="member-occupational-risk"][value="yes"]');
        const noRadio = formContainer.querySelector('input[name="member-occupational-risk"][value="no"]');
        const detailsGroup = formContainer.querySelector('.member-occupational-risk-details-group');

        if (!detailsGroup || (!yesRadio && !noRadio)) return;

        function render() {
            const show = yesRadio && yesRadio.checked;
            detailsGroup.style.display = show ? 'block' : 'none';
            const textarea = detailsGroup.querySelector('textarea');
            if (textarea) textarea.disabled = !show;
        }

        if (yesRadio) {
            yesRadio.addEventListener('change', function() {
                render();
                markFormAsModified();
            });
        }
        if (noRadio) {
            noRadio.addEventListener('change', function() {
                render();
                markFormAsModified();
            });
        }
        render();
    }

    // Initialize member occupation dropdown for a specific form
    function initializeMemberOccupationDropdown(formContainer) {
        const input = formContainer.querySelector('.member-occupation');
        const hiddenInput = formContainer.querySelector('.member-occupation-value');
        const dropdown = formContainer.querySelector('.member-occupation-list');
        const occupationalRiskDetailsGroup = formContainer.querySelector('.member-occupational-risk-details-group');
        
        // Secondary occupation elements
        const secondaryCheckbox = formContainer.querySelector('.member-secondary-occupation-checkbox');
        const secondarySection = formContainer.querySelector('.member-secondary-occupation-section');

        if (!input || !dropdown || typeof ALL_OCCUPATIONS === 'undefined') {
            console.warn('Occupation dropdown elements or data not found');
            return null;
        }

        let selectedIndex = -1;
        let filteredOccupations = [];
        
        function updateSecondaryState() {
            if (!secondaryCheckbox) return;
            
            const hasPrimary = input.value && input.value.trim() !== '';
            
            if (!hasPrimary) {
                secondaryCheckbox.checked = false;
                secondaryCheckbox.disabled = true;
                if (secondarySection) secondarySection.style.display = 'none';
            } else {
                secondaryCheckbox.disabled = false;
            }
        }
        
        // Initialize state
        updateSecondaryState();

        function populateDropdown(occupations) {
            dropdown.innerHTML = '';
            
            const otherLi = document.createElement('li');
            otherLi.textContent = 'Other';
            otherLi.classList.add('other-option');
            otherLi.addEventListener('click', () => selectOccupation('Other'));
            dropdown.appendChild(otherLi);

            occupations.forEach((occupation, index) => {
                const li = document.createElement('li');
                li.textContent = occupation;
                li.addEventListener('click', () => selectOccupation(occupation));
                dropdown.appendChild(li);
            });

            filteredOccupations = ['Other', ...occupations];
        }

        function filterOccupations(searchTerm) {
            if (!searchTerm.trim()) {
                return ALL_OCCUPATIONS;
            }
            const term = searchTerm.toLowerCase();
            return ALL_OCCUPATIONS.filter(occupation => 
                occupation.toLowerCase().includes(term)
            );
        }

        function selectOccupation(occupation) {
            input.value = occupation;
            hiddenInput.value = occupation;
            dropdown.classList.remove('show');
            selectedIndex = -1;
            updateOccupationalRisk(occupation);
            updateSecondaryState();
            markFormAsModified();
        }

        function updateOccupationalRisk(occupation) {
            const yesRadio = formContainer.querySelector('input[name="member-occupational-risk"][value="yes"]');
            const noRadio = formContainer.querySelector('input[name="member-occupational-risk"][value="no"]');

            if (!yesRadio || !noRadio || typeof isHazardousOccupation === 'undefined') {
                return;
            }

            const isHazardous = isHazardousOccupation(occupation);

            if (isHazardous === null) {
                return;
            }

            if (isHazardous) {
                yesRadio.checked = true;
                yesRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (occupationalRiskDetailsGroup) {
                    occupationalRiskDetailsGroup.style.display = 'block';
                }
            } else {
                noRadio.checked = true;
                noRadio.dispatchEvent(new Event('change', { bubbles: true }));
                if (occupationalRiskDetailsGroup) {
                    occupationalRiskDetailsGroup.style.display = 'none';
                    const detailsTextarea = formContainer.querySelector('.member-occupational-risk-details');
                    if (detailsTextarea) detailsTextarea.value = '';
                }
            }
        }

        function highlightItem(index) {
            const items = dropdown.querySelectorAll('li');
            items.forEach((item, i) => {
                if (i === index) {
                    item.classList.add('highlighted');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('highlighted');
                }
            });
        }

        input.addEventListener('focus', function() {
            const filtered = filterOccupations(input.value);
            populateDropdown(filtered);
            dropdown.classList.add('show');
            selectedIndex = -1;
        });

        input.addEventListener('input', function(e) {
            if (!e.isTrusted) return;
            const filtered = filterOccupations(input.value);
            populateDropdown(filtered);
            dropdown.classList.add('show');
            selectedIndex = -1;
            updateSecondaryState();
            markFormAsModified();
        });

        input.addEventListener('keydown', function(e) {
            const items = dropdown.querySelectorAll('li');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                highlightItem(selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                highlightItem(selectedIndex);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < filteredOccupations.length) {
                    selectOccupation(filteredOccupations[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                dropdown.classList.remove('show');
                selectedIndex = -1;
            }
        });

        document.addEventListener('click', function(e) {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
                selectedIndex = -1;
            }
        });

        return { updateOccupationalRisk };
    }

    // Initialize member secondary occupation dropdown for a specific form
    function initializeMemberSecondaryOccupationDropdown(formContainer) {
        const input = formContainer.querySelector('.member-secondary-occupation');
        const hiddenInput = formContainer.querySelector('.member-secondary-occupation-value');
        const dropdown = formContainer.querySelector('.member-secondary-occupation-list');

        if (!input || !hiddenInput || !dropdown || typeof ALL_OCCUPATIONS === 'undefined') {
            return null;
        }

        let selectedIndex = -1;
        let filteredOccupations = [];

        function populateDropdown(occupations) {
            dropdown.innerHTML = '';

            const otherLi = document.createElement('li');
            otherLi.textContent = 'Other';
            otherLi.classList.add('other-option');
            otherLi.addEventListener('click', () => selectOccupation('Other'));
            dropdown.appendChild(otherLi);

            occupations.forEach((occupation) => {
                const li = document.createElement('li');
                li.textContent = occupation;
                li.addEventListener('click', () => selectOccupation(occupation));
                dropdown.appendChild(li);
            });

            filteredOccupations = ['Other', ...occupations];
        }

        function filterOccupations(searchTerm) {
            if (!searchTerm.trim()) {
                return ALL_OCCUPATIONS;
            }
            const term = searchTerm.toLowerCase();
            return ALL_OCCUPATIONS.filter(occupation =>
                occupation.toLowerCase().includes(term)
            );
        }

        function selectOccupation(occupation) {
            input.value = occupation;
            hiddenInput.value = occupation;
            dropdown.classList.remove('show');
            selectedIndex = -1;
            markFormAsModified();
        }

        function highlightItem(index) {
            const items = dropdown.querySelectorAll('li');
            items.forEach((item, i) => {
                if (i === index) {
                    item.classList.add('highlighted');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('highlighted');
                }
            });
        }

        input.addEventListener('focus', function() {
            const filtered = filterOccupations(input.value);
            populateDropdown(filtered);
            dropdown.classList.add('show');
            selectedIndex = -1;
        });

        input.addEventListener('input', function(e) {
            if (!e.isTrusted) return;
            const filtered = filterOccupations(input.value);
            populateDropdown(filtered);
            dropdown.classList.add('show');
            selectedIndex = -1;
            markFormAsModified();
        });

        input.addEventListener('keydown', function(e) {
            const items = dropdown.querySelectorAll('li');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                highlightItem(selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                highlightItem(selectedIndex);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < filteredOccupations.length) {
                    selectOccupation(filteredOccupations[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                dropdown.classList.remove('show');
                selectedIndex = -1;
            }
        });

        document.addEventListener('click', function(e) {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
                selectedIndex = -1;
            }
        });

        return true;
    }

    // Mark form as modified
    function markFormAsModified() {
        if (activeMemberId) {
            const currentData = getFormData(getActiveFormContainer());
            const originalData = originalFormData[activeMemberId];
            
            if (originalData && JSON.stringify(currentData) !== JSON.stringify(originalData)) {
                hasUnsavedChanges = true;
                const tab = document.querySelector(`.member-tab[data-member-id="${activeMemberId}"]`);
                if (tab) {
                    tab.classList.add('modified');
                }
            }
        }
    }

    // Get active form container
    function getActiveFormContainer() {
        return document.querySelector('.member-tab-content.active .member-form');
    }

    // Get form data from a container
    function getFormData(formContainer) {
        if (!formContainer) return null;

        // Get name fields
        const firstName = formContainer.querySelector('.member-first-name')?.value.trim() || '';
        const middleName = formContainer.querySelector('.member-middle-name')?.value.trim() || '';
        const lastName = formContainer.querySelector('.member-last-name')?.value.trim() || '';
        
        // Construct full name from parts
        const fullName = [firstName, middleName, lastName].filter(p => p).join(' ');
        
        // Update hidden full name field if it exists
        const hiddenNameField = formContainer.querySelector('.member-name');
        if (hiddenNameField) {
            hiddenNameField.value = fullName;
        }

        const data = {
            name: fullName,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            relationship: formContainer.querySelector('.relationship').value,
            occupation: formContainer.querySelector('.member-occupation').value.trim(),
            secondary_occupation: formContainer.querySelector('.member-secondary-occupation')?.value.trim() || '',
            gender: formContainer.querySelector('.member-gender').value,
            dob: formContainer.querySelector('.member-dob').value,
            age: formContainer.querySelector('.member-age').value,
            height: formContainer.querySelector('.member-height').value.trim(),
            weight: formContainer.querySelector('.member-weight').value.trim(),
            bmi: formContainer.querySelector('.member-bmi').value,
            plannedSurgeries: formContainer.querySelector('.member-planned-surgeries').value.trim(),
            smoker: formContainer.querySelector('input[name="member-smoker"]:checked')?.value || 'no',
            alcohol: formContainer.querySelector('input[name="member-alcohol"]:checked')?.value || 'no',
            riskyHobbies: formContainer.querySelector('input[name="member-risky-hobbies"]:checked')?.value || 'no',
            occupationalRisk: formContainer.querySelector('input[name="member-occupational-risk"]:checked')?.value || 'no',
            occupationalRiskDetails: formContainer.querySelector('.member-occupational-risk-details')?.value.trim() || ''
        };

        // Collect health history
        const healthHistory = {};
        const diseaseDurations = {};

        formContainer.querySelectorAll('.member-disease-list input[name="disease"]').forEach(checkbox => {
            if (!checkbox.checked) return;
            const key = checkbox.value;
            
            // Get details textarea
            const detailsTextarea = formContainer.querySelector(`.member-disease-list textarea[name="${key}_details"]`);
            const detailsValue = detailsTextarea ? detailsTextarea.value.trim() : '';
            healthHistory[key] = detailsValue || "None";
            
            // Get since year
            const sinceYearSelect = formContainer.querySelector(`.member-disease-list select[name="${key}_since_year"]`);
            if (sinceYearSelect && sinceYearSelect.value) {
                diseaseDurations[`${key}_since_year`] = sinceYearSelect.value;
            }
            
            // Get since years
            const sinceYearsInput = formContainer.querySelector(`.member-disease-list input[name="${key}_since_years"]`);
            if (sinceYearsInput && sinceYearsInput.value) {
                diseaseDurations[`${key}_since_years`] = sinceYearsInput.value;
            }
        });

        data.healthHistory = healthHistory;
        // Merge durations into data object at root level
        Object.assign(data, diseaseDurations);

        // Add disease keys array for backend compatibility (same as Health History tab)
        try {
            const diseasesChecked = [];
            if (data.healthHistory && typeof data.healthHistory === 'object') {
                for (const [key, value] of Object.entries(data.healthHistory)) {
                    if (key && key.toString().trim() !== '') {
                        diseasesChecked.push(key);
                    }
                }
            }

            // Add deterministic fields (backward-compatible)
            if (diseasesChecked.length > 0) {
                data.diseases = diseasesChecked;         // e.g. ['diabetes', 'cardiac']
                data.disease = diseasesChecked[0];       
            } else {
                data.diseases = [];
            }
        } catch (e) {
            console.warn('Failed to normalize member diseases:', e);
        }

        return data;
    }

    // Populate form with member data
    function populateForm(formContainer, memberData) {
        if (!formContainer || !memberData) return;

        // Handle name fields - support both new format (first/middle/last) and old format (single name)
        if (memberData.first_name || memberData.last_name) {
            // New format - populate individual fields
            const firstNameField = formContainer.querySelector('.member-first-name');
            const middleNameField = formContainer.querySelector('.member-middle-name');
            const lastNameField = formContainer.querySelector('.member-last-name');
            const hiddenNameField = formContainer.querySelector('.member-name');
            
            if (firstNameField) firstNameField.value = memberData.first_name || '';
            if (middleNameField) middleNameField.value = memberData.middle_name || '';
            if (lastNameField) lastNameField.value = memberData.last_name || '';
            
            // Also set hidden full name field
            const fullName = [memberData.first_name, memberData.middle_name, memberData.last_name]
                .filter(p => p && p.trim()).join(' ');
            if (hiddenNameField) hiddenNameField.value = fullName;
        } else if (memberData.name) {
            // Old format - parse full name into components
            const parts = memberData.name.trim().split(/\s+/).filter(p => p);
            const firstNameField = formContainer.querySelector('.member-first-name');
            const middleNameField = formContainer.querySelector('.member-middle-name');
            const lastNameField = formContainer.querySelector('.member-last-name');
            const hiddenNameField = formContainer.querySelector('.member-name');
            
            if (parts.length >= 1 && firstNameField) {
                firstNameField.value = parts[0];
            }
            if (parts.length >= 3) {
                if (middleNameField) middleNameField.value = parts.slice(1, -1).join(' ');
                if (lastNameField) lastNameField.value = parts[parts.length - 1];
            } else if (parts.length === 2) {
                if (lastNameField) lastNameField.value = parts[1];
            }
            if (hiddenNameField) hiddenNameField.value = memberData.name;
        }
        
        formContainer.querySelector('.relationship').value = memberData.relationship || '';
        formContainer.querySelector('.member-occupation').value = memberData.occupation || '';
        if (formContainer.querySelector('.member-secondary-occupation')) {
            formContainer.querySelector('.member-secondary-occupation').value = memberData.secondary_occupation || '';
            const secondaryCheckbox = formContainer.querySelector('.member-secondary-occupation-checkbox');
            if (secondaryCheckbox) {
                secondaryCheckbox.checked = !!memberData.secondary_occupation;
                secondaryCheckbox.dispatchEvent(new Event('change'));
            }
        }
        formContainer.querySelector('.member-gender').value = memberData.gender || '';
        formContainer.querySelector('.member-dob').value = memberData.dob || '';
        formContainer.querySelector('.member-age').value = memberData.age || '';
        formContainer.querySelector('.member-height').value = memberData.height || '';
        formContainer.querySelector('.member-weight').value = memberData.weight || '';
        formContainer.querySelector('.member-bmi').value = memberData.bmi || '';
        if (typeof updateMemberHeightFeetInchesFromCm === 'function') {
            updateMemberHeightFeetInchesFromCm(formContainer);
        }
        formContainer.querySelector('.member-planned-surgeries').value = memberData.plannedSurgeries || '';

        // Set radio buttons
        if (memberData.smoker) {
            const smokerRadio = formContainer.querySelector(`input[name="member-smoker"][value="${memberData.smoker}"]`);
            if (smokerRadio) smokerRadio.checked = true;
        }
        if (memberData.alcohol) {
            const alcoholRadio = formContainer.querySelector(`input[name="member-alcohol"][value="${memberData.alcohol}"]`);
            if (alcoholRadio) alcoholRadio.checked = true;
        }
        if (memberData.riskyHobbies) {
            const hobbyRadio = formContainer.querySelector(`input[name="member-risky-hobbies"][value="${memberData.riskyHobbies}"]`);
            if (hobbyRadio) hobbyRadio.checked = true;
        }
        if (memberData.occupationalRisk) {
            const riskRadio = formContainer.querySelector(`input[name="member-occupational-risk"][value="${memberData.occupationalRisk}"]`);
            if (riskRadio) {
                riskRadio.checked = true;
                riskRadio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        if (memberData.occupationalRiskDetails) {
            const detailsTextarea = formContainer.querySelector('.member-occupational-risk-details');
            if (detailsTextarea) detailsTextarea.value = memberData.occupationalRiskDetails;
        }

        // Populate health history
        if (memberData.healthHistory) {
            for (const [key, details] of Object.entries(memberData.healthHistory)) {
                const checkbox = formContainer.querySelector(`.member-disease-list input[name="disease"][value="${key}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    const detailsTextarea = formContainer.querySelector(`.member-disease-list textarea[name="${key}_details"]`);
                    if (detailsTextarea) {
                        // If details are "None", show empty field for user convenience
                        detailsTextarea.value = details === 'None' ? '' : details;
                    }
                    
                    // Restore since year if it exists
                    const sinceYearKey = `${key}_since_year`;
                    if (memberData[sinceYearKey]) {
                        const sinceYearSelect = formContainer.querySelector(`.member-disease-list select[name="${key}_since_year"]`);
                        if (sinceYearSelect) {
                            sinceYearSelect.value = memberData[sinceYearKey];
                        }
                    }
                    
                    // Restore since years if it exists
                    const sinceYearsKey = `${key}_since_years`;
                    if (memberData[sinceYearsKey]) {
                        const sinceYearsInput = formContainer.querySelector(`.member-disease-list input[name="${key}_since_years"]`);
                        if (sinceYearsInput) {
                            sinceYearsInput.value = memberData[sinceYearsKey];
                        }
                    }
                    
                    // Backward compatibility: convert old start_date to since_year
                    const startDateKey = `${key}_start_date`;
                    if (memberData[startDateKey] && !memberData[sinceYearKey]) {
                        const dateValue = memberData[startDateKey];
                        if (dateValue) {
                            const year = new Date(dateValue).getFullYear();
                            if (!isNaN(year)) {
                                const sinceYearSelect = formContainer.querySelector(`.member-disease-list select[name="${key}_since_year"]`);
                                if (sinceYearSelect) {
                                    sinceYearSelect.value = year;
                                    // Also calculate years
                                    const currentYear = new Date().getFullYear();
                                    const sinceYearsInput = formContainer.querySelector(`.member-disease-list input[name="${key}_since_years"]`);
                                    if (sinceYearsInput) {
                                        sinceYearsInput.value = Math.max(0, currentYear - year);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Trigger calculations
        formContainer.querySelector('.member-dob').dispatchEvent(new Event('change'));
        formContainer.querySelector('.member-height').dispatchEvent(new Event('input'));
        formContainer.querySelector('.member-occupation').dispatchEvent(new Event('input'));
    }

    // Clear form
    function clearForm(formContainer) {
        if (!formContainer) return;

        // Clear text inputs
        formContainer.querySelectorAll('input[type="text"], input[type="date"], textarea').forEach(input => {
            if (!input.classList.contains('readonly-field')) {
                input.value = '';
            }
        });

        // Reset selects
        formContainer.querySelectorAll('select').forEach(select => {
            select.selectedIndex = 0;
        });

        // Uncheck all disease checkboxes and hide details
        formContainer.querySelectorAll('.disease-entry').forEach(entry => {
            const checkbox = entry.querySelector('input[type="checkbox"]');
            const details = entry.querySelector('.disease-details-container');
            const textarea = details && details.querySelector('textarea');
            
            if (checkbox) checkbox.checked = false;
            if (details) details.style.display = 'none';
            if (textarea) {
                textarea.disabled = true;
                textarea.value = '';
            }
        });

        // Reset radio buttons to 'no'
        ['member-smoker', 'member-alcohol', 'member-risky-hobbies', 'member-occupational-risk'].forEach(name => {
            const noRadio = formContainer.querySelector(`input[name="${name}"][value="no"]`);
            if (noRadio) noRadio.checked = true;
        });

        // Hide occupational risk details
        const occRiskDetails = formContainer.querySelector('.member-occupational-risk-details-group');
        if (occRiskDetails) {
            occRiskDetails.style.display = 'none';
        }

        // Hide secondary occupation
        const secondarySection = formContainer.querySelector('.member-secondary-occupation-section');
        if (secondarySection) {
            secondarySection.style.display = 'none';
            const secondaryCheckbox = formContainer.querySelector('.member-secondary-occupation-checkbox');
            if (secondaryCheckbox) {
                secondaryCheckbox.checked = false;
            }
        }

        // Clear readonly fields
        formContainer.querySelector('.member-age').value = '';
        formContainer.querySelector('.member-bmi').value = '';

        // Update state of dependent fields
        const occupationInput = formContainer.querySelector('.member-occupation');
        if (occupationInput) {
            occupationInput.dispatchEvent(new Event('input'));
        }

        hasUnsavedChanges = false;
        if (activeMemberId) {
            const tab = document.querySelector(`.member-tab[data-member-id="${activeMemberId}"]`);
            if (tab) {
                tab.classList.remove('modified');
            }
        }
    }

    // Create a new member tab
    function createMemberTab(memberId, memberName, isNewMember = false) {
        const tabsContainer = document.getElementById('member-tabs');
        const contentsContainer = document.getElementById('member-tab-contents');
        const template = document.getElementById('member-form-template');

        // For new members being added (not existing members being loaded), don't create tab yet
        // The tab will be created/updated when they save
        if (isNewMember && memberId === 'new') {
            // Check if content already exists
            let existingContent = document.querySelector('.member-tab-content[data-member-id="new"]');
            if (existingContent) {
                return existingContent;
            }
        }

        // Create tab button only for saved members
        if (memberId !== 'new') {
            const tab = document.createElement('div');
            tab.className = 'member-tab';
            tab.dataset.memberId = memberId;
            tab.textContent = memberName || 'Member';
            tab.addEventListener('click', () => switchToTab(memberId));

            // Insert before "+ Add New" tab
            const addNewTab = document.querySelector('.add-new-tab');
            if (addNewTab) {
                tabsContainer.insertBefore(tab, addNewTab);
            } else {
                tabsContainer.appendChild(tab);
            }

            memberTabs[memberId] = memberTabs[memberId] || {};
            memberTabs[memberId].tab = tab;
        }

        // Create tab content
        const content = template.content.cloneNode(true);
        const contentDiv = content.querySelector('.member-tab-content');
        contentDiv.dataset.memberId = memberId;

        // Get the form container for initialization
        const formContainer = contentDiv.querySelector('.member-form');

        // Show delete button only for saved members
        if (memberId !== 'new') {
            const deleteBtn = contentDiv.querySelector('.delete-member-btn');
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
        }

        // Initialize form components
        initializeMemberDiseaseDetails(contentDiv);
        initializeMemberOccupationalRisk(contentDiv);
        initializeMemberOccupationDropdown(contentDiv);
        initializeMemberSecondaryOccupationDropdown(contentDiv);

        const secondaryCheckbox = contentDiv.querySelector('.member-secondary-occupation-checkbox');
        const secondarySection = contentDiv.querySelector('.member-secondary-occupation-section');
        if (secondaryCheckbox && secondarySection) {
            secondaryCheckbox.addEventListener('change', function() {
                secondarySection.style.display = this.checked ? 'block' : 'none';
            });
        }
        
        initializeAgeCalculation(contentDiv);
        initializeBmiCalculation(contentDiv);
        
        // Add change listeners to all form inputs
        formContainer.querySelectorAll('input, select, textarea').forEach(input => {
            input.addEventListener('input', markFormAsModified);
            input.addEventListener('change', markFormAsModified);
        });

        // Add event listeners
        const saveBtn = contentDiv.querySelector('.save-member-btn');
        const clearBtn = contentDiv.querySelector('.clear-member-btn');
        const deleteBtn = contentDiv.querySelector('.delete-member-btn');

        if (saveBtn) saveBtn.addEventListener('click', () => saveMember(memberId));
        if (clearBtn) clearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear this form?')) {
                clearForm(formContainer);
            }
        });
        if (deleteBtn) deleteBtn.addEventListener('click', () => deleteMember(memberId));

        contentsContainer.appendChild(contentDiv);

        memberTabs[memberId] = memberTabs[memberId] || {};
        memberTabs[memberId].content = contentDiv;

        return contentDiv;
    }

    // Switch to a tab
    function switchToTab(memberId) {
        // Check for unsaved changes
        if (hasUnsavedChanges && activeMemberId !== memberId) {
            if (!confirm('You have unsaved changes. Do you want to discard them and switch tabs?')) {
                return;
            }
            hasUnsavedChanges = false;
        }

        // Deactivate all tabs
        document.querySelectorAll('.member-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.member-tab-content').forEach(c => c.classList.remove('active'));

        // Activate selected tab
        const tab = document.querySelector(`.member-tab[data-member-id="${memberId}"]`);
        const content = document.querySelector(`.member-tab-content[data-member-id="${memberId}"]`);

        if (tab) tab.classList.add('active');
        if (content) content.classList.add('active');

        activeMemberId = memberId;

        // Store original form data for comparison
        if (memberId !== 'new') {
            const formContainer = content.querySelector('.member-form');
            originalFormData[memberId] = getFormData(formContainer);
        }
    }

    // Save member
    function saveMember(memberId) {
        const formContainer = getActiveFormContainer();
        if (!formContainer) return;

        const members = JSON.parse(localStorage.getItem('members')) || [];
        const errorDiv = formContainer.querySelector('.member-error');
        const data = getFormData(formContainer);

        const heightFtSelect = formContainer.querySelector('.member-height-ft');
        const heightInSelect = formContainer.querySelector('.member-height-in');

        if (heightFtSelect && heightInSelect && (!heightFtSelect.value || !heightInSelect.value)) {
            if (errorDiv) {
                errorDiv.textContent = 'Please select both feet and inches for height.';
                errorDiv.style.display = 'block';
            }
            return;
        }


        // Validate required fields
        if (!data.first_name || !data.last_name || !data.relationship || !data.gender || !data.dob || !data.height || !data.weight) {
            if (errorDiv) {
                // More specific error message
                if (!data.first_name) {
                    errorDiv.textContent = 'First Name is required';
                } else if (!data.last_name) {
                    errorDiv.textContent = 'Last Name is required';
                } else {
                    errorDiv.textContent = 'Please fill in all required fields marked with *';
                }
                errorDiv.style.display = 'block';
            }
            return;
        }
        // Validate disease duration (since_year or since_years)
        let hasDurationErrors = false;
        formContainer.querySelectorAll('.member-disease-list .disease-entry').forEach(entry => {
            const checkbox = entry.querySelector('input[type="checkbox"][name="disease"]');
            if (checkbox && checkbox.checked) {
                const sinceYearSelect = entry.querySelector('.member-disease-since-year');
                const sinceYearsInput = entry.querySelector('.member-disease-since-years');
                const errorSpan = entry.querySelector('.error-message');
                
                // Check if at least one of year or years is filled
                const hasYear = sinceYearSelect && sinceYearSelect.value && sinceYearSelect.value !== '';
                const hasYears = sinceYearsInput && sinceYearsInput.value && sinceYearsInput.value !== '' && parseInt(sinceYearsInput.value) > 0;
                
                if (!hasYear && !hasYears) {
                    hasDurationErrors = true;
                    if (errorSpan) {
                        errorSpan.textContent = 'Please enter Since Year or Since Years';
                        errorSpan.style.display = 'block';
                    }
                    if (sinceYearSelect) sinceYearSelect.classList.add('input-error');
                    if (sinceYearsInput) sinceYearsInput.classList.add('input-error');
                }
            }
        });

        if (hasDurationErrors) {
            if (errorDiv) {
                errorDiv.textContent = 'Please provide duration for all selected diseases';
                errorDiv.style.display = 'block';
            }
            return;
        }

        // Validate numeric fields
        if (isNaN(parseFloat(data.height)) || parseFloat(data.height) <= 0) {
            if (errorDiv) {
                errorDiv.textContent = 'Height must be a valid number greater than 0';
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (isNaN(parseFloat(data.weight)) || parseFloat(data.weight) < 1) {
            if (errorDiv) {
                errorDiv.textContent = 'Weight must be at least 1 kg';
                errorDiv.style.display = 'block';
            }
            return;
        }

        // Check for duplicate 
        if (memberId === 'new') {
            const duplicate = members.some(m => 
                m.name === data.name && 
                m.relationship === data.relationship && 
                m.dob === data.dob
            );

            if (duplicate) {
                if (errorDiv) {
                    errorDiv.textContent = 'Member already exists';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            // Generate member ID for new member
            const birthYear = data.dob ? new Date(data.dob).getFullYear() : 'YYYY';
            const namePart = data.first_name.replace(/[^a-zA-Z]/g, '').substring(0, 5).toUpperCase();
            const newMemberId = `${namePart}${birthYear}_${Date.now()}`;
            data.id = newMemberId;

            members.push(data);
            localStorage.setItem('members', JSON.stringify(members));

            // Remove the new content and create tab for the saved member
            const newContent = document.querySelector('.member-tab-content[data-member-id="new"]');
            if (newContent) {
                newContent.remove();
            }

            // Create the actual member tab and content
            const contentDiv = createMemberTab(newMemberId, data.name, false);
            const newFormContainer = contentDiv.querySelector('.member-form');
            populateForm(newFormContainer, data);

            // Update memberTabs reference
            delete memberTabs['new'];
            activeMemberId = newMemberId;

            // Switch to the new member's tab
            switchToTab(newMemberId);

            alert('Member added successfully!');
        } else {
            // Update existing member
            const index = members.findIndex(m => m.id === memberId);
            if (index !== -1) {
                data.id = memberId;
                members[index] = data;
                localStorage.setItem('members', JSON.stringify(members));

                // Update tab name if changed
                const tab = document.querySelector(`.member-tab[data-member-id="${memberId}"]`);
                if (tab) {
                    tab.textContent = data.name;
                    tab.classList.remove('modified');
                }

                alert('Member information updated successfully!');
            }
        }

        hasUnsavedChanges = false;
        originalFormData[memberId] = data;

        // Clear cached summary
        localStorage.removeItem('formSummary');

        // Update people counter
        if (typeof window.updatePeopleCounter === 'function') {
            window.updatePeopleCounter();
        }

        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    // Delete member
    function deleteMember(memberId) {
        if (!confirm('Are you sure you want to delete this member?')) {
            return;
        }

        const members = JSON.parse(localStorage.getItem('members')) || [];
        const updatedMembers = members.filter(m => m.id !== memberId);
        localStorage.setItem('members', JSON.stringify(updatedMembers));

        // Remove tab and content
        const tab = document.querySelector(`.member-tab[data-member-id="${memberId}"]`);
        const content = document.querySelector(`.member-tab-content[data-member-id="${memberId}"]`);

        if (tab) tab.remove();
        if (content) content.remove();

        delete memberTabs[memberId];

        // Switch to first available member tab or create new form
        const remainingTabs = document.querySelectorAll('.member-tab:not(.add-new-tab)');
        if (remainingTabs.length > 0) {
            remainingTabs[0].click();
        } else {
            // No members left, show new member form
            const addNewTab = document.querySelector('.add-new-tab');
            if (addNewTab) {
                addNewTab.click();
            }
        }

        // Update people counter
        if (typeof window.updatePeopleCounter === 'function') {
            window.updatePeopleCounter();
        }

        // Clear cached summary
        localStorage.removeItem('formSummary');
    }

    // Create "+ Add New" tab
    function createAddNewTab() {
        const tabsContainer = document.getElementById('member-tabs');
        
        // Check if it already exists
        const existingAddNew = document.querySelector('.add-new-tab');
        if (existingAddNew) return;

        // Create new tab
        const tab = document.createElement('div');
        tab.className = 'member-tab add-new-tab';
        tab.textContent = '+ Add New';
        tab.addEventListener('click', () => {
            // Create "new" content if it doesn't exist
            let existingNewContent = document.querySelector('.member-tab-content[data-member-id="new"]');
            if (!existingNewContent) {
                createMemberTab('new', 'New Member', true);
            }
            switchToTab('new');
        });

        tabsContainer.appendChild(tab);
    }

    // Convert stored cm height into feet/inches dropdown values for a given member form
    function updateMemberHeightFeetInchesFromCm(container) {
        if (!container) return;

        const cmInput  = container.querySelector('.member-height');
        const ftSelect = container.querySelector('.member-height-ft');
        const inSelect = container.querySelector('.member-height-in');

        if (!cmInput || !ftSelect || !inSelect) return;

        const cm = parseFloat(cmInput.value);
        if (!cm || cm <= 0) return;

        let totalInches = cm / 2.54;
        let feet = Math.floor(totalInches / 12);
        let inches = Math.round(totalInches - feet * 12);

        // Handle rounding edge case
        if (inches === 12) {
            feet += 1;
            inches = 0;
        }

        ftSelect.value = (feet !== null && feet !== undefined) ? String(feet) : '';
        inSelect.value = (inches !== null && inches !== undefined) ? String(inches) : '';
    }


    // Initialize age calculation
    function initializeAgeCalculation(contentDiv) {
        const dobInput = contentDiv.querySelector('.member-dob');
        const ageInput = contentDiv.querySelector('.member-age');
        const dobError = contentDiv.querySelector('.member-dob-error');

        if (dobInput) {
            // Set DOB constraints: max = today, min = 100 years ago
            const today = new Date();
            const maxDate = today.toISOString().split('T')[0];
            const minDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate())
                .toISOString().split('T')[0];
            
            dobInput.setAttribute('max', maxDate);
            dobInput.setAttribute('min', minDate);
        }

        if (dobInput && ageInput && typeof calculateAge === 'function') {
            dobInput.addEventListener('change', function() {
                const selectedDate = new Date(this.value);
                const today = new Date();
                const hundredYearsAgo = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
                
                // Validate DOB is not in the future
                if (selectedDate > today) {
                    if (dobError) {
                        dobError.textContent = 'Date of birth cannot be in the future';
                        dobError.style.display = 'block';
                    }
                    dobInput.classList.add('input-error');
                    ageInput.value = '';
                    return;
                }
                
                // Validate DOB is within 100 years
                if (selectedDate < hundredYearsAgo) {
                    if (dobError) {
                        dobError.textContent = 'Date of birth must be within the last 100 years';
                        dobError.style.display = 'block';
                    }
                    dobInput.classList.add('input-error');
                    ageInput.value = '';
                    return;
                }
                
                // Clear error if valid
                if (dobError) {
                    dobError.textContent = '';
                    dobError.style.display = 'none';
                }
                dobInput.classList.remove('input-error');
                
                const age = calculateAge(this.value);
                ageInput.value = age !== null ? age : '';
                if (typeof window.updatePeopleCounter === 'function') {
                    window.updatePeopleCounter();
                }
            });
        }
    }

    // Initialize BMI calculation
    // Initialize BMI calculation (members use ft/in on UI, cm internally)
    function initializeBmiCalculation(contentDiv) {
        const heightInput    = contentDiv.querySelector('.member-height');      // hidden cm
        const heightFtSelect = contentDiv.querySelector('.member-height-ft');   // visible ft
        const heightInSelect = contentDiv.querySelector('.member-height-in');   // visible in
        const weightInput    = contentDiv.querySelector('.member-weight');
        const bmiInput       = contentDiv.querySelector('.member-bmi');

        if (!heightInput || !weightInput || !bmiInput || typeof calculateBmi !== 'function') {
            return;
        }

        // Recalculate BMI using whatever cm value is currently in the hidden field
        function recalcFromCurrentHeight() {
            const cm = parseFloat(heightInput.value);
            const weight = parseFloat(weightInput.value);
            const bmi = calculateBmi(cm, weight);
            bmiInput.value = bmi !== null ? bmi : '';
        }

        // Read ft/in dropdowns → convert to cm → store → recalc BMI
        function syncHeightFromFtInAndRecalc() {
            if (!heightFtSelect || !heightInSelect) {
                recalcFromCurrentHeight();
                return;
            }

            let feet = parseFloat(heightFtSelect.value);
            let inches = parseFloat(heightInSelect.value);

            if (isNaN(feet)) feet = 0;
            if (isNaN(inches)) inches = 0;

            // If both are empty/zero, clear height + BMI
            if (feet <= 0 && inches <= 0) {
                heightInput.value = '';
                bmiInput.value = '';
                return;
            }

            // Normalize inches >= 12 into extra feet
            if (inches >= 12) {
                feet += Math.floor(inches / 12);
                inches = inches % 12;

                heightFtSelect.value = feet ? String(feet) : '';
                heightInSelect.value = inches ? String(inches) : '';
            }

            const cm = feet * 30.48 + inches * 2.54;
            heightInput.value = cm.toFixed(1);
            recalcFromCurrentHeight();
        }

        // When user changes ft/in, recompute cm + BMI
        if (heightFtSelect) {
            heightFtSelect.addEventListener('change', syncHeightFromFtInAndRecalc);
        }
        if (heightInSelect) {
            heightInSelect.addEventListener('change', syncHeightFromFtInAndRecalc);
        }

        // Existing behavior: recalc if cm or weight changes
        heightInput.addEventListener('input', recalcFromCurrentHeight);
        weightInput.addEventListener('input', recalcFromCurrentHeight);
    }


    // Load all existing members into tabs
    function loadExistingMembers() {
        const members = JSON.parse(localStorage.getItem('members')) || [];
        
        // Load all existing members first (this creates their tabs)
        members.forEach(member => {
            const contentDiv = createMemberTab(member.id, member.name, false);
            const formContainer = contentDiv.querySelector('.member-form');
            populateForm(formContainer, member);
            originalFormData[member.id] = member;
        });

        // Create "+ Add New" tab at the end
        createAddNewTab();

        // Activate first tab or show new member form
        if (members.length > 0) {
            switchToTab(members[0].id);
        } else {
            // No existing members, create and show new member form
            createMemberTab('new', 'New Member', true);
            switchToTab('new');
        }
    }

    // Main initialization function
    function initializeMemberManagement() {
        console.log('Initializing member management with tabs...');
        loadExistingMembers();

        // Update people counter
        if (typeof window.updatePeopleCounter === 'function') {
            window.updatePeopleCounter();
        }
    }

    // Make functions globally available
    window.initializeMemberManagement = initializeMemberManagement;
    window.loadMembersGlobal = loadExistingMembers;

    // Auto-initialize if DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMemberManagement);
    }
})();