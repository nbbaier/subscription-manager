import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Types
interface Stats {
	monthlyTotal: number;
	yearlyTotal: number;
	activeCount: number;
}

interface ValueScore {
	subscriptionId: string;
	subscriptionName: string;
	score: number;
	costPerUse: number | null;
	monthlyUsage: number;
	category: string;
}

interface Alert {
	type: "no_usage" | "low_value" | "high_cost" | "trial_ending";
	severity: "high" | "medium" | "low";
	subscriptionId: string;
	subscriptionName: string;
	message: string;
	value?: number;
}

interface Subscription {
	id: string;
	name: string;
	cost_cents: number;
	billing_frequency: string;
	next_billing_date: number | null;
	status: string;
}

export const Route = createFileRoute("/")({
	component: Dashboard,
});

function Dashboard() {
	const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
		queryKey: ["stats"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/subscriptions/stats`);
			if (!response.ok) throw new Error("Failed to fetch stats");
			return response.json();
		},
	});
	const { data: valueScores } = useQuery<ValueScore[]>({
		queryKey: ["valueScores"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/analytics/value-scores`);
			if (!response.ok) throw new Error("Failed to fetch value scores");
			return response.json();
		},
	});
	const { data: alerts } = useQuery<Alert[]>({
		queryKey: ["alerts"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/analytics/alerts`);
			if (!response.ok) throw new Error("Failed to fetch alerts");
			return response.json();
		},
	});
	const { data: subscriptions } = useQuery<Subscription[]>({
		queryKey: ["subscriptions"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/subscriptions`);
			if (!response.ok) throw new Error("Failed to fetch subscriptions");
			return response.json();
		},
	});

	// Calculate average value score
	const avgValueScore =
		valueScores && valueScores.length > 0
			? Math.round(
					valueScores.reduce((sum, v) => sum + v.score, 0) / valueScores.length,
				)
			: null;

	// Get upcoming bills (next 14 days)
	const now = Date.now();
	const twoWeeksFromNow = now + 14 * 24 * 60 * 60 * 1000;
	const upcomingBills = subscriptions
		?.filter(
			(s) =>
				s.status === "active" &&
				s.next_billing_date &&
				s.next_billing_date > now &&
				s.next_billing_date <= twoWeeksFromNow,
		)
		.sort((a, b) => (a.next_billing_date || 0) - (b.next_billing_date || 0))
		.slice(0, 5);

	// Format currency
	const formatCurrency = (cents: number) => {
		return `$${(cents / 100).toFixed(2)}`;
	};

	// Get score color
	const getScoreColor = (score: number) => {
		if (score >= 70) return "text-green-600";
		if (score >= 40) return "text-yellow-600";
		return "text-red-600";
	};

	// Get score badge variant
	const getScoreBadgeVariant = (score: number) => {
		if (score >= 70) return "default";
		if (score >= 40) return "secondary";
		return "destructive";
	};

	// Get alert severity color
	const getAlertColor = (severity: string) => {
		if (severity === "high") return "border-red-400 bg-red-50/50";
		if (severity === "medium") return "border-yellow-400 bg-yellow-50/50";
		return "border-gray-200 bg-gray-50/50";
	};

	const getAlertIcon = (severity: string) => {
		if (severity === "high") return "🔴";
		if (severity === "medium") return "🟡";
		return "⚪";
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-3xl font-bold text-gray-900 tracking-tight">
					Dashboard
				</h2>
				<Link
					to="/subscriptions"
					className={cn(buttonVariants({ variant: "default" }))}
				>
					+ Add Subscription
				</Link>
			</div>

			{/* Stats Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatCard
					title="Monthly Total"
					value={
						statsLoading ? "..." : formatCurrency(stats?.monthlyTotal || 0)
					}
					loading={statsLoading}
				/>
				<StatCard
					title="Yearly Total"
					value={statsLoading ? "..." : formatCurrency(stats?.yearlyTotal || 0)}
					loading={statsLoading}
				/>
				<StatCard
					title="Active Subscriptions"
					value={statsLoading ? "..." : String(stats?.activeCount || 0)}
					loading={statsLoading}
				/>
				<StatCard
					title="Avg Value Score"
					value={avgValueScore !== null ? `${avgValueScore}` : "--"}
					loading={!valueScores}
					valueColor={
						avgValueScore !== null ? getScoreColor(avgValueScore) : undefined
					}
				/>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Alerts Section */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							⚠️ Needs Attention
						</CardTitle>
						<CardDescription>
							Subscriptions that might need your review
						</CardDescription>
					</CardHeader>
					<CardContent>
						{!alerts || alerts.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No alerts - everything looks good!
							</p>
						) : (
							<div className="space-y-3">
								{alerts.slice(0, 5).map((alert, i) => (
									<Link
										key={`${alert.subscriptionId}-${i}`}
										to="/subscriptions"
										className={cn(
											"block p-3 rounded-lg border border-l-4 transition-all hover:shadow-sm",
											getAlertColor(alert.severity),
										)}
									>
										<div className="flex items-start gap-2">
											<span>{getAlertIcon(alert.severity)}</span>
											<div>
												<p className="font-semibold text-gray-900">
													{alert.subscriptionName}
												</p>
												<p className="text-sm text-gray-600">{alert.message}</p>
											</div>
										</div>
									</Link>
								))}
								{alerts.length > 5 && (
									<Link
										to="/analytics"
										className="text-sm text-primary hover:underline font-medium block pt-2"
									>
										View all {alerts.length} alerts →
									</Link>
								)}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Upcoming Bills Section */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							📅 Upcoming Bills
						</CardTitle>
						<CardDescription>Renewals in the next 14 days</CardDescription>
					</CardHeader>
					<CardContent>
						{!upcomingBills || upcomingBills.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No upcoming bills in the next 14 days
							</p>
						) : (
							<div className="space-y-3">
								{upcomingBills.map((sub) => (
									<div
										key={sub.id}
										className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
									>
										<div>
											<p className="font-semibold text-gray-900">{sub.name}</p>
											<p className="text-xs text-muted-foreground uppercase font-medium">
												{sub.next_billing_date
													? format(
															new Date(sub.next_billing_date),
															"MMM d, yyyy",
														)
													: "Unknown"}
											</p>
										</div>
										<p className="font-bold text-gray-900">
											{formatCurrency(sub.cost_cents)}
										</p>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Value Rankings Section */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						📊 Value Rankings
					</CardTitle>
					<CardDescription>
						How much value you're getting based on actual usage
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!valueScores || valueScores.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Add subscriptions and log usage to see value rankings
						</p>
					) : (
						<div className="space-y-3">
							{valueScores.slice(0, 6).map((vs) => (
								<div
									key={vs.subscriptionId}
									className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border hover:bg-muted/50 transition-colors"
								>
									<div className="flex items-center gap-4">
										<span
											className={cn(
												"font-black text-2xl w-10 text-center",
												getScoreColor(vs.score),
											)}
										>
											{vs.score}
										</span>
										<div>
											<p className="font-semibold text-gray-900">
												{vs.subscriptionName}
											</p>
											<p className="text-xs text-muted-foreground">
												{vs.costPerUse !== null
													? `$${(vs.costPerUse / 100).toFixed(2)}/use`
													: "No usage data"}
												{vs.monthlyUsage > 0 &&
													` · ${vs.monthlyUsage} uses this month`}
											</p>
										</div>
									</div>
									<Badge variant={getScoreBadgeVariant(vs.score)}>
										{vs.score >= 70
											? "Great"
											: vs.score >= 40
												? "OK"
												: "Review"}
									</Badge>
								</div>
							))}
							{valueScores.length > 6 && (
								<Link
									to="/analytics"
									className="block text-center text-sm text-primary hover:underline font-medium pt-4"
								>
									View all {valueScores.length} subscriptions →
								</Link>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function StatCard({
	title,
	value,
	loading,
	valueColor,
}: {
	title: string;
	value: string;
	loading?: boolean;
	valueColor?: string;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p
					className={cn(
						"text-3xl font-bold tracking-tight",
						valueColor || "text-primary",
					)}
				>
					{loading ? (
						<span className="inline-block w-20 h-8 bg-muted animate-pulse rounded" />
					) : (
						value
					)}
				</p>
			</CardContent>
		</Card>
	);
}
