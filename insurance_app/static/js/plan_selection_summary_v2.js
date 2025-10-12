// Shared Plan Selection Summary Table Renderer (v2)
// Usage:
//   renderPlanSelectionSummary(hostEl, {
//     proposed: { key: { name: 'Family', plans: ['Plan A', 'Plan B'] }, ... },
//     agentSel: new Set(['Plan A']),
//     supervisorSel: new Set(['Plan B']),
//     clientSel: new Set(['Plan C']),
//     mode: 'analysis' | 'supervisor' | 'approvals',
//     orderKeys: ['comprehensive_cover', 'member1', ...], // optional
//     onSupervisorToggle: (planName, checked) => {},
//     onClientToggle: (planName, checked) => {}
//   });

(function(global){
  function escapeHtml(s){
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function ensureOrderKeys(proposed, orderKeys){
    const keys = Array.isArray(orderKeys) && orderKeys.length ? orderKeys.slice() : Object.keys(proposed || {});
    if (keys.includes('comprehensive_cover')) {
      const i = keys.indexOf('comprehensive_cover');
      if (i > 0) { keys.splice(i, 1); keys.unshift('comprehensive_cover'); }
    }
    return keys;
  }

  function makeTick(isSelected){
    return isSelected
      ? '<span aria-label="selected" style="color:#0a7; font-weight:700;">&#10003;</span>'
      : '<span aria-label="not-selected" style="color:#c33; font-weight:700;">&#10007;</span>';
  }

  function renderTableHTML(opts){
    const proposed = opts.proposed || {};
    const agentSel = opts.agentSel instanceof Set ? opts.agentSel : new Set();
    const supervisorSel = opts.supervisorSel instanceof Set ? opts.supervisorSel : new Set();
    const clientSel = opts.clientSel instanceof Set ? opts.clientSel : new Set();
    const mode = opts.mode || 'analysis';
    const order = ensureOrderKeys(proposed, opts.orderKeys);

    let html = '';
    html += '<table style="width:100%; border-collapse:collapse;">';
    // Dynamic header based on mode
    html += '<thead><tr>'+
            '<th style="border:1px solid #ddd; padding:8px; text-align:left;">System proposed plans</th>'+
            '<th style="border:1px solid #ddd; padding:8px; text-align:left;">Agent proposed plans</th>'+
            ((mode === 'supervisor' || mode === 'approvals') ? '<th style="border:1px solid #ddd; padding:8px; text-align:left;">Supervisor approved plans</th>' : '')+
            (mode === 'approvals' ? '<th style="border:1px solid #ddd; padding:8px; text-align:left;">Client Agreed plan(s)</th>' : '')+
            '</tr></thead><tbody>';

    function row(cells){
      // cells: [system, agent, supervisor?, client?]
      const tds = cells.map((c, idx) => {
        const align = (idx === 1) ? 'text-align:center;' : '';
        return `<td style=\"border:1px solid #ddd; padding:8px; ${align}\">${c}</td>`;
      }).join('');
      html += `<tr>${tds}</tr>`;
    }

    order.forEach(key => {
      const info = proposed[key] || {};
      const section = info.name || (key === 'comprehensive_cover' ? 'Family' : key);
      const headerCells = [`<div style=\"background:#cff9ff; font-weight:600; padding:4px 6px;\">${escapeHtml(section)}</div>`, ''];
      if (mode === 'supervisor' || mode === 'approvals') headerCells.push('');
      if (mode === 'approvals') headerCells.push('');
      row(headerCells);
      const plans = Array.isArray(info.plans) ? info.plans : [];
      if (!plans.length){
        const noCells = ['<span style=\"color:#888;\">No plans</span>', '<span style=\"color:#bbb;\">—</span>'];
        if (mode === 'supervisor' || mode === 'approvals') noCells.push('<span style=\"color:#bbb;\">—</span>');
        if (mode === 'approvals') noCells.push('<span style=\"color:#bbb;\">—</span>');
        row(noCells);
        return;
      }
      plans.forEach(name => {
        const safeName = escapeHtml(name);
        const agentCell = makeTick(agentSel.has(name));
        let supCell = '';
        let clientCell = '';
        if (mode === 'supervisor'){
          const checked = supervisorSel.has(name) ? 'checked' : '';
          supCell = `<label style=\"display:inline-flex; gap:6px; align-items:center;\">`+
                   `<input type=\"checkbox\" class=\"pss-sup\" data-plan-name=\"${safeName}\" ${checked}><span>Select</span></label>`;
        } else if (mode === 'analysis'){
          const checked = supervisorSel.has(name);
          supCell = `<label style=\"display:inline-flex; gap:6px; align-items:center;\">`+
                   `<input type=\"checkbox\" ${checked ? 'checked' : ''} disabled><span>Select</span></label>`;
        } else { // approvals (supervisor read-only; client interactive)
          supCell = makeTick(supervisorSel.has(name));
          const cChecked = clientSel.has(name) ? 'checked' : '';
          clientCell = `<label style=\"display:inline-flex; gap:6px; align-items:center;\">`+
                       `<input type=\"checkbox\" class=\"pss-client\" data-plan-name=\"${safeName}\" ${cChecked}><span>Select</span></label>`;
        }
        const cells = [safeName, agentCell];
        if (mode === 'supervisor' || mode === 'approvals') cells.push(supCell);
        if (mode === 'approvals') cells.push(clientCell);
        row(cells);
      });
    });

    html += '</tbody></table>';
    return html;
  }

  function renderPlanSelectionSummary(hostEl, opts){
    if (!hostEl) return;
    const options = Object.assign({}, opts || {});
    hostEl.innerHTML = renderTableHTML(options);
    // Bind supervisor toggles for interactive mode
    if (options.mode === 'supervisor' && typeof options.onSupervisorToggle === 'function'){
      hostEl.querySelectorAll('input.pss-sup').forEach(inp => {
        inp.addEventListener('change', function(){
          const name = this.getAttribute('data-plan-name');
          const checked = this.checked;
          try { options.onSupervisorToggle(name, checked); } catch(e) {}
        });
      });
    }
    // Bind client toggles for approvals mode
    if (options.mode === 'approvals' && typeof options.onClientToggle === 'function'){
      hostEl.querySelectorAll('input.pss-client').forEach(inp => {
        inp.addEventListener('change', function(){
          const name = this.getAttribute('data-plan-name');
          const checked = this.checked;
          try { options.onClientToggle(name, checked); } catch(e) {}
        });
      });
    }
  }

  try { global.renderPlanSelectionSummary = renderPlanSelectionSummary; } catch(e) {}
})(window);
