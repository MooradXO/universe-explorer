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
  root.innerHTML = `
    <header><span>DEEP-RANGE CARRIER</span><small>BCN-07</small></header>
    <strong class="base-ship-label__callsign"></strong>
    <div class="base-ship-label__telemetry"><span>ARCHIVE SIGNAL</span><b></b></div>
    <ul class="base-ship-label__records"></ul>
    <footer><i aria-hidden="true"></i><span>DOCKING LINK AVAILABLE</span></footer>
  `;

  const callsign = root.querySelector<HTMLElement>('.base-ship-label__callsign');
  const archiveScore = root.querySelector<HTMLElement>('.base-ship-label__telemetry b');
  const records = root.querySelector<HTMLUListElement>('.base-ship-label__records');
  if (callsign) callsign.textContent = data.username.toUpperCase();
  if (archiveScore) archiveScore.textContent = `${Math.max(0, data.totalStars)} SIG`;

  const topRecords = data.repositories.slice(0, 3);
  if (records && topRecords.length > 0) {
    for (const repository of topRecords) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const signal = document.createElement('b');
      name.textContent = repository.name || 'UNTITLED RECORD';
      signal.textContent = `${Math.max(0, repository.stargazers_count || 0)}`;
      item.append(name, signal);
      records.appendChild(item);
    }
  } else if (records) {
    const item = document.createElement('li');
    item.className = 'base-ship-label__records-empty';
    item.textContent = 'LOCAL PILOT · ARCHIVE OFFLINE';
    records.appendChild(item);
  }

  return root;
}
