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

    // Initialize member occupation dropdown for a specific form
    function initializeMemberOccupationDropdown(formContainer) {
        const input = formContainer.querySelector('.member-occupation');
        const hiddenInput = formContainer.querySelector('.member-occupation-value');
        const dropdown = formContainer.querySelector('.member-occupation-list');
        const occupationalRiskDetailsGroup = formContainer.querySelector('.member-occupational-risk-details-group');

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

    // Initialize disease details toggles for a form
    function initializeMemberDiseaseDetails(formContainer) {
        const container = formContainer.querySelector('.member-disease-list');
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
            }
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
            if (!show && textarea) textarea.value = '';
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

        const data = {
            name: formContainer.querySelector('.member-name').value.trim(),
            relationship: formContainer.querySelector('.relationship').value,
            occupation: formContainer.querySelector('.member-occupation').value.trim(),
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
        formContainer.querySelectorAll('.member-disease-list input[name="disease"]').forEach(checkbox => {
            if (!checkbox.checked) return;
            const key = checkbox.value;
            const detailsTextarea = formContainer.querySelector(`.member-disease-list textarea[name="${key}_details"]`);
            const detailsValue = detailsTextarea ? detailsTextarea.value.trim() : '';
            // If checkbox is checked but details are empty, use "None"
            healthHistory[key] = detailsValue || "None";
        });
        data.healthHistory = healthHistory;

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

        formContainer.querySelector('.member-name').value = memberData.name || '';
        formContainer.querySelector('.relationship').value = memberData.relationship || '';
        formContainer.querySelector('.member-occupation').value = memberData.occupation || '';
        formContainer.querySelector('.member-gender').value = memberData.gender || '';
        formContainer.querySelector('.member-dob').value = memberData.dob || '';
        formContainer.querySelector('.member-age').value = memberData.age || '';
        formContainer.querySelector('.member-height').value = memberData.height || '';
        formContainer.querySelector('.member-weight').value = memberData.weight || '';
        formContainer.querySelector('.member-bmi').value = memberData.bmi || '';
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
                }
            }
        }

        // Trigger calculations
        formContainer.querySelector('.member-dob').dispatchEvent(new Event('change'));
        formContainer.querySelector('.member-height').dispatchEvent(new Event('input'));
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

        // Clear readonly fields
        formContainer.querySelector('.member-age').value = '';
        formContainer.querySelector('.member-bmi').value = '';

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

        // Validate required fields
        if (!data.name || !data.relationship || !data.gender || !data.dob || !data.height || !data.weight) {
            if (errorDiv) {
                errorDiv.textContent = 'Please fill in all required fields marked with *';
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

        if (isNaN(parseFloat(data.weight)) || parseFloat(data.weight) <= 0) {
            if (errorDiv) {
                errorDiv.textContent = 'Weight must be a valid number greater than 0';
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
            const namePart = data.name.replace(/[^a-zA-Z]/g, '').substring(0, 5).toUpperCase();
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

    // Initialize age calculation
    function initializeAgeCalculation(contentDiv) {
        const dobInput = contentDiv.querySelector('.member-dob');
        const ageInput = contentDiv.querySelector('.member-age');

        if (dobInput && ageInput && typeof calculateAge === 'function') {
            dobInput.addEventListener('change', function() {
                const age = calculateAge(this.value);
                ageInput.value = age !== null ? age : '';
                if (typeof window.updatePeopleCounter === 'function') {
                    window.updatePeopleCounter();
                }
            });
        }
    }

    // Initialize BMI calculation
    function initializeBmiCalculation(contentDiv) {
        const heightInput = contentDiv.querySelector('.member-height');
        const weightInput = contentDiv.querySelector('.member-weight');
        const bmiInput = contentDiv.querySelector('.member-bmi');

        if (heightInput && weightInput && bmiInput && typeof calculateBmi === 'function') {
            function updateBmi() {
                const bmi = calculateBmi(heightInput.value, weightInput.value);
                bmiInput.value = bmi !== null ? bmi : '';
            }

            heightInput.addEventListener('input', updateBmi);
            weightInput.addEventListener('input', updateBmi);
        }
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