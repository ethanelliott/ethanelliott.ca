(() => {
  const overlay = document.getElementById('drop-overlay');
  const input = document.getElementById('file-input');
  const toast = document.getElementById('toast');
  let toastTimer;

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 3000);
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList).filter(
      (f) =>
        f.type === 'text/html' || /\.(html?|xhtml)$/i.test(f.name) || !f.type
    );
    if (files.length === 0) {
      showToast('Only HTML files are supported', true);
      return;
    }
    let uploaded = 0;
    for (const file of files) {
      try {
        const content = await file.text();
        const res = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        uploaded++;
      } catch (err) {
        showToast(`${file.name}: ${err.message}`, true);
        return;
      }
    }
    showToast(`Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'}`);
    setTimeout(() => window.location.reload(), 600);
  }

  // Whole-page drop zone. dragenter/dragleave fire on children too, so
  // track depth to know when the pointer actually leaves the window.
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    overlay.hidden = false;
  });
  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.hidden = true;
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
  });

  // File picker
  document.querySelectorAll('#pick-file').forEach((btn) =>
    btn.addEventListener('click', () => input.click())
  );
  input.addEventListener('change', () => {
    if (input.files.length) uploadFiles(input.files);
    input.value = '';
  });

  // Rename
  document.querySelectorAll('.rename-file').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const name = prompt('Name this share:', btn.dataset.name);
      if (name === null || !name.trim()) return;
      const res = await fetch(`/api/files/${btn.dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const item = btn.closest('.file');
        item.querySelector('.file-name').textContent = name.trim();
        btn.dataset.name = name.trim();
        showToast('Renamed');
      } else {
        showToast('Rename failed', true);
      }
    })
  );

  // Copy share links
  document.querySelectorAll('.copy-link').forEach((btn) =>
    btn.addEventListener('click', () => {
      navigator.clipboard
        .writeText(`${window.location.origin}/v/${btn.dataset.id}`)
        .then(() => showToast('Link copied'));
    })
  );

  // Delete
  document.querySelectorAll('.delete-file').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this file? The share link will stop working.')) {
        return;
      }
      const res = await fetch(`/api/files/${btn.dataset.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        btn.closest('.file')?.remove();
        showToast('Deleted');
      } else {
        showToast('Delete failed', true);
      }
    })
  );
})();
