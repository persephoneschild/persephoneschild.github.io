const OWNER_EMAIL = 'misiatrade@gmail.com';
const STOP_WORDS = new Set(['a', 'an', 'the', '[]']);
const state = { recordings: [], wants: [], cart: [] };

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === '') quoted = true;
    else if (character === ',') { row.push(cell.trim()); cell = ''; }
    else if (character === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  const headers = rows.shift().map((header) => header.trim());
  return rows.filter((row) => row.length).map((row, index) => Object.assign(Object.fromEntries(headers.map((header, headerIndex) => [header, (row[headerIndex] || '').trim()])), { _id: `recording-${index + 1}` }));
}
function recordingTitle(recording) { return recording.Show || recording.title || 'Untitled recording'; }
function sortableTitle(title) { return title.toLowerCase().replace(/^\[([^\]]+)\]\s*/i, '$1 ').replace(/^(the|a|an)\s*/i, ''); }
function formatCount(count, noun) { return `${count} ${noun}${count === 1 ? '' : 's'}`; }
function recordingField(recording, label, fallback = 'Not listed') { return recording[label] || fallback; }
function recordingDetails(recording) { const notes = [recording['Master Notes'] && `Master: ${recording['Master Notes']}`, recording['Trading Notes'] && `Trader: ${recording['Trading Notes']}`].filter(Boolean).join(' | ') || 'Not listed'; const nft = recording['NFT Date'] || recording['NFT Forever'] || 'Not listed'; return `<div class="recording-fields"><div class="recording-field"><span>Audio / Video</span><b>${recordingField(recording, 'Audio / Video')}</b></div><div class="recording-field"><span>Show</span><b>${recordingTitle(recording)}</b></div><div class="recording-field"><span>Tour</span><b>${recordingField(recording, 'Tour')}</b></div><div class="recording-field"><span>Date</span><b>${recordingField(recording, 'Date')}</b></div><div class="recording-field"><span>Master</span><b>${recordingField(recording, 'Master')}</b></div><div class="recording-field"><span>Cast</span><b>${recordingField(recording, 'Cast')}</b></div><div class="recording-field recording-field-wide"><span>Notes</span><b>${notes}</b></div><div class="recording-field"><span>NFT date</span><b>${nft}</b></div><div class="recording-field"><span>Trader Format</span><b>${recordingField(recording, 'Trader Format')}</b></div></div>`; }

async function loadData() {
  const [recordingsResponse, wantsResponse] = await Promise.all([fetch('collection.csv'), fetch('wants.csv')]);
  state.recordings = parseCSV(await recordingsResponse.text());
  state.wants = parseCSV(await wantsResponse.text());
  state.recordings.sort((a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));
  renderAll();
}
function renderAll() { renderRecordings(); renderWants(); renderCart(); document.querySelector('#home-recording-count').textContent = String(state.recordings.length).padStart(2, '0'); document.querySelector('#home-want-count').textContent = String(state.wants.length).padStart(2, '0'); }
function renderRecordings() {
  const list = document.querySelector('#recording-list');
  const query = document.querySelector('#collection-search').value.toLowerCase().trim();
  const mediaFilter = document.querySelector('#collection-media-filter').value;
  const sort = document.querySelector('#collection-sort').value;
  let recordings = state.recordings.filter((recording) => (mediaFilter === 'all' || recording['Audio / Video'] === mediaFilter) && Object.values(recording).some((value) => value.toLowerCase().includes(query)));
  recordings = [...recordings].sort((a, b) => sort === 'year' ? String(b.Date).localeCompare(String(a.Date)) : sort === 'duration' ? 0 : sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));
  document.querySelector('#collection-result-count').textContent = formatCount(recordings.length, 'recording');
  list.innerHTML = recordings.length ? recordings.map((recording, index) => { const selected = state.cart.some((item) => item._id === recording._id); return `<article class="recording-row"><div class="recording-row-top"><span class="recording-index">${String(index + 1).padStart(2, '0')}</span><strong class="recording-title">${recordingTitle(recording)}</strong><label class="check-control"><input class="recording-check" data-recording-id="${recording._id}" type="checkbox" ${selected ? 'checked' : ''}><span>Add</span></label></div>${recordingDetails(recording)}</article>`; }).join('') : '<div class="empty-state"><h3>No recordings found.</h3><p>Try another title, place, or keyword.</p></div>';
  list.querySelectorAll('.recording-check').forEach((checkbox) => checkbox.addEventListener('change', () => toggleCart(checkbox.dataset.recordingId)));
}
function renderWants() { const mediaFilter = document.querySelector('#wants-media-filter').value; const wants = state.wants.filter((want) => mediaFilter === 'all' || want['Audio / Video'] === mediaFilter).sort((a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b)))); document.querySelector('#wants-result-count').textContent = formatCount(wants.length, 'want'); document.querySelector('#wants-list').innerHTML = wants.length ? wants.map((want, index) => `<article class="recording-row"><div class="recording-row-top"><span class="recording-index">${String(index + 1).padStart(2, '0')}</span><strong class="recording-title">${recordingTitle(want)}</strong></div>${recordingDetails(want)}</article>`).join('') : '<div class="empty-state"><h3>No wants found.</h3><p>Try another media format.</p></div>'; }
function toggleCart(id) { const recording = state.recordings.find((item) => item._id === id); const existingIndex = state.cart.findIndex((item) => item._id === id); if (existingIndex >= 0) state.cart.splice(existingIndex, 1); else state.cart.push(recording); renderAll(); }
function renderCart() { document.querySelector('#cart-count').textContent = state.cart.length; const items = document.querySelector('#cart-items'); const empty = document.querySelector('#cart-empty'); empty.style.display = state.cart.length ? 'none' : 'block'; items.innerHTML = state.cart.map((recording) => `<div class="cart-item"><div><h3>${recordingTitle(recording)}</h3><p>${recordingField(recording, 'Date')} / ${recordingField(recording, 'Trader Format')}</p></div><button class="remove-item" data-remove-id="${recording._id}" type="button">Remove</button></div>`).join(''); items.querySelectorAll('[data-remove-id]').forEach((button) => button.addEventListener('click', () => toggleCart(button.dataset.removeId))); }
function showRoute() { const route = location.hash.replace('#', '') || 'home'; const validRoute = ['home', 'collection', 'wants', 'cart'].includes(route) ? route : 'home'; document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === validRoute)); document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === validRoute)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function prepareEmail() { const emailInput = document.querySelector('#visitor-email'); const listInput = document.querySelector('#visitor-list'); if (!emailInput.checkValidity()) { emailInput.reportValidity(); return; } if (!listInput.checkValidity()) { listInput.reportValidity(); return; } if (!state.cart.length) { location.hash = 'collection'; return; } const email = emailInput.value.trim(); const listUrl = listInput.value.trim(); const note = document.querySelector('#visitor-note').value.trim(); const list = state.cart.map((recording) => `- ${recordingTitle(recording)} (${recordingField(recording, 'Date')})`).join('\n'); const subject = encodeURIComponent(`Recording request from ${email}`); const body = encodeURIComponent(`Hello,\n\nI would like to request these recordings:\n${list}\n\nMy email: ${email}\nMy full list: ${listUrl}${note ? `\n\nNote:\n${note}` : ''}\n\nThank you.`); location.href = `mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`; }

document.querySelector('#collection-search').addEventListener('input', renderRecordings); document.querySelector('#collection-media-filter').addEventListener('change', renderRecordings); document.querySelector('#collection-sort').addEventListener('change', renderRecordings); document.querySelector('#wants-media-filter').addEventListener('change', renderWants); document.querySelector('#wants-sort').addEventListener('change', renderWants); document.querySelector('#checkout-button').addEventListener('click', prepareEmail); window.addEventListener('hashchange', showRoute); document.addEventListener('keydown', (event) => { if (event.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { event.preventDefault(); location.hash = 'collection'; document.querySelector('#collection-search').focus(); } });
showRoute();
loadData().catch(() => { document.querySelector('#recording-list').innerHTML = '<div class="empty-state"><h3>Collection unavailable.</h3><p>Run this site from a local server so the CSV files can load.</p></div>'; });
