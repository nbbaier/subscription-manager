// Integration service for OAuth and API integrations
import { db, nanoid } from '../db/index.ts';

// Types
export interface Integration {
  id: string;
  service_name: string;
  subscription_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
  scopes: string | null;
  last_sync_at: number | null;
  sync_status: 'disconnected' | 'connected' | 'syncing' | 'error' | 'expired';
  sync_error: string | null;
  config: string | null;
  created_at: number;
  updated_at: number;
}

export interface IntegrationConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  [key: string]: unknown;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

// Supported integrations
export const SUPPORTED_INTEGRATIONS = {
  spotify: {
    name: 'Spotify',
    description: 'Track listening hours automatically',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: ['user-read-recently-played', 'user-read-playback-state'],
    icon: '🎵',
  },
  github: {
    name: 'GitHub',
    description: 'Track commits, PRs, and activity',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'repo'],
    icon: '💻',
  },
} as const;

export type IntegrationServiceName = keyof typeof SUPPORTED_INTEGRATIONS;

export class IntegrationService {
  // Get all integrations
  static getAllIntegrations(): Integration[] {
    const stmt = db.prepare('SELECT * FROM integrations ORDER BY service_name');
    return stmt.all() as Integration[];
  }

  // Get integration by service name
  static getIntegration(serviceName: string): Integration | null {
    const stmt = db.prepare('SELECT * FROM integrations WHERE service_name = ?');
    return stmt.get(serviceName) as Integration | null;
  }

  // Create or update integration
  static upsertIntegration(serviceName: string, data: Partial<Integration>): Integration {
    const now = Date.now();
    const existing = this.getIntegration(serviceName);

    if (existing) {
      const updates: string[] = [];
      const values: unknown[] = [];

      for (const [key, value] of Object.entries(data)) {
        if (key !== 'id' && key !== 'service_name' && key !== 'created_at') {
          updates.push(`${key} = ?`);
          values.push(value);
        }
      }
      updates.push('updated_at = ?');
      values.push(now);
      values.push(serviceName);

      const stmt = db.prepare(`UPDATE integrations SET ${updates.join(', ')} WHERE service_name = ?`);
      stmt.run(...values);

      return this.getIntegration(serviceName)!;
    } else {
      const id = nanoid();
      const stmt = db.prepare(`
        INSERT INTO integrations (id, service_name, subscription_id, access_token, refresh_token,
          token_expires_at, scopes, last_sync_at, sync_status, sync_error, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        serviceName,
        data.subscription_id || null,
        data.access_token || null,
        data.refresh_token || null,
        data.token_expires_at || null,
        data.scopes || null,
        data.last_sync_at || null,
        data.sync_status || 'disconnected',
        data.sync_error || null,
        data.config || null,
        now,
        now
      );

      return this.getIntegration(serviceName)!;
    }
  }

  // Store OAuth tokens
  static storeTokens(serviceName: string, tokens: OAuthTokens): Integration {
    const expiresAt = tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null;

    return this.upsertIntegration(serviceName, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: expiresAt,
      scopes: tokens.scope || null,
      sync_status: 'connected',
      sync_error: null,
    });
  }

  // Check if token is expired
  static isTokenExpired(integration: Integration): boolean {
    if (!integration.token_expires_at) return false;
    // Consider token expired 5 minutes before actual expiry
    return Date.now() > (integration.token_expires_at - 5 * 60 * 1000);
  }

  // Disconnect integration
  static disconnect(serviceName: string): boolean {
    const stmt = db.prepare(`
      UPDATE integrations SET
        access_token = NULL,
        refresh_token = NULL,
        token_expires_at = NULL,
        sync_status = 'disconnected',
        sync_error = NULL,
        updated_at = ?
      WHERE service_name = ?
    `);
    const result = stmt.run(Date.now(), serviceName);
    return result.changes > 0;
  }

  // Update sync status
  static updateSyncStatus(serviceName: string, status: Integration['sync_status'], error?: string): void {
    const stmt = db.prepare(`
      UPDATE integrations SET
        sync_status = ?,
        sync_error = ?,
        last_sync_at = CASE WHEN ? = 'connected' THEN ? ELSE last_sync_at END,
        updated_at = ?
      WHERE service_name = ?
    `);
    const now = Date.now();
    stmt.run(status, error || null, status, now, now, serviceName);
  }

  // Link integration to a subscription
  static linkToSubscription(serviceName: string, subscriptionId: string): void {
    const stmt = db.prepare(`
      UPDATE integrations SET subscription_id = ?, updated_at = ? WHERE service_name = ?
    `);
    stmt.run(subscriptionId, Date.now(), serviceName);
  }

  // Get integration status summary
  static getIntegrationsSummary(): {
    connected: number;
    disconnected: number;
    error: number;
    integrations: Array<{
      service: string;
      name: string;
      icon: string;
      status: string;
      lastSync: number | null;
      subscriptionId: string | null;
    }>;
  } {
    const integrations = this.getAllIntegrations();
    const summary = {
      connected: 0,
      disconnected: 0,
      error: 0,
      integrations: [] as Array<{
        service: string;
        name: string;
        icon: string;
        status: string;
        lastSync: number | null;
        subscriptionId: string | null;
      }>,
    };

    // Include all supported integrations, even if not in DB yet
    for (const [service, info] of Object.entries(SUPPORTED_INTEGRATIONS)) {
      const integration = integrations.find(i => i.service_name === service);
      const status = integration?.sync_status || 'disconnected';

      if (status === 'connected' || status === 'syncing') {
        summary.connected++;
      } else if (status === 'error' || status === 'expired') {
        summary.error++;
      } else {
        summary.disconnected++;
      }

      summary.integrations.push({
        service,
        name: info.name,
        icon: info.icon,
        status,
        lastSync: integration?.last_sync_at || null,
        subscriptionId: integration?.subscription_id || null,
      });
    }

    return summary;
  }

  // Generate OAuth authorization URL
  static generateAuthUrl(serviceName: IntegrationServiceName, redirectUri: string, state?: string): string {
    const config = SUPPORTED_INTEGRATIONS[serviceName];
    if (!config) {
      throw new Error(`Unknown integration: ${serviceName}`);
    }

    const params = new URLSearchParams({
      client_id: process.env[`${serviceName.toUpperCase()}_CLIENT_ID`] || '',
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
      state: state || nanoid(16),
    });

    // Spotify-specific params
    if (serviceName === 'spotify') {
      params.set('show_dialog', 'true');
    }

    return `${config.authUrl}?${params.toString()}`;
  }

  // Exchange authorization code for tokens
  static async exchangeCodeForTokens(
    serviceName: IntegrationServiceName,
    code: string,
    redirectUri: string
  ): Promise<OAuthTokens> {
    const config = SUPPORTED_INTEGRATIONS[serviceName];
    if (!config) {
      throw new Error(`Unknown integration: ${serviceName}`);
    }

    const clientId = process.env[`${serviceName.toUpperCase()}_CLIENT_ID`] || '';
    const clientSecret = process.env[`${serviceName.toUpperCase()}_CLIENT_SECRET`] || '';

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Spotify uses Basic auth, GitHub uses body params
    if (serviceName === 'spotify') {
      headers['Authorization'] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    } else {
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
    }

    // GitHub needs Accept header for JSON response
    if (serviceName === 'github') {
      headers['Accept'] = 'application/json';
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await response.json() as OAuthTokens;
    return tokens;
  }

  // Refresh access token
  static async refreshAccessToken(serviceName: IntegrationServiceName): Promise<OAuthTokens | null> {
    const integration = this.getIntegration(serviceName);
    if (!integration?.refresh_token) {
      return null;
    }

    const config = SUPPORTED_INTEGRATIONS[serviceName];
    const clientId = process.env[`${serviceName.toUpperCase()}_CLIENT_ID`] || '';
    const clientSecret = process.env[`${serviceName.toUpperCase()}_CLIENT_SECRET`] || '';

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (serviceName === 'spotify') {
      headers['Authorization'] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    } else {
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
    }

    if (serviceName === 'github') {
      headers['Accept'] = 'application/json';
    }

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers,
        body: body.toString(),
      });

      if (!response.ok) {
        this.updateSyncStatus(serviceName, 'expired', 'Token refresh failed');
        return null;
      }

      const tokens = await response.json() as OAuthTokens;

      // Spotify doesn't return a new refresh token, keep the old one
      if (!tokens.refresh_token && integration.refresh_token) {
        tokens.refresh_token = integration.refresh_token;
      }

      this.storeTokens(serviceName, tokens);
      return tokens;
    } catch (error) {
      this.updateSyncStatus(serviceName, 'error', `Refresh failed: ${error}`);
      return null;
    }
  }

  // Get valid access token (refresh if needed)
  static async getValidAccessToken(serviceName: IntegrationServiceName): Promise<string | null> {
    const integration = this.getIntegration(serviceName);
    if (!integration?.access_token) {
      return null;
    }

    if (this.isTokenExpired(integration)) {
      const tokens = await this.refreshAccessToken(serviceName);
      return tokens?.access_token || null;
    }

    return integration.access_token;
  }

  // Delete integration
  static deleteIntegration(serviceName: string): boolean {
    const stmt = db.prepare('DELETE FROM integrations WHERE service_name = ?');
    const result = stmt.run(serviceName);
    return result.changes > 0;
  }
}
