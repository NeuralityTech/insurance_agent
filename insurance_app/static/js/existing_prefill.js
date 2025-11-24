// Prefill helper for Existing User request Page
// Exposes window.prefillExistingForm(data)
(function(){
  async function waitForSections() {
    // Wait until primary section content has inputs loaded by script.js
    const maxWaitMs = 8000;
    const interval = 100;
    let waited = 0;
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        // Check for tab content 
        const hasPrimary = document.querySelector('#primary-contact-content input, #primary-contact-content select, #primary-contact-content textarea');
        const hasMembers = document.getElementById('members-covered-content');
        if (hasPrimary && hasMembers) {
          clearInterval(timer);
          console.log('Sections loaded and ready for prefill');
          resolve();
        }
        waited += interval;
        if (waited >= maxWaitMs) {
          clearInterval(timer);
          console.warn('Timeout waiting for sections');
          resolve();
        }
      }, interval);
    });
  }

  // Generic waiter utility
  function waitFor(checkFn, timeoutMs = 5000, stepMs = 100) {
    return new Promise(resolve => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (checkFn()) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start >= timeoutMs) { clearInterval(timer); resolve(false); }
      }, stepMs);
    });
  }

  function setFields(containerId, values) {
    if (!values) return;
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container not found: ${containerId}`);
      return;
    }
    
    console.log(`Setting fields in ${containerId}:`, values);
    
    Object.entries(values).forEach(([name, val]) => {
      if (val === undefined || val === null || val === '') return;
      
      // Try multiple selectors to find the field
      let els = container.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      
      // If not found, try common field name variations
      if (els.length === 0) {
        const variations = [
          name.replace(/_/g, '-'),
          name.replace(/-/g, '_'),
          name.replace(/([A-Z])/g, '-$1').toLowerCase(),
          name.toLowerCase()
        ];
        
        for (const variation of variations) {
          els = container.querySelectorAll(`[name="${CSS.escape(variation)}"]`);
          if (els.length > 0) {
            console.log(`Found field using variation: ${variation}`);
            break;
          }
        }
      }
      
      // Also try by ID if name selector didn't work
      if (els.length === 0) {
        const byId = container.querySelector(`#${CSS.escape(name)}`);
        if (byId) {
          els = [byId];
          console.log(`Found field by ID: ${name}`);
        }
      }
      
      if (els.length === 0) {
        console.warn(`Field not found: ${name}`);
        return;
      }
      
      els.forEach(el => {
        try {
          // Remove any readonly/disabled attributes before setting
          el.removeAttribute('readonly');
          const wasDisabled = el.disabled;
          el.disabled = false;
          
          if (el.type === 'radio') {
            if (String(el.value) === String(val)) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`Set radio ${name} to ${val}`);
            }
          } else if (el.type === 'checkbox') {
            if (Array.isArray(val)) {
              el.checked = val.includes(el.value);
            } else {
              el.checked = Boolean(val) || String(el.value) === String(val);
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Set checkbox ${name} to ${el.checked}`);
          } else if (el.type === 'date') {
            let dateValue = val;
            if (typeof val === 'string' && val.includes('/')) {
              const parts = val.split('/');
              if (parts.length === 3) {
                dateValue = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              }
            }
            el.value = dateValue;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Set date ${name} to ${dateValue}`);
          } else {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Set field ${name} to ${val}`);
          }
          
          // Restore disabled state if it was disabled
          if (wasDisabled) {
            el.disabled = true;
          }
        } catch (e) {
          console.warn(`Failed to set field ${name}:`, e);
        }
      });
    });
  }

  async function prefillExistingForm(data) {
    console.log('Starting prefill with data:', data);
    await waitForSections();
    
    try {
      // Handle both nested and flat data structures
      const primaryContactData = data.primaryContact || data;
      const healthHistoryData = data.healthHistory || data;
      const coverCostData = data.coverAndCost || data;
      const existingCoverageData = data.existingCoverage || data;
      const claimsServiceData = data.claimsAndService || data;
      const financeDocData = data.financeAndDocumentation || data;
      
      // Use section-specific data
      setFields('primary-contact-content', primaryContactData);
      // After primary contact height is restored (in cm), sync visible feet/inches if helper exists
      if (typeof window.updateHeightFeetInchesFromCm === "function") {
          window.updateHeightFeetInchesFromCm();
      }
      setFields('health-history-content', healthHistoryData);
      setFields('cover-cost-content', coverCostData);
      setFields('existing-coverage-content', existingCoverageData);
      setFields('claims-service-content', claimsServiceData);
      setFields('finance-documentation-content', financeDocData);
      
      // Load comments for existing user
      if (window.loadExistingComments && (data.unique_id || data.primaryContact?.unique_id)) {
        const uid = data.unique_id || data.primaryContact.unique_id;
        window.loadExistingComments(uid);
      }

      // Explicitly handle disease list to ensure details are revealed and values applied
      const diseaseData = healthHistoryData.disease || data.disease;
      if (diseaseData) {
        const diseaseArr = Array.isArray(diseaseData) ? diseaseData : [];
        diseaseArr.forEach(val => {
          const cb = document.querySelector(`#health-history-content input[name="disease"][value="${CSS.escape(val)}"]`)
            || document.querySelector(`input[name="disease"][value="${CSS.escape(val)}"]`);
          if (!cb) return;
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          
          const detailsKey = `${val}_details`;
          const detailsValue = healthHistoryData[detailsKey] || data[detailsKey];
          const txt = document.querySelector(`#health-history-content textarea[name="${CSS.escape(detailsKey)}"]`)
            || document.querySelector(`textarea[name="${CSS.escape(detailsKey)}"]`);
          if (txt && typeof detailsValue !== 'undefined') {
            txt.value = detailsValue;
          }
        });
        
        // Final sync to open details for any prefilled textarea content
        if (window.initializeDiseaseDetails) window.initializeDiseaseDetails();
        document.querySelectorAll('#health-history-content .disease-entry').forEach(entry => {
          const cb = entry.querySelector('input[type="checkbox"][name="disease"]');
          const details = entry.querySelector('.disease-details-container');
          const ta = details ? details.querySelector('textarea') : null;
          if (cb && details && ta && (cb.checked || (ta.value && ta.value.trim() !== ''))) {
            cb.checked = true;
            details.style.display = 'flex';
            ta.disabled = false;
          }
        });
      }

      // Members 
      const loadStatus = document.getElementById('load-status');
      if (loadStatus) { loadStatus.textContent = 'Loading members...'; }
      
      const membersData = data.members || [];
      if (Array.isArray(membersData)) {
        localStorage.setItem('members', JSON.stringify(membersData));
      }
      
      // Wait until the members section script exposes its refresher
      await waitFor(() => typeof window.loadMembersGlobal === 'function' || document.getElementById('members-list'), 5000, 100);
      if (typeof window.loadMembersGlobal === 'function') {
        window.loadMembersGlobal();
      }
      if (typeof window.updatePeopleCounter === 'function') {
        window.updatePeopleCounter();
      }
      if (loadStatus) { loadStatus.textContent = 'Data loaded. You can edit and save.'; }

      // Reflect top-level unique_id/applicant_name if present
      const uniqueId = data.unique_id || primaryContactData.unique_id;
      const applicantName = data.applicant_name || primaryContactData.applicant_name;
      
      if (uniqueId) {
        const uidEl = document.querySelector('#primary-contact-content [name="unique_id"]');
        if (uidEl) {
          uidEl.removeAttribute('readonly');
          uidEl.value = uniqueId;
          console.log('Set unique_id to:', uniqueId);
        }
      }
      if (applicantName) {
        const nameEl = document.querySelector('#primary-contact-content [name="applicant_name"]');
        if (nameEl) {
          nameEl.removeAttribute('readonly');
          nameEl.value = applicantName;
          console.log('Set applicant_name to:', applicantName);
        }
      }
      
      console.log('Prefill completed successfully');
    } catch (e) {
      console.error('Prefill error', e);
    }
  }

  window.prefillExistingForm = prefillExistingForm;
})();