// File storage key
const POLICY_DOC_STORAGE_KEY = 'existing_policy_doc_';

// Get unique_id from URL parameters or session
function getUniqueId() {
    const params = new URLSearchParams(window.location.search);
    // Check both 'uid' and 'unique_id' parameters
    return params.get('uid') || params.get('unique_id') || sessionStorage.getItem('current_unique_id') || '';
}

// --- Core Logic functions ---

function displayAttachedDocument(docData) {
    const docAttached = document.getElementById('policy-doc-attached');
    const uploadCheckbox = document.getElementById('upload-policy-doc-checkbox');
    const uploadSection = document.getElementById('policy-doc-upload-section');
    const sinceDateInput = document.getElementById('policy-since-date');
    const sinceDateLabel = document.querySelector('label[for="policy-since-date"]');
    const uploadButton = document.getElementById('upload-policy-btn');
    const removeButton = document.getElementById('remove-policy-doc-btn');
    const fileInput = document.getElementById('existing-policy-document');

    if (!docAttached) return;

    if (docData && docData.fileName) {
        const nameDisplay = document.getElementById('attached-doc-name');
        if (nameDisplay) nameDisplay.textContent = docData.fileName;

        docAttached.style.display = 'block';

        // Make "Since When (Date)" mandatory when document is uploaded
        if (sinceDateInput) {
            sinceDateInput.setAttribute('required', 'required');
        }
        if (sinceDateLabel && !sinceDateLabel.textContent.includes('*')) {
            sinceDateLabel.innerHTML = 'Since When (Date) <span style="color: black;">*</span>';
        }

        // Auto-check the checkbox if document exists
        if (uploadCheckbox && !uploadCheckbox.checked) {
            uploadCheckbox.checked = true;
            if (uploadSection) uploadSection.classList.add('visible');
        }

        // Check if form is in readonly mode (non-editable)
        // Check multiple indicators: readonly attribute, disabled attribute, or opacity styling
        const isReadonly = (sinceDateInput && (sinceDateInput.hasAttribute('readonly') || sinceDateInput.disabled)) ||
            (uploadCheckbox && uploadCheckbox.disabled && uploadCheckbox.style.opacity === '0.6');

        const viewButton = document.getElementById('view-policy-doc-btn');

        if (isReadonly) {
            // In readonly mode: hide upload/remove buttons, keep view button VISIBLE and ENABLED
            if (uploadButton) uploadButton.style.display = 'none';
            if (removeButton) removeButton.style.display = 'none';
            if (fileInput) fileInput.style.display = 'none';
            if (uploadCheckbox) {
                uploadCheckbox.disabled = true;
                uploadCheckbox.style.cursor = 'not-allowed';
            }
            // CRITICAL: Ensure View button is always visible and enabled in readonly mode
            if (viewButton) {
                viewButton.style.display = '';
                viewButton.disabled = false;
                viewButton.style.opacity = '1';
                viewButton.style.cursor = 'pointer';
                viewButton.removeAttribute('aria-disabled');
            }
        } else {
            // In editable mode: show all buttons
            if (uploadButton) uploadButton.style.display = '';
            if (removeButton) removeButton.style.display = '';
            if (fileInput) fileInput.style.display = '';
            if (uploadCheckbox) {
                uploadCheckbox.disabled = false;
                uploadCheckbox.style.cursor = 'pointer';
            }
            if (viewButton) {
                viewButton.style.display = '';
                viewButton.disabled = false;
            }
        }
    } else {
        docAttached.style.display = 'none';

        // Remove mandatory requirement when no document
        if (sinceDateInput) {
            sinceDateInput.removeAttribute('required');
        }
        if (sinceDateLabel && sinceDateLabel.textContent.includes('*')) {
            sinceDateLabel.textContent = 'Since When (Date)';
        }
    }
}

function loadSavedDocument() {
    const uniqueId = getUniqueId();
    console.log('[Existing Coverage] Loading document for uniqueId:', uniqueId);

    // IMPORTANT: Only load saved documents if we have a valid unique ID
    // This prevents temp_draft from previous applicants being loaded for new applicants
    if (!uniqueId) {
        console.log('[Existing Coverage] No unique ID - skipping document load for new applicant');
        return;
    }

    const storageKey = POLICY_DOC_STORAGE_KEY + uniqueId;
    console.log('[Existing Coverage] Checking localStorage key:', storageKey);

    // 1. Try localStorage first
    let localDocData = localStorage.getItem(storageKey);
    if (localDocData) {
        try {
            console.log('[Existing Coverage] Found document in localStorage');
            displayAttachedDocument(JSON.parse(localDocData));
            return;
        } catch (e) {
            console.error('[Existing Coverage] Error loading local document:', e);
        }
    } else {
        console.log('[Existing Coverage] No document in localStorage, checking temp_draft...');

        // 1b. Check temp_draft as fallback (for documents uploaded before unique ID was assigned)
        const tempDraftKey = POLICY_DOC_STORAGE_KEY + 'temp_draft';
        const tempDraftData = localStorage.getItem(tempDraftKey);
        if (tempDraftData) {
            try {
                console.log('[Existing Coverage] Found document in temp_draft, migrating to', storageKey);
                const docData = JSON.parse(tempDraftData);
                // Migrate to proper key
                localStorage.setItem(storageKey, tempDraftData);
                // Clean up temp_draft
                localStorage.removeItem(tempDraftKey);
                displayAttachedDocument(docData);
                // Also save to server
                saveDocumentToServer(uniqueId, docData);
                return;
            } catch (e) {
                console.error('[Existing Coverage] Error migrating temp_draft:', e);
            }
        }

        console.log('[Existing Coverage] No document in temp_draft, trying server...');
    }

    // 2. Try server
    fetch(`/api/get-policy-document/${uniqueId}`)
        .then(response => {
            console.log('[Existing Coverage] Server response status:', response.status);
            if (response.ok) return response.json();
            return null;
        })
        .then(data => {
            if (data && data.success && data.fileData) {
                console.log('[Existing Coverage] Found document on server:', data.fileName);
                const docData = {
                    fileName: data.fileName,
                    fileData: data.fileData,
                    uploadedAt: data.uploadedAt
                };
                // Sync back to local
                localStorage.setItem(storageKey, JSON.stringify(docData));
                displayAttachedDocument(docData);
            } else {
                console.log('[Existing Coverage] No document found on server');
            }
        })
        .catch(error => console.log('[Existing Coverage] Error fetching document from server:', error));
}

async function saveDocumentToServer(uniqueId, docData) {
    try {
        const response = await fetch('/api/save-policy-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                unique_id: uniqueId,
                fileName: docData.fileName,
                fileData: docData.fileData,
                uploadedAt: docData.uploadedAt
            })
        });
        if (!response.ok) {
            console.warn('Failed to save document to server:', response.status);
        }
    } catch (error) {
        console.warn('Error saving document to server:', error);
    }
}

// --- Initialization Function called by script.js ---
function initializeExistingCoverage() {
    console.log('Initializing Existing Coverage Logic');

    // Initial load check
    loadSavedDocument();

    // Legacy field sync
    updateLegacyField();
}

function updateLegacyField() {
    const legacyField = document.getElementById('existing-policies');
    if (!legacyField) return;

    const insurerName = document.getElementById('insurer-name');
    const policyNumber = document.getElementById('existing-policy-number');
    const sumInsured = document.getElementById('existing-sum-insured');
    const sinceDate = document.getElementById('policy-since-date');

    const parts = [];
    if (insurerName && insurerName.value) parts.push('Insurer: ' + insurerName.value);
    if (policyNumber && policyNumber.value) parts.push('Policy #: ' + policyNumber.value);
    if (sumInsured && sumInsured.value) parts.push('SI: ₹' + sumInsured.value);
    if (sinceDate && sinceDate.value) parts.push('Since: ' + sinceDate.value);
    legacyField.value = parts.join(', ');
}

// --- Event Delegation ---
// We attach these once to the document. Since this script is loaded once, this is safe.

document.addEventListener('change', function (e) {
    // Checkbox Logic
    if (e.target && e.target.id === 'upload-policy-doc-checkbox') {
        const uploadSection = document.getElementById('policy-doc-upload-section');
        const fileInput = document.getElementById('existing-policy-document');
        const statusDiv = document.getElementById('policy-doc-status');
        const sinceDateInput = document.getElementById('policy-since-date');
        const sinceDateLabel = document.querySelector('label[for="policy-since-date"]');

        if (e.target.checked) {
            if (uploadSection) uploadSection.classList.add('visible');
        } else {
            if (uploadSection) uploadSection.classList.remove('visible');
            if (fileInput) fileInput.value = '';
            if (statusDiv) statusDiv.textContent = '';

            // Remove mandatory requirement and asterisk when checkbox is unchecked
            if (sinceDateInput) {
                sinceDateInput.removeAttribute('required');
            }
            if (sinceDateLabel && sinceDateLabel.textContent.includes('*')) {
                sinceDateLabel.textContent = 'Since When (Date)';
            }
        }
    }
});

document.addEventListener('input', function (e) {
    // Legacy Field Update
    if (['insurer-name', 'existing-policy-number', 'existing-sum-insured', 'policy-since-date'].includes(e.target.id)) {
        updateLegacyField();
    }
});

document.addEventListener('click', function (e) {
    const uniqueId = getUniqueId();
    // Fallback ID for local actions
    const effectiveId = uniqueId || 'temp_draft';
    const statusDiv = document.getElementById('policy-doc-status');

    // UPLOAD BUTTON
    if (e.target && e.target.id === 'upload-policy-btn') {
        const fileInput = document.getElementById('existing-policy-document');
        if (!fileInput) return;

        if (!fileInput.files.length) {
            if (statusDiv) {
                statusDiv.textContent = 'Please select a file first';
                statusDiv.style.color = '#d32f2f';
            }
            return;
        }

        const file = fileInput.files[0];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (file.size > maxSize) {
            if (statusDiv) {
                statusDiv.textContent = 'File size exceeds 10MB limit';
                statusDiv.style.color = '#d32f2f';
            }
            return;
        }

        // STRICT PDF CHECK
        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        if (!isPDF) {
            if (statusDiv) {
                statusDiv.textContent = 'Only PDF files are allowed. Please upload a valid PDF.';
                statusDiv.style.color = '#d32f2f';
            }
            return;
        }

        const reader = new FileReader();
        reader.onerror = function () {
            if (statusDiv) {
                statusDiv.textContent = 'Error reading file. Please try again.';
                statusDiv.style.color = '#d32f2f';
            }
        };
        reader.onload = function (evt) {
            try {
                // REMOVED: uniqueId check error throw

                const docData = {
                    fileName: file.name,
                    fileData: evt.target.result,
                    uploadedAt: new Date().toISOString()
                };

                // Save Local with fallback key
                const storageKey = POLICY_DOC_STORAGE_KEY + effectiveId;
                localStorage.setItem(storageKey, JSON.stringify(docData));

                if (statusDiv) {
                    statusDiv.textContent = 'Document uploaded successfully!';
                    statusDiv.style.color = '#2e7d32';
                }

                displayAttachedDocument(docData);

                // Only save to server if we have a real uniqueId
                if (uniqueId) {
                    saveDocumentToServer(uniqueId, docData);
                }

                fileInput.value = ''; // Reset input

            } catch (error) {
                if (statusDiv) {
                    statusDiv.textContent = 'Error uploading document: ' + error.message;
                    statusDiv.style.color = '#d32f2f';
                }
            }
        };
        reader.readAsDataURL(file);
    }

    // VIEW BUTTON
    if (e.target && e.target.id === 'view-policy-doc-btn') {
        const storageKey = POLICY_DOC_STORAGE_KEY + effectiveId;
        const docDataStr = localStorage.getItem(storageKey);

        // Also try to check if there is a 'temp_draft' specifically if uniqueId was present but empty
        // logic above covers it with effectiveId

        if (docDataStr) {
            const docData = JSON.parse(docDataStr);
            if (docData.fileData) {
                const win = window.open();
                if (win) {
                    win.document.write(
                        '<iframe src="' + docData.fileData + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>'
                    );
                }
            }
        } else {
            alert('Document not found locally. Try refreshing.');
        }
    }

    // REMOVE BUTTON
    if (e.target && e.target.id === 'remove-policy-doc-btn') {
        const storageKey = POLICY_DOC_STORAGE_KEY + effectiveId;
        localStorage.removeItem(storageKey);

        const docAttached = document.getElementById('policy-doc-attached');
        const fileInput = document.getElementById('existing-policy-document');

        if (docAttached) docAttached.style.display = 'none';
        if (fileInput) fileInput.value = '';
        if (statusDiv) {
            statusDiv.textContent = 'Document removed.';
            statusDiv.style.color = '#f57c00';
        }

        // Also delete from server if we have a unique ID
        if (uniqueId) {
            fetch(`/api/delete-policy-document/${uniqueId}`, {
                method: 'DELETE'
            })
                .then(response => {
                    if (response.ok) {
                        console.log('[Existing Coverage] Document deleted from server');
                    } else {
                        console.warn('[Existing Coverage] Failed to delete document from server');
                    }
                })
                .catch(error => {
                    console.error('[Existing Coverage] Error deleting document from server:', error);
                });
        }

        // Also uncheck the upload checkbox
        const uploadCheckbox = document.getElementById('upload-policy-doc-checkbox');
        if (uploadCheckbox) {
            uploadCheckbox.checked = false;
            // Trigger change event to hide upload section
            uploadCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
});

// Expose init function globally
window.initializeExistingCoverage = initializeExistingCoverage;
