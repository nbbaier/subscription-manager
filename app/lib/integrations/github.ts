// GitHub Integration - Track commits, PRs, and activity
import { IntegrationService } from '../services/integration.ts';
import { UsageService } from '../services/usage.ts';
import { SubscriptionService } from '../services/subscription.ts';

// Types for GitHub API responses
interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
}

interface GitHubContribution {
  date: string;
  count: number;
}

interface GitHubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: {
    name: string;
  };
  payload?: {
    commits?: Array<{ message: string }>;
    action?: string;
    pull_request?: { title: string };
    issue?: { title: string };
  };
}

export interface GitHubSyncResult {
  success: boolean;
  eventsProcessed: number;
  commits: number;
  pullRequests: number;
  newUsageEvents: number;
  error?: string;
}

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubIntegration {
  // Fetch user profile
  static async getUserProfile(accessToken: string): Promise<GitHubUser> {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch profile: ${response.status}`);
    }

    return await response.json() as GitHubUser;
  }

  // Fetch recent events for the authenticated user
  static async fetchUserEvents(accessToken: string, page = 1): Promise<GitHubEvent[]> {
    // First get the username
    const user = await this.getUserProfile(accessToken);

    const response = await fetch(
      `${GITHUB_API_BASE}/users/${user.login}/events?page=${page}&per_page=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Token expired');
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return await response.json() as GitHubEvent[];
  }

  // Fetch contribution statistics (commits, PRs, issues)
  static async fetchContributionStats(accessToken: string): Promise<{
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
    recentRepos: string[];
  }> {
    const events = await this.fetchUserEvents(accessToken);

    let totalCommits = 0;
    let totalPRs = 0;
    let totalIssues = 0;
    const repoSet = new Set<string>();

    for (const event of events) {
      repoSet.add(event.repo.name);

      switch (event.type) {
        case 'PushEvent':
          totalCommits += event.payload?.commits?.length || 1;
          break;
        case 'PullRequestEvent':
          if (event.payload?.action === 'opened' || event.payload?.action === 'closed') {
            totalPRs++;
          }
          break;
        case 'IssuesEvent':
          if (event.payload?.action === 'opened' || event.payload?.action === 'closed') {
            totalIssues++;
          }
          break;
      }
    }

    return {
      totalCommits,
      totalPRs,
      totalIssues,
      recentRepos: Array.from(repoSet).slice(0, 10),
    };
  }

  // Group events by date
  static groupEventsByDate(events: GitHubEvent[]): Map<string, GitHubEvent[]> {
    const grouped = new Map<string, GitHubEvent[]>();

    for (const event of events) {
      const date = event.created_at.split('T')[0]; // YYYY-MM-DD
      const existing = grouped.get(date) || [];
      existing.push(event);
      grouped.set(date, existing);
    }

    return grouped;
  }

  // Calculate activity score for a day
  static calculateDailyActivityScore(events: GitHubEvent[]): {
    commits: number;
    prs: number;
    issues: number;
    reviews: number;
    total: number;
  } {
    let commits = 0;
    let prs = 0;
    let issues = 0;
    let reviews = 0;

    for (const event of events) {
      switch (event.type) {
        case 'PushEvent':
          commits += event.payload?.commits?.length || 1;
          break;
        case 'PullRequestEvent':
          prs++;
          break;
        case 'IssuesEvent':
          issues++;
          break;
        case 'PullRequestReviewEvent':
        case 'PullRequestReviewCommentEvent':
          reviews++;
          break;
      }
    }

    return {
      commits,
      prs,
      issues,
      reviews,
      total: commits + prs * 3 + issues * 2 + reviews * 2, // Weighted score
    };
  }

  // Sync usage data from GitHub
  static async syncUsage(): Promise<GitHubSyncResult> {
    try {
      // Get valid access token
      const accessToken = await IntegrationService.getValidAccessToken('github');
      if (!accessToken) {
        return {
          success: false,
          eventsProcessed: 0,
          commits: 0,
          pullRequests: 0,
          newUsageEvents: 0,
          error: 'Not connected to GitHub',
        };
      }

      IntegrationService.updateSyncStatus('github', 'syncing');

      // Get the integration to find linked subscription
      const integration = IntegrationService.getIntegration('github');
      let subscriptionId = integration?.subscription_id;

      // If no subscription linked, try to find a GitHub subscription
      if (!subscriptionId) {
        const subscriptions = SubscriptionService.getAllSubscriptions();
        const githubSub = subscriptions.find(
          s => s.name.toLowerCase().includes('github') ||
               s.name.toLowerCase().includes('copilot')
        );
        if (githubSub) {
          subscriptionId = githubSub.id;
          IntegrationService.linkToSubscription('github', subscriptionId);
        }
      }

      if (!subscriptionId) {
        return {
          success: false,
          eventsProcessed: 0,
          commits: 0,
          pullRequests: 0,
          newUsageEvents: 0,
          error: 'No GitHub subscription found. Please create a subscription for GitHub first.',
        };
      }

      // Fetch recent events
      const events = await this.fetchUserEvents(accessToken);

      if (events.length === 0) {
        IntegrationService.updateSyncStatus('github', 'connected');
        return {
          success: true,
          eventsProcessed: 0,
          commits: 0,
          pullRequests: 0,
          newUsageEvents: 0,
        };
      }

      // Get last sync timestamp to avoid duplicates
      const lastSyncAt = integration?.last_sync_at || 0;

      // Filter events newer than last sync
      const newEvents = events.filter(e => new Date(e.created_at).getTime() > lastSyncAt);

      // Group events by date and log usage
      const eventsByDate = this.groupEventsByDate(newEvents);
      let newUsageEvents = 0;
      let totalCommits = 0;
      let totalPRs = 0;

      for (const [date, dateEvents] of eventsByDate) {
        const activity = this.calculateDailyActivityScore(dateEvents);
        totalCommits += activity.commits;
        totalPRs += activity.prs;

        // Create timestamp for the date (end of day)
        const timestamp = new Date(date + 'T23:59:59Z').getTime();

        // Get repositories worked on
        const repos = [...new Set(dateEvents.map(e => e.repo.name.split('/')[1] || e.repo.name))];

        // Log usage event
        UsageService.logUsage({
          subscriptionId,
          source: 'api',
          usageType: 'action',
          quantity: activity.total, // Activity score as quantity
          unit: 'actions',
          timestamp,
          notes: `${activity.commits} commits, ${activity.prs} PRs, ${activity.issues} issues`,
          metadata: JSON.stringify({
            commits: activity.commits,
            pullRequests: activity.prs,
            issues: activity.issues,
            reviews: activity.reviews,
            repositories: repos.slice(0, 5),
            date,
          }),
        });

        newUsageEvents++;
      }

      IntegrationService.updateSyncStatus('github', 'connected');

      return {
        success: true,
        eventsProcessed: newEvents.length,
        commits: totalCommits,
        pullRequests: totalPRs,
        newUsageEvents,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      IntegrationService.updateSyncStatus('github', 'error', errorMsg);

      return {
        success: false,
        eventsProcessed: 0,
        commits: 0,
        pullRequests: 0,
        newUsageEvents: 0,
        error: errorMsg,
      };
    }
  }

  // Get activity summary
  static async getActivitySummary(accessToken: string): Promise<{
    recentEvents: number;
    commits: number;
    pullRequests: number;
    issues: number;
    topRepos: string[];
  }> {
    const stats = await this.fetchContributionStats(accessToken);

    return {
      recentEvents: stats.totalCommits + stats.totalPRs + stats.totalIssues,
      commits: stats.totalCommits,
      pullRequests: stats.totalPRs,
      issues: stats.totalIssues,
      topRepos: stats.recentRepos,
    };
  }
}
