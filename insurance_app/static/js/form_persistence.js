/**
 * Form Persistence Module
 * Saves and restores form data to/from localStorage
 */

(function() {
    'use strict';

    /**
     * Get form-specific storage key based on form type
     * This prevents New Applicant and Existing Applicant forms from overwriting each other's saved data
     */
    function getStorageKey() {
        const isNewApplicant = document.body.getAttribute('data-sidebar') === 'new-applicant';
        return isNewApplicant ? 'insuranceFormDraft_new' : 'insuranceFormDraft_existing';
    }

    /**
     * Get all form data from all tabs
     */
    function getAllFormData() {
        let members = [];
        const isNewApplicant = document.body.getAttribute('data-sidebar') === 'new-applicant';

        if (isNewApplicant && typeof window.getMembersFromUI === 'function') {
            // On New Applicant form, get members from UI state to prevent cross-tab contamination
            members = window.getMembersFromUI();
        } else {
            // On Existing Applicant form or if getMembersFromUI not available, use localStorage
            try {
                const membersStr = localStorage.getItem('members');
                members = membersStr ? JSON.parse(membersStr) : [];
            } catch (e) {
                console.error('Error reading members from localStorage:', e);
                members = [];
            }
        }

        const formData = {
            primaryContact: getSectionFormData('primary-contact-content'),
            healthHistory: getSectionFormData('health-history-content'),
            members: members, // Always get fresh from localStorage
            coverAndCost: getSectionFormData('cover-cost-content'),
            existingCoverage: getSectionFormData('existing-coverage-content'),
            claimsAndService: getSectionFormData('claims-service-content'),
            financeAndDocumentation: getSectionFormData('finance-documentation-content'),
            commentsNoted: window.getCommentsData ? window.getCommentsData() : { comments_noted: [] }
        };
        
        // Debug log to verify members are being captured
        console.log('Saving form data with members:', members.length, 'members');
        
        return formData;
    }

    /**
     * Get form data from a specific section
     */
    function getSectionFormData(sectionId) {
        const container = document.getElementById(sectionId);
        if (!container) return {};
        
        const data = {};
        container.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.name) {
                if (el.type === 'radio') {
                    if (el.checked) data[el.name] = el.value;
                } else if (el.type === 'checkbox') {
                    if (!data[el.name]) data[el.name] = [];
                    if (el.checked) data[el.name].push(el.value);
                } else if (el.type === 'date') {
                    data[el.name] = el.value;
                } else {
                    data[el.name] = el.value;
                }
            }
        });
        return data;
    }

    /**
     * Set form data for a specific section
     */
    function setSectionFormData(sectionId, data) {
        const container = document.getElementById(sectionId);
        if (!container || !data) return;

        container.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.name && data[el.name] !== undefined) {
                if (el.type === 'radio') {
                    if (el.value === data[el.name]) {
                        el.checked = true;
                        // Trigger change event for any dependent logic
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } else if (el.type === 'checkbox') {
                    const values = Array.isArray(data[el.name]) ? data[el.name] : [data[el.name]];
                    if (values.includes(el.value)) {
                        el.checked = true;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } else if (el.type === 'date') {
                    el.value = data[el.name] || '';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    el.value = data[el.name] || '';
                    if (el.type !== 'hidden') {
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        });
    }

    /**
     * Save form data to localStorage
     */
    function saveFormData() {
        try {
            const formData = getAllFormData();
            localStorage.setItem(getStorageKey(), JSON.stringify(formData));
            
            // Debug confirmation
            console.log('Form data saved successfully. Members count:', formData.members.length);
            
            return true;
        } catch (error) {
            console.error('Error saving form data:', error);
            return false;
        }
    }

    /**
     * Load form data from localStorage
     */
    function loadFormData() {
        try {
            const savedData = localStorage.getItem(getStorageKey());
            if (!savedData) return null;

            const formData = JSON.parse(savedData);
            
            console.log('Loading saved form data. Members count:', formData.members?.length || 0);
            
            setTimeout(() => {
                // Restore each section
                if (formData.primaryContact) {
                    setSectionFormData('primary-contact-content', formData.primaryContact);
                }
                if (formData.healthHistory) {
                    setSectionFormData('health-history-content', formData.healthHistory);
                }
                if (formData.coverAndCost) {
                    setSectionFormData('cover-cost-content', formData.coverAndCost);
                }
                if (formData.existingCoverage) {
                    setSectionFormData('existing-coverage-content', formData.existingCoverage);
                }
                if (formData.claimsAndService) {
                    setSectionFormData('claims-service-content', formData.claimsAndService);
                }
                if (formData.financeAndDocumentation) {
                    setSectionFormData('finance-documentation-content', formData.financeAndDocumentation);
                }

                if (formData.members && Array.isArray(formData.members) && formData.members.length > 0) {
                    console.log('Restoring', formData.members.length, 'members to localStorage');
                    localStorage.setItem('members', JSON.stringify(formData.members));

                    // Then trigger UI update
                    if (window.loadMembersGlobal) {
                        setTimeout(() => {
                            window.loadMembersGlobal();
                            console.log('Members UI refreshed');
                        }, 100);
                    }
                } else {
                    console.log('No members to restore');
                }

                // Restore comments if they exist
                if (formData.commentsNoted && formData.commentsNoted.comments_noted) {
                    localStorage.setItem('comments_noted', JSON.stringify(formData.commentsNoted.comments_noted));
                    if (window.loadCommentsFromStorage) {
                        window.loadCommentsFromStorage();
                    }
                }

                // Update people counter after restoring data
                if (window.updatePeopleCounter) {
                    setTimeout(() => window.updatePeopleCounter(), 200);
                }
            }, 200);

            return formData;
        } catch (error) {
            console.error('Error loading form data:', error);
            return null;
        }
    }

    /**
     * Clear saved form data
     */
    function clearSavedFormData() {
        try {
            localStorage.removeItem(getStorageKey());
            console.log('Saved form data cleared');
            return true;
        } catch (error) {
            console.error('Error clearing saved form data:', error);
            return false;
        }
    }

    /**
     * Check if there is saved form data
     */
    function hasSavedData() {
        return localStorage.getItem(getStorageKey()) !== null;
    }

    /**
     * Enable the save button (called when form changes)
     */
    function enableSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.add('has-changes');
        }
    }

    /**
     * Disable the save button (called after saving)
     */
    function disableSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.classList.remove('has-changes');
        }
    }

    /**
     * Attach change listeners to all form fields
     */
    function attachChangeListeners() {
        const form = document.getElementById('insurance-form');
        if (!form) {
            console.warn('Form not found for change listeners');
            return;
        }

        // Listen for any input, change, or custom events on form fields
        form.addEventListener('input', enableSaveButton, true);
        form.addEventListener('change', enableSaveButton, true);
        
        // Store original setItem to avoid infinite loops
        if (!window._originalLocalStorageSetItem) {
            window._originalLocalStorageSetItem = localStorage.setItem.bind(localStorage);
            
            localStorage.setItem = function(key, value) {
                window._originalLocalStorageSetItem(key, value);
                
                // Enable save button when members or comments change
                if (key === 'members' || key === 'comments_noted') {
                    console.log('Detected change to', key, '- enabling save button');
                    enableSaveButton();
                }
            };
        }
    }

    /**
     * Initialize form persistence
     */
    function initializeFormPersistence() {
        const saveBtn = document.getElementById('save-btn');
        const resetBtn = document.getElementById('reset-btn');

        if (!saveBtn) {
            console.warn('Save button not found');
            return;
        }

        // Start with save button enabled 
        saveBtn.disabled = false;

        // Handle Save button click
        saveBtn.addEventListener('click', function() {
            console.log('Save button clicked');
            
            // Force-read current members state before saving
            const currentMembers = localStorage.getItem('members');
            console.log('Current members in localStorage:', currentMembers ? JSON.parse(currentMembers).length : 0, 'members');
            
            const success = saveFormData();
            
            if (success) {
                setTimeout(() => {
                    disableSaveButton();
                }, 1500);
            } else {
                alert('Failed to save form progress. Please try again.');
            }
        });

        // Handle Reset button - also clear saved data and enable save button
        if (resetBtn) {
            resetBtn.addEventListener('click', function(e) {
                if (confirm('Are you sure you want to reset all form data? This will clear all saved progress.')) {
                    clearSavedFormData();
                    // Re-enable save button after reset
                    setTimeout(() => {
                        enableSaveButton();
                    }, 100);
                }
            });
        }

        // Attach listeners to re-enable save button on any form change
        // Delay this to ensure tabs are loaded
        setTimeout(() => {
            attachChangeListeners();
            console.log('Change listeners attached');
        }, 1000);

        // Auto-load saved data on page load
        // IMPORTANT: Do NOT auto-load for Existing Applicant forms - their data comes from database via Load button
        const isExistingApplicant = document.body.getAttribute('data-sidebar') === 'existing-applicant';
        if (!isExistingApplicant && hasSavedData()) {
            console.log('Found saved form data, loading...');
            loadFormData();
            disableSaveButton();
        } else if (isExistingApplicant) {
            console.log('Existing Applicant form - skipping auto-load (data comes from database)');
        } else {
            console.log('No saved form data found');
        }
    }

    // Make functions globally available
    window.saveFormData = saveFormData;
    window.loadFormData = loadFormData;
    window.clearSavedFormData = clearSavedFormData;
    window.hasSavedData = hasSavedData;
    window.enableSaveButton = enableSaveButton;
    window.initializeFormPersistence = initializeFormPersistence;

    // Auto-initialize if DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFormPersistence);
    } else {
        setTimeout(initializeFormPersistence, 100);
    }
})();