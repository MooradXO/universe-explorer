import './styles/base-ship-label.css';

interface RepositorySummary {
  name?: string;
  stargazers_count?: number;
}

interface BaseShipLabelData {
  username: string;
  totalStars: number;
  repositories: RepositorySummary[];
}

export function createBaseShipLabel(data: BaseShipLabelData): HTMLElement {
  const root = document.createElement('article');
  root.className = 'base-ship-label';
  root.innerHTML = `<strong class="base-ship-label__callsign"></strong><span class="base-ship-label__dock">CARRIER · DOCKING AVAILABLE</span>`;
  root.querySelector<HTMLElement>('.base-ship-label__callsign')!.textContent = data.username.toUpperCase();

  return root;
}
