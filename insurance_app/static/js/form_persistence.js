/**
 * Form Persistence Module
 * Saves and restores form data to/from localStorage
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'insuranceFormDraft';

    /**
     * Get all form data from all tabs
     */
    function getAllFormData() {
        const formData = {
            primaryContact: getSectionFormData('primary-contact-content'),
            healthHistory: getSectionFormData('health-history-content'),
            members: JSON.parse(localStorage.getItem('members')) || [],
            coverAndCost: getSectionFormData('cover-cost-content'),
            existingCoverage: getSectionFormData('existing-coverage-content'),
            claimsAndService: getSectionFormData('claims-service-content'),
            financeAndDocumentation: getSectionFormData('finance-documentation-content'),
            commentsNoted: window.getCommentsData ? window.getCommentsData() : { comments_noted: [] }
        };
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
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
            const savedData = localStorage.getItem(STORAGE_KEY);
            if (!savedData) return null;

            const formData = JSON.parse(savedData);
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

                // Restore members if they exist
                if (formData.members && formData.members.length > 0) {
                    localStorage.setItem('members', JSON.stringify(formData.members));
                    if (window.loadMembersGlobal) {
                        window.loadMembersGlobal();
                    }
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
                    setTimeout(() => window.updatePeopleCounter(), 100);
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
            localStorage.removeItem(STORAGE_KEY);
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
        return localStorage.getItem(STORAGE_KEY) !== null;
    }

    /**
     * Enable the save button (called when form changes)
     */
    function enableSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
        }
    }

    /**
     * Disable the save button (called after saving)
     */
    function disableSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.disabled = true;
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
        
        // Also monitor localStorage for member/comment changes
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
            originalSetItem.apply(this, arguments);
            if (key === 'members' || key === 'comments_noted') {
                enableSaveButton();
            }
        };
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

        // Start with save button ENABLED so user can test it
        // (It will be disabled after first save, then re-enabled on any change)
        saveBtn.disabled = false;

        // Handle Save button click
        saveBtn.addEventListener('click', function() {
            console.log('Save button clicked'); // Debug log
            const success = saveFormData();
            
            if (success) {
                console.log('Form data saved successfully'); // Debug log
                // Darken button and disable it
                disableSaveButton();
            } else {
                alert('Failed to save form progress. Please try again.');
            }
        });

        // Handle Reset button - also clear saved data and enable save button
        if (resetBtn) {
            resetBtn.addEventListener('click', function(e) {
                clearSavedFormData();
                // Re-enable save button after reset
                setTimeout(() => {
                    enableSaveButton();
                }, 100);
            });
        }

        // Attach listeners to re-enable save button on any form change
        // Delay this to ensure tabs are loaded
        setTimeout(() => {
            attachChangeListeners();
            console.log('Change listeners attached'); // Debug log
        }, 1000);

        // Auto-load saved data on page load
        if (hasSavedData()) {
            loadFormData();
            disableSaveButton();
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