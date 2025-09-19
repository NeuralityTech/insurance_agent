/*
 * This script handles the member management functionality, including displaying a list of members, managing member details, and deleting selected members.
 * It is used by: Health_Insurance_Requirement_Form.html, Members_to_be_Covered.html.
 * The main function, initializeMemberManagement, is called from script.js when the 'Members to be Covered' section is loaded.
 */

// --- Member Management Logic ---

/**
     * Initializes the entire member management interface, including loading members,
     * and setting up event listeners for actions like edit, delete, and summary display.
     */
    function initializeMemberManagement() {
    const membersList = document.getElementById('members-list');
    const summaryContent = document.getElementById('summary-content');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');

    if (!membersList || !summaryContent || !deleteSelectedBtn) {
        console.error('Member management elements not found!');
        return;
    }

    /**
         * Displays a detailed summary card for a given member.
         * @param {object} memberData - The data object for the member.
         */
        function displayMemberSummary(memberData) {
        const summaryTemplate = document.getElementById('member-summary-template');
        if (!summaryTemplate) return;

        const card = summaryTemplate.content.cloneNode(true);

        card.querySelector('.member-name').textContent = memberData.name || 'N/A';
        card.querySelector('.member-relationship').textContent = memberData.relationship || 'N/A';
        card.querySelector('.member-dob').textContent = memberData.dob || 'N/A';
        card.querySelector('.member-age').textContent = memberData.age || 'N/A';
        card.querySelector('.member-height').textContent = memberData.height ? `${memberData.height} cm` : 'N/A';
        card.querySelector('.member-weight').textContent = memberData.weight ? `${memberData.weight} kg` : 'N/A';
        card.querySelector('.member-bmi').textContent = memberData.bmi || 'N/A';
        card.querySelector('.member-smoker').textContent = memberData.smoker || 'No';
        card.querySelector('.member-alcohol').textContent = memberData.alcohol || 'No';
        card.querySelector('.member-risky-hobbies').textContent = memberData.riskyHobbies || 'None';
        card.querySelector('.member-planned-surgeries').textContent = memberData.plannedSurgeries || 'None';
        // Occupational Risk
        const occRisk = (memberData.occupationalRisk || '').toString().trim();
        card.querySelector('.member-occupational-risk').textContent = occRisk || 'No';
        const occDetails = (memberData.occupationalRiskDetails || '').toString().trim();
        card.querySelector('.member-occupational-risk-details').textContent = occDetails || 'None';
        let medicalHistoryStr;
if (memberData.healthHistory && Object.keys(memberData.healthHistory).length) {
    medicalHistoryStr = Object.entries(memberData.healthHistory)
        .map(([key, details]) => {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return details ? `${label}: ${details}` : label;
        })
        .join('; ');
} else {
    medicalHistoryStr = 'None';
}
        card.querySelector('.member-medical-history').textContent = medicalHistoryStr;

        summaryContent.innerHTML = '';
        summaryContent.appendChild(card);
    }

    /**
         * Creates and adds a new list item to the members list for a given member.
         * Sets up event listeners for hovering (to show summary) and editing.
         * @param {object} memberData - The data object for the member.
         */
        function addMemberToList(memberData) {
        const itemTemplate = document.getElementById('member-list-item-template');
        if (!itemTemplate) return;

        const item = itemTemplate.content.cloneNode(true);
        const listItem = item.querySelector('.member-list-item');
        listItem.dataset.memberId = memberData.id;

        item.querySelector('.member-name').textContent = memberData.name || 'N/A';
        item.querySelector('.member-relationship').textContent = memberData.relationship || 'N/A';
        item.querySelector('.member-bmi').textContent = memberData.bmi || 'N/A';

        listItem.addEventListener('mouseover', () => {
            document.querySelectorAll('.member-list-item.active').forEach(activeItem => {
                activeItem.classList.remove('active');
            });
            listItem.classList.add('active');
            displayMemberSummary(memberData);
        });

        const editBtn = item.querySelector('.btn-edit');
        editBtn.addEventListener('click', () => {
            localStorage.setItem('editMemberId', memberData.id);
            window.open('member_details.html', '_blank', 'noopener,noreferrer');
        });

        membersList.appendChild(item);
    }

    /**
         * Retrieves the array of members from local storage.
         * @returns {Array} An array of member objects.
         */
        function getMembers() {
        return JSON.parse(localStorage.getItem('members')) || [];
    }

    /**
         * Clears the current list and reloads all members from local storage.
         */
        function loadMembers() {
        membersList.innerHTML = ''; // Clear the list before reloading
        const members = getMembers();
        members.forEach(member => addMemberToList(member));
        if (window.updatePeopleCounter) window.updatePeopleCounter();
    }

    /**
         * Deletes all members whose corresponding checkbox is selected.
         * Updates local storage and the UI.
         */
        function deleteSelectedMembers() {
        const selectedCheckboxes = membersList.querySelectorAll('.member-select-checkbox:checked');
        let members = getMembers();

        selectedCheckboxes.forEach(checkbox => {
            const listItem = checkbox.closest('.member-list-item');
            const memberId = listItem.dataset.memberId;
            members = members.filter(m => m.id !== memberId);
            listItem.remove();
        });

        localStorage.setItem('members', JSON.stringify(members));
        // Refresh member list UI
        loadMembers();

        summaryContent.innerHTML = '<p class="placeholder-text">Hover over a member to see their details.</p>';
        // Clear cached summary so Summary page rebuilds fresh
        localStorage.removeItem('formSummary');
    }

    // --- Event Listeners ---
    deleteSelectedBtn.addEventListener('click', deleteSelectedMembers);

    // Listen for storage changes from other tabs
    window.addEventListener('storage', loadMembers);

    // Reload when the window gets focus
    window.addEventListener('focus', loadMembers);

    // Initial load
    loadMembers();
    // Expose loadMembers to data_fetch
    window.loadMembersGlobal = loadMembers;
}