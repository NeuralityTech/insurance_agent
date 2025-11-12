/**
 * Searchable Occupation Dropdown with Hazard Detection
 * Manages occupation selection and automatically sets occupational risk radio buttons
 */

(function() {
    'use strict';

    let selectedIndex = -1;
    let filteredOccupations = [];

    function initializeOccupationDropdown() {
        const input = document.getElementById('occupation');
        const hiddenInput = document.getElementById('occupation-value');
        const dropdown = document.getElementById('occupation-list');
        const occupationalRiskDetailsGroup = document.getElementById('occupational-risk-details-group');

        if (!input || !dropdown) return;
        // Populate dropdown with "Other" at top, followed by filtered occupations
        function populateDropdown(occupations) {
            dropdown.innerHTML = '';
            
            // Add "Other" option
            const otherLi = document.createElement('li');
            otherLi.textContent = 'Other';
            otherLi.classList.add('other-option');
            otherLi.setAttribute('role', 'option');
            otherLi.setAttribute('data-index', '0');
            otherLi.addEventListener('click', () => selectOccupation('Other'));
            dropdown.appendChild(otherLi);

            // Add filtered occupations
            occupations.forEach((occupation, index) => {
                const li = document.createElement('li');
                li.textContent = occupation;
                li.setAttribute('role', 'option');
                li.setAttribute('data-index', index + 1);
                li.addEventListener('click', () => selectOccupation(occupation));
                dropdown.appendChild(li);
            });

            // Update filteredOccupations array with "Other" at the beginning
            filteredOccupations = ['Other', ...occupations];
        }

        // Filter occupations based on input
        function filterOccupations(searchTerm) {
            if (!searchTerm.trim()) {
                return ALL_OCCUPATIONS;
            }
            
            const term = searchTerm.toLowerCase();
            return ALL_OCCUPATIONS.filter(occupation => 
                occupation.toLowerCase().includes(term)
            );
        }

        // Select an occupation
        function selectOccupation(occupation) {
            input.value = occupation;
            hiddenInput.value = occupation;
            dropdown.classList.remove('show');
            selectedIndex = -1;
            
            // Update occupational risk radio buttons
            updateOccupationalRisk(occupation);
        }

        // Update occupational risk based on selected occupation
        function updateOccupationalRisk(occupation) {
            // Try multiple selectors to find the radio buttons in the tab structure
            let occupationalRiskYes = document.querySelector('input[name="occupational-risk"][value="yes"]');
            let occupationalRiskNo = document.querySelector('input[name="occupational-risk"][value="no"]');
            
            // If not found, try looking specifically in the health-history tab content
            if (!occupationalRiskYes || !occupationalRiskNo) {
                const healthHistoryContent = document.getElementById('health-history-content');
                if (healthHistoryContent) {
                    occupationalRiskYes = healthHistoryContent.querySelector('input[name="occupational-risk"][value="yes"]');
                    occupationalRiskNo = healthHistoryContent.querySelector('input[name="occupational-risk"][value="no"]');
                }
            }

            if (!occupationalRiskYes || !occupationalRiskNo) {
                console.warn('Occupational risk radio buttons not found');
                return;
            }

            const isHazardous = isHazardousOccupation(occupation);

            if (isHazardous === null) {
                // "Other" selected - don't change the radio buttons
                return;
            }

            if (isHazardous) {
                occupationalRiskYes.checked = true;
                // Trigger the change event to show/hide details field
                occupationalRiskYes.dispatchEvent(new Event('change', { bubbles: true }));
                if (occupationalRiskDetailsGroup) {
                    occupationalRiskDetailsGroup.style.display = 'flex';
                }
            } else {
                occupationalRiskNo.checked = true;
                // Trigger the change event to show/hide details field
                occupationalRiskNo.dispatchEvent(new Event('change', { bubbles: true }));
                if (occupationalRiskDetailsGroup) {
                    occupationalRiskDetailsGroup.style.display = 'none';
                    const detailsTextarea = document.getElementById('occupational-risk-details');
                    if (detailsTextarea) detailsTextarea.value = '';
                }
            }
        }

        // Highlight item in dropdown
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

        // Show dropdown on focus
        input.addEventListener('focus', function() {
            const filtered = filterOccupations(input.value);
            populateDropdown(filtered);
            dropdown.classList.add('show');
            selectedIndex = -1;
        });

        // Filter as user types
        input.addEventListener('input', function(e) {
            // Only show dropdown if the event was user-initiated, not prefill
            if (!e.isTrusted) return;
            const filtered = filterOccupations(input.value);
            populateDropdown(filtered);
            dropdown.classList.add('show');
            selectedIndex = -1;
        });


        // Keyboard navigation
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

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
                selectedIndex = -1;
            }
        });

        // Handle existing occupational-risk radio button changes
        // (in case user manually changes after auto-selection)
        const riskRadios = document.querySelectorAll('input[name="occupational-risk"]');
        riskRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.value === 'yes') {
                    if (occupationalRiskDetailsGroup) {
                        occupationalRiskDetailsGroup.style.display = 'flex';
                    }
                } else {
                    if (occupationalRiskDetailsGroup) {
                        occupationalRiskDetailsGroup.style.display = 'none';
                        const detailsTextarea = document.getElementById('occupational-risk-details');
                        if (detailsTextarea) detailsTextarea.value = '';
                    }
                }
            });
        });
    }

    // Make initialization function globally available
    window.initializeOccupationDropdown = initializeOccupationDropdown;

    // Auto-initialize if DOM is already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeOccupationDropdown);
    } else {
        initializeOccupationDropdown();
    }
})();