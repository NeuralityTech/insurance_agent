// Prefill helper for Existing User request Page
// Exposes window.prefillExistingForm(data)
(function(){
  async function waitForSections() {
    // Wait until primary section placeholder has inputs loaded by script.js
    const maxWaitMs = 8000;
    const interval = 100;
    let waited = 0;
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        const hasPrimary = document.querySelector('#primary-contact-placeholder input, #primary-contact-placeholder select, #primary-contact-placeholder textarea');
        const hasMembers = document.getElementById('members-covered-placeholder');
        if (hasPrimary && hasMembers) {
          clearInterval(timer);
          resolve();
        }
        waited += interval;
        if (waited >= maxWaitMs) {
          clearInterval(timer);
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
    if (!container) return;
    Object.entries(values).forEach(([name, val]) => {
      if (val === undefined || val === null) return;
      const els = container.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      els.forEach(el => {
        if (el.type === 'radio') {
          if (String(el.value) === String(val)) el.checked = true;
        } else if (el.type === 'checkbox') {
          if (Array.isArray(val)) el.checked = val.includes(el.value);
          else el.checked = Boolean(val) || String(el.value) === String(val);
          // Ensure dependent UI updates (e.g., disease details visibility)
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          el.value = val;
        }
      });
    });
  }

  async function prefillExistingForm(data) {
    await waitForSections();
    try {
      // Sections map
      setFields('primary-contact-placeholder', data.primaryContact || {});
      setFields('Health-History-placeholder', data.healthHistory || {});
      setFields('cover-cost-placeholder', data.coverAndCost || {});
      setFields('existing-coverage-placeholder', data.existingCoverage || {});
      setFields('claims-service-placeholder', data.claimsAndService || {});
      setFields('Finance-Documentation-placeholder', data.financeAndDocumentation || {});
      setFields('other-notes-placeholder', data.otherNotes || {});

      // Explicitly handle disease list to ensure details are revealed and values applied
      if (data.healthHistory) {
        const diseaseArr = Array.isArray(data.healthHistory.disease) ? data.healthHistory.disease : [];
        diseaseArr.forEach(val => {
          const cb = document.querySelector(`#Health-History-placeholder input[name="disease"][value="${CSS.escape(val)}"]`)
            || document.querySelector(`input[name="disease"][value="${CSS.escape(val)}"]`);
          if (!cb) return;
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          const txt = document.querySelector(`#Health-History-placeholder textarea[name="${CSS.escape(val)}_details"]`)
            || document.querySelector(`textarea[name="${CSS.escape(val)}_details"]`);
          if (txt && typeof data.healthHistory[`${val}_details`] !== 'undefined') {
            txt.value = data.healthHistory[`${val}_details`];
          }
        });
        // Final sync to open details for any prefilled textarea content
        if (window.initializeDiseaseDetails) window.initializeDiseaseDetails();
        document.querySelectorAll('#Health-History-placeholder .disease-entry').forEach(entry => {
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

      // Members (show loading message while we set up)
      const loadStatus = document.getElementById('load-status');
      if (loadStatus) { loadStatus.textContent = 'Loading members...'; }
      if (Array.isArray(data.members)) {
        localStorage.setItem('members', JSON.stringify(data.members));
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
      if (data.unique_id || (data.primaryContact && data.primaryContact.unique_id)) {
        const uid = data.unique_id || data.primaryContact.unique_id;
        const uidEl = document.querySelector('#primary-contact-placeholder [name="unique_id"]');
        if (uidEl) uidEl.value = uid;
      }
      if (data.applicant_name || (data.primaryContact && data.primaryContact.applicant_name)) {
        const an = data.applicant_name || data.primaryContact.applicant_name;
        const nameEl = document.querySelector('#primary-contact-placeholder [name="applicant_name"]');
        if (nameEl) nameEl.value = an;
      }
    } catch (e) {
      console.error('Prefill error', e);
    }
  }

  window.prefillExistingForm = prefillExistingForm;
})();
