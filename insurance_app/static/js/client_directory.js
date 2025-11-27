document.addEventListener('DOMContentLoaded', async () => {
  const uid = localStorage.getItem('loggedInUserId');
  const userEl = document.getElementById('logged-in-user');
  if (uid) userEl.textContent = uid; else window.location.href = 'Main_login.html';

  document.getElementById('logout-btn').addEventListener('click', function(){
    localStorage.removeItem('loggedInUserId');
    window.location.href = 'Main_login.html';
  });

  const selSupervisor = document.getElementById('filter-supervisor');
  const selStatus = document.getElementById('filter-status');
  const inpUid = document.getElementById('filter-uid');
  const btnApply = document.getElementById('btn-apply');
  const btnClear = document.getElementById('btn-clear');
  const btnBack = document.getElementById('btn-back');
  const tbody = document.getElementById('results-body');
  const countEl = document.getElementById('result-count');

  let supervisors = [];
  let clients = [];

  async function loadData() {
    try {
      const [supRes, cliRes] = await Promise.all([
        fetch('/supervisors'),
        fetch('/clients')
      ]);
      supervisors = await supRes.json();
      clients = await cliRes.json();
      populateSupervisors();
      render();
    } catch (e) {
      console.error('Failed to load data', e);
    }
  }

  function populateSupervisors() {
    // supervisors endpoint returns array of { name, user_id, phone_number, agents: [...] }
    if (!Array.isArray(supervisors)) return;
    supervisors.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.user_id || s.name || '';
      opt.textContent = s.name || s.user_id;
      selSupervisor.appendChild(opt);
    });
  }

  function normalizeStatus(s) { return (s || '').toString().trim().toLowerCase(); }

  function applyFilters(list) {
    const sup = selSupervisor.value.trim();
    const st = normalizeStatus(selStatus.value);
    const q = inpUid.value.trim().toLowerCase();

    return list.filter(c => {
      const matchUid = !q || (c.unique_id || '').toLowerCase().includes(q);
      // Prefer application_status for filtering if present; fallback to supervisor_status otherwise
      const statusForFilter = (c.application_status != null && c.application_status !== '') ? c.application_status : c.supervisor_status;
      const matchStatus = !st || normalizeStatus(statusForFilter) === st;
      // No supervisor id on clients list; if available via Agent -> Supervisor mapping, extend later
      const matchSup = !sup || (c.agent || '').includes(sup) || (c.supervisor_id === sup);
      return matchUid && matchStatus && matchSup;
    });
  }

  function render() {
    const filtered = applyFilters(Array.isArray(clients) ? clients : []);
    tbody.innerHTML = '';
    filtered.forEach(c => {
      const tr = document.createElement('tr');
      const uid = c.unique_id || '';
      const uidLink = uid ? `<a href="/html/Existing_Applicant_Request_Form.html?uid=${encodeURIComponent(uid)}" class="link">${escapeHtml(uid)}</a>` : '';
      const statusText = (c.application_status != null && c.application_status !== '') ? c.application_status : (c.supervisor_status || '');
      tr.innerHTML = `
        <td>${escapeHtml(c.name || '')}</td>
        <td>${uidLink}</td>
        <td>${escapeHtml(c.agent || '')}</td>
        <td>${escapeHtml((statusText || '').toString().toUpperCase())}</td>
      `;
      tbody.appendChild(tr);
    });
    countEl.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
  }

  // No row-level click handler needed; Unique ID is a direct link.

  btnApply.addEventListener('click', render);
  btnClear.addEventListener('click', () => {
    selSupervisor.value = '';
    selStatus.value = '';
    inpUid.value = '';
    render();
  });
  btnBack.addEventListener('click', () => {
    window.location.href = '/html/Health_Insurance_Proposal_Request.html';
  });

  function escapeHtml(s){
    return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }
  function escapeAttr(s){
    return (s||'').replace(/["']/g, c => ({'"':'&quot;','\'':'&#39;'}[c]));
  }

  await loadData();
});
