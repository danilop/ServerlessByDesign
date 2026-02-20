import * as bootstrap from 'bootstrap';

const BG_CLASS: Record<string, string> = {
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning text-dark',
  error: 'bg-danger'
};

export function showToast(message: string, type: string = 'info'): void {
  const container = document.getElementById('toastContainer') as HTMLElement;
  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center border-0 ${BG_CLASS[type] || BG_CLASS.info}`;
  if (type !== 'warning') toastEl.classList.add('text-white');
  toastEl.setAttribute('role', 'alert');

  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex';

  const body = document.createElement('div');
  body.className = 'toast-body';
  body.style.whiteSpace = 'pre-line';
  body.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `btn-close me-2 m-auto${type !== 'warning' ? ' btn-close-white' : ''}`;
  closeBtn.setAttribute('data-bs-dismiss', 'toast');
  closeBtn.setAttribute('aria-label', 'Close');

  wrapper.appendChild(body);
  wrapper.appendChild(closeBtn);
  toastEl.appendChild(wrapper);
  container.appendChild(toastEl);

  const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  toast.show();
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('confirmModal') as HTMLElement;
    (document.getElementById('confirmMessage') as HTMLElement).textContent = message;
    const modal = new bootstrap.Modal(modalEl);
    let confirmed = false;

    const yesBtn = document.getElementById('confirmYes') as HTMLElement;
    const yesHandler = () => { confirmed = true; modal.hide(); };
    yesBtn.addEventListener('click', yesHandler, { once: true });

    modalEl.addEventListener('hidden.bs.modal', () => {
      yesBtn.removeEventListener('click', yesHandler);
      resolve(confirmed);
    }, { once: true });

    modal.show();
  });
}
