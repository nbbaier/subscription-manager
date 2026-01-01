// Popup script for Subscription Tracker Extension

interface Status {
  isOnline: boolean;
  activeSessions: Array<{ domain: string; seconds: number }>;
  pendingEvents: number;
  trackedDomains: number;
}

// Format seconds to human readable
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

// Update UI with status
function updateUI(status: Status): void {
  // Status indicator
  const statusDot = document.getElementById('statusDot')!;
  const statusText = document.getElementById('statusText')!;

  if (status.isOnline) {
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Connected to Subscription Manager';
  } else {
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Offline - events will sync later';
  }

  // Stats
  document.getElementById('trackedCount')!.textContent = String(status.trackedDomains);
  document.getElementById('activeCount')!.textContent = String(status.activeSessions.length);
  document.getElementById('pendingCount')!.textContent = String(status.pendingEvents);

  // Pending badge
  const pendingBadge = document.getElementById('pendingBadge')!;
  if (status.pendingEvents > 0) {
    pendingBadge.style.display = 'inline-flex';
    pendingBadge.textContent = String(status.pendingEvents);
  } else {
    pendingBadge.style.display = 'none';
  }

  // Active sessions
  const sessionsContainer = document.getElementById('activeSessions')!;

  if (status.activeSessions.length === 0) {
    sessionsContainer.innerHTML = '<div class="empty-state">No active sessions</div>';
  } else {
    sessionsContainer.innerHTML = status.activeSessions
      .sort((a, b) => b.seconds - a.seconds)
      .map(session => `
        <div class="session-item">
          <span class="session-domain">${session.domain}</span>
          <span class="session-time">${formatTime(session.seconds)}</span>
        </div>
      `)
      .join('');
  }
}

// Fetch and display status
async function refreshStatus(): Promise<void> {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as Status;
    updateUI(status);
  } catch (error) {
    console.error('Failed to get status:', error);
  }
}

// Sync now button
document.getElementById('syncBtn')!.addEventListener('click', async () => {
  const btn = document.getElementById('syncBtn')!;
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Syncing...';
  btn.setAttribute('disabled', 'true');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' }) as { synced: number; failed: number };
    btn.innerHTML = `Synced ${result.synced} events`;

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.removeAttribute('disabled');
      refreshStatus();
    }, 2000);
  } catch (error) {
    btn.innerHTML = 'Sync failed';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.removeAttribute('disabled');
    }, 2000);
  }
});

// Refresh domains button
document.getElementById('refreshBtn')!.addEventListener('click', async () => {
  const btn = document.getElementById('refreshBtn')!;
  const originalText = btn.textContent;
  btn.textContent = 'Refreshing...';
  btn.setAttribute('disabled', 'true');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'REFRESH_MAPPINGS' }) as { success: boolean; count: number };
    btn.textContent = `Updated ${result.count} domains`;

    setTimeout(() => {
      btn.textContent = originalText;
      btn.removeAttribute('disabled');
      refreshStatus();
    }, 2000);
  } catch (error) {
    btn.textContent = 'Refresh failed';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.removeAttribute('disabled');
    }, 2000);
  }
});

// Initial load
refreshStatus();

// Refresh every 5 seconds while popup is open
setInterval(refreshStatus, 5000);
