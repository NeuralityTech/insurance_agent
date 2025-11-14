/*
 * This script handles all logic for member management in the Members to be Covered section.
 * It manages adding, deleting, and displaying members in an inline form and table.
 * It is used by: Health_Insurance_Requirement_Form.html, Members_to_be_Covered.html.
 */

(function() {
    'use strict';

    let memberOccupationDropdown = null;

    // Note: We use the global calculateAge and calculateBmi from calculations.js
    // These are loaded in the main HTML file before this script

    // Initialize member occupation dropdown
    function initializeMemberOccupationDropdown() {
        const input = document.getElementById('member-occupation');
        const hiddenInput = document.getElementById('member-occupation-value');
        const dropdown = document.getElementById('member-occupation-list');
        const occupationalRiskDetailsGroup = document.getElementById('member-occupational-risk-details-group');

        if (!input || !dropdown || typeof ALL_OCCUPATIONS === 'undefined') {
            console.warn('Occupation dropdown elements or data not found');
            return null;
        }

        let selectedIndex = -1;
        let filteredOccupations = [];

        function populateDropdown(occupations) {
            dropdown.innerHTML = '';
            
            const otherLi = document.createElement('li');
            otherLi.textContent = 'Other';
            otherLi.classList.add('other-option');
            otherLi.setAttribute('role', 'option');
            otherLi.setAttribute('data-index', '0');
            otherLi.addEventListener('click', () => selectOccupation('Other'));
            dropdown.appendChild(otherLi);

            occupations.forEach((occupation, index) => {
                const li = document.createElement('li');
                li.textContent = occupation;
                li.setAttribute('role', 'option');
                li.setAttribute('data-index', index + 1);
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
        }

        function updateOccupationalRisk(occupation) {
            const yesRadio = document.querySelector('input[name="member-occupational-risk"][value="yes"]');
            const noRadio = document.querySelector('input[name="member-occupational-risk"][value="no"]');

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
                    const detailsTextarea = document.getElementById('member-occupational-risk-details');
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

    // Initialize disease details toggles for member form
    function initializeMemberDiseaseDetails() {
        const container = document.getElementById('member-disease-list');
        if (!container) return;

        function setEntryState(entry, checked) {
            const details = entry.querySelector('.disease-details-container');
            const textarea = details && details.querySelector('textarea');
            if (!details || !textarea) return;

            if (checked) {
                details.style.display = 'flex';
                textarea.disabled = false;
            } else {
                details.style.display = 'none';
                textarea.value = '';
                textarea.disabled = true;
                textarea.required = false;
                if (textarea.classList) textarea.classList.remove('error', 'is-invalid');
                if (textarea.removeAttribute) textarea.removeAttribute('aria-invalid');
            }
        }

        container.querySelectorAll('.disease-entry').forEach(entry => {
            const checkbox = entry.querySelector('input[type="checkbox"][name="disease"]');
            if (!checkbox) return;
            setEntryState(entry, checkbox.checked);
            checkbox.addEventListener('change', () => setEntryState(entry, checkbox.checked));
        });
    }

    // Initialize occupational risk toggle for member form
    function initializeMemberOccupationalRisk() {
        const yesRadio = document.querySelector('input[name="member-occupational-risk"][value="yes"]');
        const noRadio = document.querySelector('input[name="member-occupational-risk"][value="no"]');
        const detailsGroup = document.getElementById('member-occupational-risk-details-group');

        if (!detailsGroup || (!yesRadio && !noRadio)) return;

        function render() {
            const show = yesRadio && yesRadio.checked;
            detailsGroup.style.display = show ? 'block' : 'none';
            const textarea = detailsGroup.querySelector('textarea');
            if (textarea) textarea.disabled = !show;
            if (!show && textarea) textarea.value = '';
        }

        if (yesRadio) yesRadio.addEventListener('change', render);
        if (noRadio) noRadio.addEventListener('change', render);
        render();
    }

    // Load and display members in table
    function loadMembersTable() {
        const members = JSON.parse(localStorage.getItem('members')) || [];
        const tableWrapper = document.getElementById('members-table-wrapper');
        const tableBody = document.getElementById('members-table-body');
        const noMembersMsg = document.getElementById('no-members-message');

        if (!tableWrapper || !tableBody || !noMembersMsg) return;

        if (members.length === 0) {
            tableWrapper.style.display = 'none';
            noMembersMsg.style.display = 'block';
            // Update people counter
            if (typeof window.updatePeopleCounter === 'function') {
                window.updatePeopleCounter();
            }
            return;
        }

        tableWrapper.style.display = 'block';
        noMembersMsg.style.display = 'none';
        tableBody.innerHTML = '';

        members.forEach((member) => {
            const row = document.createElement('tr');
            row.dataset.memberId = member.id;

            // Format health history
            let healthHistoryText = 'None';
            if (member.healthHistory && Object.keys(member.healthHistory).length > 0) {
                const conditions = Object.entries(member.healthHistory).map(([key, details]) => {
                    const conditionName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    return details ? `${conditionName}: ${details}` : conditionName;
                });
                healthHistoryText = conditions.join('; ');
            }

            // Truncate health history if too long
            const maxLength = 100;
            let healthHistoryDisplay = healthHistoryText;
            let needsTruncation = healthHistoryText.length > maxLength;
            
            if (needsTruncation) {
                const truncated = healthHistoryText.substring(0, maxLength) + '...';
                healthHistoryDisplay = `
                    <span class="health-history-truncated">${truncated}</span>
                    <span class="health-history-full" style="display:none;">${healthHistoryText}</span>
                    <button class="view-more-btn" data-expanded="false">View More</button>
                `;
            }

            // Format occupational risk display
            let occRiskDisplay = member.occupationalRisk || 'No';
            if (member.occupationalRiskDetails && member.occupationalRiskDetails.trim()) {
                occRiskDisplay += `: ${member.occupationalRiskDetails}`;
            }

            row.innerHTML = `
                <td>${member.name || ''}</td>
                <td>${member.relationship || ''}</td>
                <td>${member.occupation || ''}</td>
                <td>${member.gender || ''}</td>
                <td>${member.dob || ''}</td>
                <td>${member.age || ''}</td>
                <td>${member.height || ''}</td>
                <td>${member.weight || ''}</td>
                <td>${member.bmi || ''}</td>
                <td class="health-history-cell">${healthHistoryDisplay}</td>
                <td>${member.plannedSurgeries || 'None'}</td>
                <td>${member.smoker || 'No'}</td>
                <td>${member.alcohol || 'No'}</td>
                <td>${member.riskyHobbies || 'No'}</td>
                <td>${occRiskDisplay}</td>
                <td><input type="checkbox" class="member-checkbox" data-member-id="${member.id}"></td>
            `;

            tableBody.appendChild(row);

            // Add event listener for view more button
            if (needsTruncation) {
                const viewMoreBtn = row.querySelector('.view-more-btn');
                if (viewMoreBtn) {
                    viewMoreBtn.addEventListener('click', function() {
                        const truncated = row.querySelector('.health-history-truncated');
                        const full = row.querySelector('.health-history-full');
                        const isExpanded = this.dataset.expanded === 'true';

                        if (isExpanded) {
                            truncated.style.display = 'inline';
                            full.style.display = 'none';
                            this.textContent = 'View More';
                            this.dataset.expanded = 'false';
                        } else {
                            truncated.style.display = 'none';
                            full.style.display = 'inline';
                            this.textContent = 'View Less';
                            this.dataset.expanded = 'true';
                        }
                    });
                }
            }
        });

        // Update people counter if available
        if (typeof window.updatePeopleCounter === 'function') {
            window.updatePeopleCounter();
        }
    }

    // Show member form
    function showMemberForm() {
        const formContainer = document.getElementById('member-form-container');
        if (formContainer) {
            formContainer.classList.add('show');
            // Scroll to form
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Hide member form and reset it
    function hideMemberForm() {
        const formContainer = document.getElementById('member-form-container');
        const errorDiv = document.getElementById('member-error');
        
        if (formContainer) {
            formContainer.classList.remove('show');
        }
        
        // Clear all form fields
        clearMemberForm();
        
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
    }

    // Clear member form
    function clearMemberForm() {
        // Clear text inputs
        const textInputs = ['member-name', 'member-occupation', 'member-occupation-value', 
                           'member-dob', 'member-height', 'member-weight', 'member-age', 
                           'member-bmi', 'member-planned-surgeries', 'member-occupational-risk-details'];
        textInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        
        // Reset select fields
        const selectInputs = ['relationship', 'member-gender'];
        selectInputs.forEach(id => {
            const select = document.getElementById(id);
            if (select) select.selectedIndex = 0;
        });
        
        // Uncheck all disease checkboxes and hide details
        const diseaseEntries = document.querySelectorAll('#member-disease-list .disease-entry');
        diseaseEntries.forEach(entry => {
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
        const radioGroups = ['member-smoker', 'member-alcohol', 'member-risky-hobbies', 'member-occupational-risk'];
        radioGroups.forEach(name => {
            const noRadio = document.querySelector(`input[name="${name}"][value="no"]`);
            if (noRadio) noRadio.checked = true;
        });
        
        // Hide occupational risk details
        const occRiskDetails = document.getElementById('member-occupational-risk-details-group');
        if (occRiskDetails) {
            occRiskDetails.style.display = 'none';
        }
    }

    // Save member
    function saveMember() {
        console.log('Save member called');
        
        const members = JSON.parse(localStorage.getItem('members')) || [];
        const errorDiv = document.getElementById('member-error');
        
        const name = document.getElementById('member-name').value.trim();
        const relationship = document.getElementById('relationship').value;
        const occupation = document.getElementById('member-occupation').value.trim();
        const gender = document.getElementById('member-gender').value;
        const dob = document.getElementById('member-dob').value;
        const age = document.getElementById('member-age').value;
        const height = document.getElementById('member-height').value.trim();
        const weight = document.getElementById('member-weight').value.trim();
        const bmi = document.getElementById('member-bmi').value;

        // Validate required fields
        if (!name || !relationship || !gender || !dob || !height || !weight) {
            if (errorDiv) {
                errorDiv.textContent = 'Please fill in all required fields marked with *';
                errorDiv.style.display = 'block';
            }
            return;
        }

        // Validate numeric fields
        if (isNaN(parseFloat(height)) || parseFloat(height) <= 0) {
            if (errorDiv) {
                errorDiv.textContent = 'Height must be a valid number greater than 0';
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (isNaN(parseFloat(weight)) || parseFloat(weight) <= 0) {
            if (errorDiv) {
                errorDiv.textContent = 'Weight must be a valid number greater than 0';
                errorDiv.style.display = 'block';
            }
            return;
        }

        // Check for duplicate
        const duplicate = members.some(m => 
            m.name === name && 
            m.relationship === relationship && 
            m.dob === dob
        );

        if (duplicate) {
            if (errorDiv) {
                errorDiv.textContent = 'Member already exists';
                errorDiv.style.display = 'block';
            }
            return;
        }

        // Collect health history
        const healthHistory = {};
        document.querySelectorAll('#member-disease-list input[name="disease"]').forEach(checkbox => {
            if (!checkbox.checked) return;
            const key = checkbox.value;
            const detailsTextarea = document.querySelector(`#member-disease-list textarea[name="${key}_details"]`);
            healthHistory[key] = detailsTextarea ? detailsTextarea.value.trim() : '';
        });

        // Generate member ID
        const birthYear = dob ? new Date(dob).getFullYear() : 'YYYY';
        const namePart = name.replace(/[^a-zA-Z]/g, '').substring(0, 5).toUpperCase();
        const memberId = `${namePart}${birthYear}_${Date.now()}`;

        // Create member object
        const memberData = {
            id: memberId,
            name: name,
            relationship: relationship,
            occupation: occupation,
            gender: gender,
            dob: dob,
            age: age,
            height: height,
            weight: weight,
            bmi: bmi,
            healthHistory: healthHistory,
            plannedSurgeries: document.getElementById('member-planned-surgeries').value.trim(),
            smoker: document.querySelector('input[name="member-smoker"]:checked')?.value || 'no',
            alcohol: document.querySelector('input[name="member-alcohol"]:checked')?.value || 'no',
            riskyHobbies: document.querySelector('input[name="member-risky-hobbies"]:checked')?.value || 'no',
            occupationalRisk: document.querySelector('input[name="member-occupational-risk"]:checked')?.value || 'no',
            occupationalRiskDetails: document.getElementById('member-occupational-risk-details')?.value.trim() || ''
        };

        members.push(memberData);
        localStorage.setItem('members', JSON.stringify(members));

        // Clear any cached form summary so it rebuilds fresh
        localStorage.removeItem('formSummary');

        // Reload table and hide form
        loadMembersTable();
        hideMemberForm();

        // Show success message (optional)
        console.log('Member added successfully:', memberData);
    }

    // Delete selected members
    function deleteSelectedMembers() {
        const checkboxes = document.querySelectorAll('.member-checkbox:checked');
        
        if (checkboxes.length === 0) {
            alert('Please select at least one member to delete');
            return;
        }

        if (!confirm(`Are you sure you want to delete ${checkboxes.length} member(s)?`)) {
            return;
        }

        const members = JSON.parse(localStorage.getItem('members')) || [];
        const memberIdsToDelete = Array.from(checkboxes).map(cb => cb.dataset.memberId);

        const updatedMembers = members.filter(m => !memberIdsToDelete.includes(m.id));
        localStorage.setItem('members', JSON.stringify(updatedMembers));

        // Clear cached summary
        localStorage.removeItem('formSummary');

        loadMembersTable();
    }

    // Initialize age calculation (uses global calculateAge from calculations.js)
    function initializeAgeCalculation() {
        const dobInput = document.getElementById('member-dob');
        const ageInput = document.getElementById('member-age');

        if (dobInput && ageInput && typeof calculateAge === 'function') {
            dobInput.addEventListener('change', function() {
                const age = calculateAge(this.value);
                ageInput.value = age !== null ? age : '';
                // Update people counter
                if (typeof window.updatePeopleCounter === 'function') {
                    window.updatePeopleCounter();
                }
            });
        }
    }

    // Initialize BMI calculation (uses global calculateBmi from calculations.js)
    function initializeBmiCalculation() {
        const heightInput = document.getElementById('member-height');
        const weightInput = document.getElementById('member-weight');
        const bmiInput = document.getElementById('member-bmi');

        if (heightInput && weightInput && bmiInput && typeof calculateBmi === 'function') {
            function updateBmi() {
                const bmi = calculateBmi(heightInput.value, weightInput.value);
                bmiInput.value = bmi !== null ? bmi : '';
            }

            heightInput.addEventListener('input', updateBmi);
            weightInput.addEventListener('input', updateBmi);
        }
    }

    // Main initialization function
    function initializeMemberManagement() {
        console.log('Initializing member management...');
        
        // Load existing members into table
        loadMembersTable();

        // Initialize form components
        initializeAgeCalculation();
        initializeBmiCalculation();
        initializeMemberDiseaseDetails();
        initializeMemberOccupationalRisk();
        memberOccupationDropdown = initializeMemberOccupationDropdown();

        // Add Member button
        const addMemberBtn = document.getElementById('add-member-btn');
        if (addMemberBtn) {
            addMemberBtn.addEventListener('click', showMemberForm);
        }

        // Cancel button
        const cancelBtn = document.getElementById('cancel-member-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', hideMemberForm);
        }

        // Clear form button
        const clearBtn = document.getElementById('clear-member-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearMemberForm);
        }

        // Delete Selected button
        const deleteBtn = document.getElementById('delete-selected-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', deleteSelectedMembers);
        }

        // Save Member button
        const saveMemberBtn = document.getElementById('save-member-btn');
        if (saveMemberBtn) {
            saveMemberBtn.addEventListener('click', saveMember);
        }

        // Listen for storage changes from other tabs
        window.addEventListener('storage', loadMembersTable);

        // Reload when window gets focus
        window.addEventListener('focus', loadMembersTable);
    }

    // Make functions globally available for compatibility with existing code
    window.initializeMemberManagement = initializeMemberManagement;
    window.loadMembersGlobal = loadMembersTable;

    // Auto-initialize if DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMemberManagement);
    }
})();