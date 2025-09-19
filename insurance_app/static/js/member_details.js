/*
 * This script handles all logic for the member details page (member_details.html).
 * It is responsible for populating the form for editing, saving new or updated member data to local storage,
 * and dynamically loading the health history section.
 * It is used by: member_details.html
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- Utility Functions ---
        /**
     * Calculates age from a date of birth.
     * NOTE: This function is a duplicate of the one in calculations.js
     * and should be removed to avoid redundancy.
     */
    function calculateAge(dob) {
        if (!dob) return null;
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

        /**
     * Calculates BMI from height and weight.
     * NOTE: This function is a duplicate of the one in calculations.js 
     * and should be removed to avoid redundancy.
     */
    function calculateBmi(heightCm, weightKg) {
        if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
            return '';
        }
        const heightM = heightCm / 100;
        const bmi = (weightKg / (heightM * heightM)).toFixed(2);
        return bmi;
    }

    // --- Form Population for Editing ---
        /**
     * Populates the form fields with data from a member stored in local storage.
     * @param {string} memberId - The ID of the member to edit.
     */
    function populateFormForEdit(memberId) {
        const members = JSON.parse(localStorage.getItem('members')) || [];
        const memberToEdit = members.find(m => m.id === memberId);

        if (memberToEdit) {
            // Populate standard input fields
            document.getElementById('member-name').value = memberToEdit.name || '';
            document.getElementById('relationship').value = memberToEdit.relationship || '';
            document.getElementById('occupation').value = memberToEdit.occupation || '';
            document.getElementById('gender').value = memberToEdit.gender || '';
            document.getElementById('self-dob').value = memberToEdit.dob || '';
            document.getElementById('self-height').value = memberToEdit.height || '';
            document.getElementById('self-weight').value = memberToEdit.weight || '';

            // Manually trigger events to update calculated fields (Age and BMI)
            document.getElementById('self-dob').dispatchEvent(new Event('change'));
            document.getElementById('self-height').dispatchEvent(new Event('input'));

            // Populate health history checkboxes and textareas
            if (memberToEdit.healthHistory) {
                for (const [key, details] of Object.entries(memberToEdit.healthHistory)) {
                    const checkbox = document.querySelector(`input[name=\"disease\"][value=\"${key}\"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        // Show details container
                        const detailsContainer = checkbox.closest('.disease-entry').querySelector('.disease-details-container');
                        if (detailsContainer) {
                            detailsContainer.style.display = 'flex';
                            const textarea = detailsContainer.querySelector(`textarea[name=\"${key}_details\"]`);
                            if (textarea) {
                                textarea.value = details;
                            }
                        }
                        // Trigger toggle logic
                        checkbox.dispatchEvent(new Event('change'));
                    }
                }
            }

            // Populate other textareas and select fields
            document.getElementById('planned-surgeries').value = memberToEdit.plannedSurgeries || '';
            if (memberToEdit.riskyHobbies) {
                document.querySelector('input[name="risky-hobbies"][value="' + memberToEdit.riskyHobbies + '"]').checked = true;
            }

            // Populate Occupational Risk
            if (memberToEdit.occupationalRisk) {
                const occ = document.querySelector(`input[name="occupational-risk"][value="${memberToEdit.occupationalRisk}"]`);
                if (occ) occ.checked = true;
            }
            if (memberToEdit.occupationalRiskDetails) {
                const occDetails = document.getElementById('occupational-risk-details');
                if (occDetails) occDetails.value = memberToEdit.occupationalRiskDetails;
            }

            // Populate radio buttons
            if (memberToEdit.smoker) {
                document.querySelector(`input[name="smoker"][value="${memberToEdit.smoker}"]`).checked = true;
            }
            if (memberToEdit.alcohol) {
                document.querySelector(`input[name="alcohol"][value="${memberToEdit.alcohol}"]`).checked = true;
            }
        }
    }

    // --- Form Submission ---
        /**
     * Saves the details from the form into local storage.
     * It either creates a new member or updates an existing one.
     * @param {Event} event - The form submission event.
     */
    function saveMemberDetails(event) {
        event.preventDefault();
        const members = JSON.parse(localStorage.getItem('members')) || [];
        const editMemberId = localStorage.getItem('editMemberId');

        const name = document.getElementById('member-name').value;
        const dob = document.getElementById('self-dob').value;
        const birthYear = dob ? new Date(dob).getFullYear() : 'YYYY';
        const namePart = name.replace(/[^a-zA-Z]/g, '').substring(0, 5).toUpperCase();
        const memberId = editMemberId || `${namePart}${birthYear}_${Date.now()}`; // Add timestamp to ensure uniqueness

        const healthHistory = {};
        document.querySelectorAll('input[name="disease"]').forEach(checkbox => {
            if (!checkbox.checked) return;
            const key = checkbox.value;
            const detailsTextarea = document.querySelector(`textarea[name="${key}_details"]`);
            healthHistory[key] = detailsTextarea ? detailsTextarea.value : '';
        });

        const memberData = {
            id: memberId,
            name: name,
            relationship: document.getElementById('relationship').value,
            occupation: document.getElementById('occupation').value,
            gender: document.getElementById('gender').value,
            dob: dob,
            age: document.getElementById('self-age').value,
            height: document.getElementById('self-height').value,
            weight: document.getElementById('self-weight').value,
            bmi: document.getElementById('self-bmi').value,
            healthHistory: healthHistory,
            plannedSurgeries: document.getElementById('planned-surgeries').value,
            smoker: document.querySelector('input[name="smoker"]:checked')?.value || '',
            alcohol: document.querySelector('input[name="alcohol"]:checked')?.value || '',
            riskyHobbies: document.querySelector('input[name="risky-hobbies"]:checked')?.value || '',
            occupationalRisk: document.querySelector('input[name="occupational-risk"]:checked')?.value || '',
            occupationalRiskDetails: document.getElementById('occupational-risk-details')?.value || ''
        };

        // Prevent duplicate members
        if (!editMemberId) {
            const duplicate = members.some(m => m.name === memberData.name && m.relationship === memberData.relationship && m.dob === memberData.dob);
            if (duplicate) {
                const errorDiv = document.getElementById('member-error');
                if (errorDiv) {
                    errorDiv.textContent = 'Member already exists';
                    errorDiv.style.display = 'block';
                }
                return;
            }
        }

        if (editMemberId) {
            const index = members.findIndex(m => m.id === editMemberId);
            if (index !== -1) {
                members[index] = memberData;
            }
            localStorage.removeItem('editMemberId');
        } else {
            members.push(memberData);
        }

        localStorage.setItem('members', JSON.stringify(members));
        window.close();
    }

    // --- Dynamic Content Loading & Initialization ---
        /**
     * Fetches and loads the Health_History.html content into the placeholder.
     */
    function loadHealthHistory() {
        return fetch('Health_History.html')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok for Health_History.html');
                }
                return response.text();
            })
            .then(data => {
                document.getElementById('Health-History-placeholder').innerHTML = data;
            });
    }

        /**
     * Initializes disease checkbox behavior using centralized initializer.
     */
    function wireDiseaseDetailsCentralized() {
        const container = document.getElementById('Health-History-placeholder');
        if (!container) return;
        if (window.initializeDiseaseDetails) {
            window.initializeDiseaseDetails(container);
        }
        if (window.initializeOccupationalRisk) {
            window.initializeOccupationalRisk(container);
        }
    }

        /**
     * Sets up the initial event listeners for the page, such as age and BMI calculation.
     */
    function initializePageLogic() {
        // Age calculation
        const dobInput = document.getElementById('self-dob');
        if (dobInput) {
            dobInput.addEventListener('change', () => {
                document.getElementById('self-age').value = calculateAge(dobInput.value) || '';
            });
        }

        // BMI calculation
        const heightInput = document.getElementById('self-height');
        const weightInput = document.getElementById('self-weight');
        const bmiInput = document.getElementById('self-bmi');

        function updateBmi() {
            if (bmiInput) {
                bmiInput.value = calculateBmi(heightInput.value, weightInput.value);
            }
        }

        if (heightInput) heightInput.addEventListener('input', updateBmi);
        if (weightInput) weightInput.addEventListener('input', updateBmi);
    }

    // --- Main Execution Flow ---
        document.getElementById('member-details-form').addEventListener('submit', saveMemberDetails);

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            window.close();
        });
    }

    loadHealthHistory()
        .then(() => {
            // Initialize all event listeners for the main page and the dynamically loaded content
            initializePageLogic();
            wireDiseaseDetailsCentralized();

            const editMemberId = localStorage.getItem('editMemberId');
            if (editMemberId) {
                populateFormForEdit(editMemberId);
            }
        })
        .catch(error => console.error('Error during page initialization:', error));
});
