// Prefill helper for Existing User request Page
// Exposes window.prefillExistingForm(data)
// 
// PATCHED: 
// - Renamed first_name/middle_name/last_name to pc_fname/pc_mname/pc_lname
//   to prevent Policy_Creation.html from catching these fields when searching for "name"
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

  // Helper to extract a single meaningful value from potentially corrupted array data
  function extractSingleValue(val) {
    if (val === undefined || val === null) return null;
    
    // If it's an array, find the first non-empty value
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== undefined && item !== null && String(item).trim() !== '') {
          return String(item).trim();
        }
      }
      return null; // All values were empty
    }
    
    // If it's a string that looks like a comma-separated array (e.g., "male,,male" or ",2024-01-01")
    if (typeof val === 'string' && val.includes(',')) {
      const parts = val.split(',');
      for (const part of parts) {
        if (part.trim() !== '') {
          return part.trim();
        }
      }
      return null;
    }
    
    // Return as-is if it's a simple value
    return val;
  }

  function setFields(containerId, values) {
    if (!values) return;
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container not found: ${containerId}`);
      return;
    }
    
    console.log(`Setting fields in ${containerId}:`, values);
    
    Object.entries(values).forEach(([name, rawVal]) => {
      if (rawVal === undefined || rawVal === null || rawVal === '') return;
      
      // Skip fields that don't belong in this section (member fields, etc.)
      const skipPatterns = ['member_', 'member-', 'comments_noted', 'disease'];
      const skipSuffixes = ['_details', '_start_date', '_since_year', '_since_years'];
      if (skipPatterns.some(pattern => name.startsWith(pattern) || name === pattern) ||
          skipSuffixes.some(suffix => name.endsWith(suffix))) {
        return;
      }
      
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
            break;
          }
        }
      }
      
      // Also try by ID if name selector didn't work
      if (els.length === 0) {
        const byId = container.querySelector(`#${CSS.escape(name)}`);
        if (byId) {
          els = [byId];
        }
      }
      
      if (els.length === 0) {
        // Don't log warnings for fields that clearly don't belong in this section
        return;
      }
      
      els.forEach(el => {
        try {
          // Remove any readonly/disabled attributes before setting
          el.removeAttribute('readonly');
          const wasDisabled = el.disabled;
          el.disabled = false;
          
          if (el.type === 'radio') {
            // For radio buttons, extract single value and compare
            const cleanVal = extractSingleValue(rawVal);
            if (cleanVal && String(el.value) === String(cleanVal)) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`Set radio ${name} to ${cleanVal}`);
            }
          } else if (el.type === 'checkbox') {
            // For checkboxes (like disease), handle array of selected values
            if (Array.isArray(rawVal)) {
              // Filter out empty values and check if this checkbox's value is in the array
              const cleanArray = rawVal.filter(v => v !== undefined && v !== null && String(v).trim() !== '');
              el.checked = cleanArray.includes(el.value);
            } else if (typeof rawVal === 'string' && rawVal.includes(',')) {
              // Handle comma-separated string
              const parts = rawVal.split(',').map(p => p.trim()).filter(p => p !== '');
              el.checked = parts.includes(el.value);
            } else {
              el.checked = Boolean(rawVal) || String(el.value) === String(rawVal);
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Set checkbox ${name} to ${el.checked}`);
          } else if (el.type === 'date') {
            // Extract single date value
            let dateValue = extractSingleValue(rawVal);
            if (!dateValue) return;
            
            // Convert dd/mm/yyyy to yyyy-mm-dd if needed
            if (typeof dateValue === 'string' && dateValue.includes('/')) {
              const parts = dateValue.split('/');
              if (parts.length === 3) {
                dateValue = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              }
            }
            el.value = dateValue;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Set date ${name} to ${dateValue}`);
          } else if (el.tagName === 'SELECT') {
            // For select dropdowns, extract single value
            const cleanVal = extractSingleValue(rawVal);
            if (cleanVal) {
              el.value = cleanVal;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`Set select ${name} to ${cleanVal}`);
            }
          } else {
            // For text inputs/textareas, extract single value
            const cleanVal = extractSingleValue(rawVal);
            if (cleanVal !== null) {
              el.value = cleanVal;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`Set field ${name} to ${cleanVal}`);
            }
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
      // Helper function to check if an object has meaningful content
      const hasContent = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length > 0;
      
      // Handle both nested and flat data structures
      // Only use nested structure if it actually has content, otherwise fall back to flat data
      const primaryContactData = hasContent(data.primaryContact) ? data.primaryContact : data;
      const healthHistoryData = hasContent(data.healthHistory) ? data.healthHistory : data;
      const coverCostData = hasContent(data.coverAndCost) ? data.coverAndCost : data;
      const existingCoverageData = hasContent(data.existingCoverage) ? data.existingCoverage : data;
      const claimsServiceData = hasContent(data.claimsAndService) ? data.claimsAndService : data;
      const financeDocData = hasContent(data.financeAndDocumentation) ? data.financeAndDocumentation : data;
      
      console.log('Section data extracted:', {
        primaryContact: Object.keys(primaryContactData).length,
        healthHistory: Object.keys(healthHistoryData).length,
        coverCost: Object.keys(coverCostData).length
      });
      
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

      // Only look in healthHistory section, not in top-level data (which may have member data mixed in)
      const diseaseData = healthHistoryData.disease;
      if (diseaseData) {
        // Clean up disease array - filter out empty values
        let diseaseArr = [];
        if (Array.isArray(diseaseData)) {
          diseaseArr = diseaseData.filter(v => v !== undefined && v !== null && String(v).trim() !== '');
        } else if (typeof diseaseData === 'string') {
          // Handle comma-separated string
          diseaseArr = diseaseData.split(',').map(v => v.trim()).filter(v => v !== '');
        }
        
        console.log('Processing PRIMARY APPLICANT diseases:', diseaseArr);
        
        diseaseArr.forEach(val => {
          if (!val) return;
          
          // FIXED: Only target disease checkboxes in the health-history-content section
          // This prevents accidentally checking member disease checkboxes
          const cb = document.querySelector(`#health-history-content input[name="disease"][value="${CSS.escape(val)}"]`);
          if (!cb) {
            console.log(`Disease checkbox not found in health-history-content for: ${val}`);
            return;
          }
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Handle disease details textarea - ONLY in healthHistoryData
          const detailsKey = `${val}_details`;
          const rawDetailsValue = healthHistoryData[detailsKey];
          const detailsValue = extractSingleValue(rawDetailsValue);
          const txt = document.querySelector(`#health-history-content textarea[name="${CSS.escape(detailsKey)}"]`);
          if (txt && detailsValue) {
            txt.disabled = false;
            txt.value = detailsValue;
            console.log(`Set disease details ${detailsKey} to ${detailsValue}`);
          }
          
          // Handle disease since year - ONLY in healthHistoryData
          const sinceYearKey = `${val}_since_year`;
          const rawYearValue = healthHistoryData[sinceYearKey];
          const yearValue = extractSingleValue(rawYearValue);
          const sinceYearSelect = document.querySelector(`#health-history-content select[name="${CSS.escape(sinceYearKey)}"]`);
          if (sinceYearSelect && yearValue) {
            sinceYearSelect.disabled = false;
            sinceYearSelect.value = yearValue;
            console.log(`Set disease since year ${sinceYearKey} to ${yearValue}`);
          }
          
          // Handle disease since years - ONLY in healthHistoryData
          const sinceYearsKey = `${val}_since_years`;
          const rawYearsValue = healthHistoryData[sinceYearsKey];
          const yearsValue = extractSingleValue(rawYearsValue);
          const sinceYearsInput = document.querySelector(`#health-history-content input[name="${CSS.escape(sinceYearsKey)}"]`);
          if (sinceYearsInput && yearsValue) {
            sinceYearsInput.disabled = false;
            sinceYearsInput.value = yearsValue;
            console.log(`Set disease since years ${sinceYearsKey} to ${yearsValue}`);
          }
          
          // Backward compatibility: convert old start_date to since_year
          const dateKey = `${val}_start_date`;
          const rawDateValue = healthHistoryData[dateKey];
          const dateValue = extractSingleValue(rawDateValue);
          if (dateValue && !yearValue) {
            // Extract year from date and populate since_year
            const dateObj = new Date(dateValue);
            if (!isNaN(dateObj.getTime())) {
              const year = dateObj.getFullYear();
              if (sinceYearSelect) {
                sinceYearSelect.disabled = false;
                sinceYearSelect.value = year;
                console.log(`Converted start_date ${dateValue} to since_year ${year}`);
              }
              // Calculate years
              const currentYear = new Date().getFullYear();
              if (sinceYearsInput) {
                sinceYearsInput.disabled = false;
                sinceYearsInput.value = Math.max(0, currentYear - year);
              }
            }
          }
        });
        
        // Final sync to open details for any prefilled textarea content
        if (window.initializeDiseaseDetails) window.initializeDiseaseDetails();
        
        // FIXED: Only sync disease entries in the health-history-content section
        document.querySelectorAll('#health-history-content .disease-entry').forEach(entry => {
          const cb = entry.querySelector('input[type="checkbox"][name="disease"]');
          const details = entry.querySelector('.disease-details-container');
          const ta = details ? details.querySelector('textarea') : null;
          const sinceYearSelect = details ? details.querySelector('.disease-since-year') : null;
          const sinceYearsInput = details ? details.querySelector('.disease-since-years') : null;
          if (cb && details && (cb.checked || (ta && ta.value && ta.value.trim() !== ''))) {
            cb.checked = true;
            details.style.display = 'flex';
            if (ta) ta.disabled = false;
            if (sinceYearSelect) sinceYearSelect.disabled = false;
            if (sinceYearsInput) sinceYearsInput.disabled = false;
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
      
      // PATCH: Check for both old and new field name formats
      // Old format: first_name, middle_name, last_name
      // New format: pc_fname, pc_mname, pc_lname
      const firstName = data.pc_fname || primaryContactData.pc_fname || 
                       data.first_name || primaryContactData.first_name;
      const middleName = data.pc_mname || primaryContactData.pc_mname || 
                        data.middle_name || primaryContactData.middle_name;
      const lastName = data.pc_lname || primaryContactData.pc_lname || 
                      data.last_name || primaryContactData.last_name;
      
      if (uniqueId) {
        const uidEl = document.querySelector('#primary-contact-content [name="unique_id"]');
        if (uidEl) {
          uidEl.removeAttribute('readonly');
          uidEl.value = uniqueId;
          console.log('Set unique_id to:', uniqueId);
        }
      }
      
      // Handle name fields - prefer new format if available, otherwise parse from applicant_name
      if (firstName || lastName) {
        // PATCH: Updated selectors to use new field names (pc_fname, pc_mname, pc_lname)
        const firstNameEl = document.querySelector('#primary-contact-content [name="pc_fname"]');
        const middleNameEl = document.querySelector('#primary-contact-content [name="pc_mname"]');
        const lastNameEl = document.querySelector('#primary-contact-content [name="pc_lname"]');
        const fullNameEl = document.querySelector('#primary-contact-content [name="applicant_name"]');
        
        if (firstNameEl && firstName) {
          firstNameEl.value = firstName;
          console.log('Set pc_fname to:', firstName);
        }
        if (middleNameEl && middleName) {
          middleNameEl.value = middleName;
          console.log('Set pc_mname to:', middleName);
        }
        if (lastNameEl && lastName) {
          lastNameEl.value = lastName;
          console.log('Set pc_lname to:', lastName);
        }
        // Also set the hidden full name field
        if (fullNameEl) {
          const parts = [firstName, middleName, lastName].filter(p => p && p.trim());
          fullNameEl.value = parts.join(' ');
        }
      } else if (applicantName) {
        // Old format - parse full name into components
        if (typeof window.populateNameFieldsFromFullName === 'function') {
          window.populateNameFieldsFromFullName(applicantName);
          console.log('Parsed applicant_name into name fields:', applicantName);
        } else {
          // Fallback: populate hidden field directly and attempt simple parsing
          const fullNameEl = document.querySelector('#primary-contact-content [name="applicant_name"]');
          if (fullNameEl) {
            fullNameEl.value = applicantName;
          }
          
          // PATCH: Updated selectors to use new field names
          const parts = applicantName.trim().split(/\s+/).filter(p => p);
          const firstNameEl = document.querySelector('#primary-contact-content [name="pc_fname"]');
          const middleNameEl = document.querySelector('#primary-contact-content [name="pc_mname"]');
          const lastNameEl = document.querySelector('#primary-contact-content [name="pc_lname"]');
          
          if (parts.length >= 1 && firstNameEl) {
            firstNameEl.value = parts[0];
          }
          if (parts.length >= 3) {
            if (middleNameEl) middleNameEl.value = parts.slice(1, -1).join(' ');
            if (lastNameEl) lastNameEl.value = parts[parts.length - 1];
          } else if (parts.length === 2 && lastNameEl) {
            lastNameEl.value = parts[1];
          }
          console.log('Set applicant_name (fallback) to:', applicantName);
        }
      }
      
      console.log('Prefill completed successfully');
    } catch (e) {
      console.error('Prefill error', e);
    }
  }

  window.prefillExistingForm = prefillExistingForm;
})();
