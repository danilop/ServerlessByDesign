interface OptionLike {
  name?: string;
  [key: string]: unknown;
}

export function setSelectOptions(id: string, options: Record<string, string | OptionLike>, message?: string): void {
  const el = document.getElementById(id) as HTMLSelectElement;
  el.innerHTML = '';
  if (message) {
    const defaultOpt = document.createElement('option');
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    defaultOpt.value = '';
    defaultOpt.textContent = message;
    el.appendChild(defaultOpt);
  }
  for (const [key, value] of Object.entries(options)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = (typeof value === 'object' && 'name' in value) ? value.name! : value as string;
    el.appendChild(opt);
  }
}

export function networkHeight(): void {
  const h = window.innerHeight - (document.getElementById('header') as HTMLElement).offsetHeight - 40;
  const w = (document.querySelector('.container-fluid') as HTMLElement).offsetWidth - 20;
  const nc = document.getElementById('networkContainer') as HTMLElement;
  nc.style.height = h + 'px';
  nc.style.width = w + 'px';
}
