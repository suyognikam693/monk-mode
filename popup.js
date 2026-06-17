'use strict';

function setMode(mode) {
  chrome.storage.local.set({ mode }, () => {
    document.getElementById('blindfold').classList.toggle('active', mode === 'blindfold');
    document.getElementById('handcuff').classList.toggle('active', mode === 'handcuff');
    chrome.tabs.query({ url: 'https://www.youtube.com/*' }, tabs => {
      tabs.forEach(t => chrome.tabs.reload(t.id));
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get({ mode: 'blindfold' }, ({ mode }) => {
    document.getElementById(mode).classList.add('active');
  });

  // Attach click listeners here — no inline onclick
  document.getElementById('blindfold').addEventListener('click', () => setMode('blindfold'));
  document.getElementById('handcuff').addEventListener('click', () => setMode('handcuff'));
});
