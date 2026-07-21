/**
 * Shared types for stats utilities
 * Extracted to break circular dependencies between stats modules
 */

export interface Library {
	id: string;
	repo: string;
	frameworks?: string[];
}

export interface GitHubStats {
	starCount: number;
	contributorCount: number;
	dependentCount?: number; // Scraped from GitHub web UI
	forkCount?: number;
	repositoryCount?: number; // Only for org-level stats
}

export interface NpmPackageStats {
	downloads: number;
	ratePerDay?: number; // Downloads per day (growth rate for interpolation)
	updatedAt?: number; // Timestamp when these stats were fetched (ms since epoch)
}

export interface NpmStats {
	totalDownloads: number;
	packages?: string;
	// Per-package stats with rate information
	packageStats?: Record<string, NpmPackageStats>;
	// Aggregate rate and timestamp for animating the total
	ratePerDay?: number; // Aggregate downloads per day across all packages (growth rate)
	updatedAt?: number; // Most recent update timestamp across all packages (ms since epoch)
}

export interface OSSStats {
	github: GitHubStats;
	npm: NpmStats;
}

export interface OSSStatsWithDelta extends OSSStats {
	delta?: {
		github?: {
			starCount?: number;
			contributorCount?: number;
			dependentCount?: number;
			forkCount?: number;
		};
		npm?: {
			totalDownloads?: number;
		};
	};
	// Time between previous and current stats (in milliseconds)
	// Used to calculate rate of change for animation interpolation
	timeDelta?: number;
}

export type StatsQueryParams = {
	library?: {
		id: string;
		npmPackageNames?: string[];
		repo: string;
		frameworks?: string[];
	};
};

export type RecentDownloadStatsQueryParams = {
	library: {
		id: string;
		frameworks?: string[];
		npmPackageNames?: string[];
		repo?: string;
	};
};

export type RecentDownloadStats = {
	dailyDownloads: number;
	monthlyDownloads: number;
	previousWeeklyDownloads: number;
	sparklineDownloads: Array<{
		day: string;
		downloads: number;
	}>;
	updatedAt: number;
	weeklyDownloads: number;
};
