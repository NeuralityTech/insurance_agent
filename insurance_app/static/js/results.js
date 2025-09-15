// ----- Utilities for age/BMI -----
const yearsFromDob = (dobStr) => {
  if (!dobStr) return "—";
  const d = new Date(dobStr); if (isNaN(d)) return "—";
  const now = new Date(); let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return Math.max(0, y);
};
const bmi = (kg, cm) => {
  if (!kg || !cm) return "—";
  const val = kg / Math.pow(cm/100, 2);
  return isFinite(val) ? val.toFixed(1) : "—";
};

// ----- Personal Info rendering -----
function renderPersonalInfo(client){
  const el = document.getElementById('personalInfo');
  if (!el) return;
  const lines = [];
  // primary
  const p = client?.primaryContact || {};
  const h = client?.healthHistory || {};
  const age = h["self-dob"] ? yearsFromDob(h["self-dob"]) : (h["self-age"] || "—");
  const b = bmi(Number(h["self-weight"]), Number(h["self-height"]));
  lines.push(`<li>Name: ${p.applicant_name || "—"} - Age: ${age} - BMI: ${b}</li>`);
  // members
  (client?.members || []).forEach(m => {
    const ageM = yearsFromDob(m.dob);
    const bM = bmi(Number(m.weight_kg || m.weight), Number(m.height_cm || m.height));
    lines.push(`<li>Name: ${m.name || "—"} - Age: ${ageM} - BMI: ${bM}</li>`);
  });
  el.innerHTML = `
    <h2>Personal Information</h2>
    <ul class="people">${lines.join("")}</ul>
  `;
}

// ----- Plans carousel rendering -----
function renderPlansCarousel(plans){
  const track = document.getElementById('cardsTrack');
  if (!track) return;
  const sorted = [...plans].sort((a,b)=> 
    b.Score_MemberAware - a.Score_MemberAware || b.AilmentScore - a.AilmentScore || a.Rank - b.Rank
  );
  track.innerHTML = sorted.map(p => `
    <article class="plan-card" aria-label="${p['Plan Name']}">
      <div>
        <h3><span class="rank-pill">#${p.Rank}</span>${p['Plan Name']}</h3>
        <div class="kv">
          <div class="k">Category</div><div class="v">${p.Category || 'N/A'}</div>
          <div class="k">Ailment Score</div><div class="v">${Number(p.AilmentScore).toFixed(2)}</div>
          <div class="k">Final Score</div><div class="v">${Number(p.Score_MemberAware).toFixed(2)}</div>
        </div>
      </div>
    </article>
  `).join("");

}

// ----- Carousel controls -----
function setupCarouselControls() {
  const track = document.getElementById('cardsTrack');
  const prev = document.getElementById('prevBtn');
  const next = document.getElementById('nextBtn');
  const idx  = document.getElementById('carouselIndex');
  if (!track || !prev || !next || !idx) return;

  const cardWidth = () => {
    const first = track.querySelector('.plan-card');
    if (!first) return 320;
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap || style.gap || 0);
    return first.getBoundingClientRect().width + gap;
  };
  const scrollByCards = (n) => track.scrollBy({ left: n * cardWidth(), behavior: 'smooth' });
  prev.onclick = () => scrollByCards(-1);
  next.onclick = () => scrollByCards(1);

  const updateIndex = () => {
    const numCards = track.children.length;
    const w = cardWidth();
    const i = Math.max(0, Math.round(track.scrollLeft / w)) + 1;
    idx.textContent = `${Math.min(i, numCards)} of ${numCards}`;
  };
  track.addEventListener('scroll', () => { window.requestAnimationFrame(updateIndex); });
  window.addEventListener('resize', updateIndex);
  updateIndex();
}

// ----- Table toggle -----
function setupTableToggle(){
  const btn = document.getElementById('toggleTableBtn');
  const table = document.getElementById('plans-table');
  if (!btn || !table) return;
  btn.addEventListener('click', () => {
    const hidden = table.classList.toggle('is-hidden');
    btn.textContent = hidden ? 'View all plans (table)' : 'Hide table';
  });
}

// ----- Initial calls -----
document.addEventListener('DOMContentLoaded', () => {
  const dataEl = document.getElementById('page-data');
  if (!dataEl) {
    console.error('Data element not found');
    return;
  }

  const clientData = JSON.parse(dataEl.dataset.client);
  const plans = JSON.parse(dataEl.dataset.plans);

  renderPersonalInfo(clientData);
  renderPlansCarousel(plans);
  setupCarouselControls();
  setupTableToggle();
});
