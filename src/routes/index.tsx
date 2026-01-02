import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";

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
	const {
		data: stats,
		isLoading: statsLoading,
		error: _statsError,
	} = useQuery<Stats>({
		queryKey: ["stats"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/subscriptions/stats`);
			if (!response.ok) throw new Error("Failed to fetch stats");
			return response.json();
		},
	});
	const { data: valueScores, error: _valueScoresError } = useQuery<
		ValueScore[]
	>({
		queryKey: ["valueScores"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/analytics/value-scores`);
			if (!response.ok) throw new Error("Failed to fetch value scores");
			return response.json();
		},
	});
	const { data: alerts, error: _alertsError } = useQuery<Alert[]>({
		queryKey: ["alerts"],
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/api/analytics/alerts`);
			if (!response.ok) throw new Error("Failed to fetch alerts");
			return response.json();
		},
	});
	const { data: subscriptions, error: _subscriptionsError } = useQuery<
		Subscription[]
	>({
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

	// Get score badge
	const getScoreBadge = (score: number) => {
		if (score >= 70) return "bg-green-100 text-green-800";
		if (score >= 40) return "bg-yellow-100 text-yellow-800";
		return "bg-red-100 text-red-800";
	};

	// Get alert severity color
	const getAlertColor = (severity: string) => {
		if (severity === "high") return "border-red-400 bg-red-50";
		if (severity === "medium") return "border-yellow-400 bg-yellow-50";
		return "border-gray-300 bg-gray-50";
	};

	const getAlertIcon = (severity: string) => {
		if (severity === "high") return "🔴";
		if (severity === "medium") return "🟡";
		return "⚪";
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
				<Link
					to="/subscriptions"
					className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
				>
					+ Add Subscription
				</Link>
			</div>

			{/* Stats Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
				<div className="bg-white rounded-xl shadow-sm p-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
						⚠️ Needs Attention
					</h3>
					{!alerts || alerts.length === 0 ? (
						<p className="text-gray-500 text-sm">
							No alerts - everything looks good!
						</p>
					) : (
						<div className="space-y-3">
							{alerts.slice(0, 5).map((alert, i) => (
								<Link
									key={`${alert.subscriptionId}-${i}`}
									to="/subscriptions"
									className={`block p-3 rounded-lg border-l-4 ${getAlertColor(alert.severity)} hover:shadow-sm transition-shadow`}
								>
									<div className="flex items-start gap-2">
										<span>{getAlertIcon(alert.severity)}</span>
										<div>
											<p className="font-medium text-gray-900">
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
									className="text-sm text-indigo-600 hover:underline"
								>
									View all {alerts.length} alerts →
								</Link>
							)}
						</div>
					)}
				</div>

				{/* Upcoming Bills Section */}
				<div className="bg-white rounded-xl shadow-sm p-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
						📅 Upcoming Bills (Next 14 Days)
					</h3>
					{!upcomingBills || upcomingBills.length === 0 ? (
						<p className="text-gray-500 text-sm">
							No upcoming bills in the next 14 days
						</p>
					) : (
						<div className="space-y-3">
							{upcomingBills.map((sub) => (
								<div
									key={sub.id}
									className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
								>
									<div>
										<p className="font-medium text-gray-900">{sub.name}</p>
										<p className="text-sm text-gray-500">
											{sub.next_billing_date
												? format(new Date(sub.next_billing_date), "MMM d, yyyy")
												: "Unknown"}
										</p>
									</div>
									<p className="font-semibold text-gray-900">
										{formatCurrency(sub.cost_cents)}
									</p>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Value Rankings Section */}
			<div className="bg-white rounded-xl shadow-sm p-6">
				<h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
					📊 Value Rankings
				</h3>
				{!valueScores || valueScores.length === 0 ? (
					<p className="text-gray-500 text-sm">
						Add subscriptions and log usage to see value rankings
					</p>
				) : (
					<div className="space-y-3">
						{valueScores.slice(0, 6).map((vs) => (
							<div
								key={vs.subscriptionId}
								className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
							>
								<div className="flex items-center gap-3">
									<span
										className={`font-bold text-lg ${getScoreColor(vs.score)}`}
									>
										{vs.score}
									</span>
									<div>
										<p className="font-medium text-gray-900">
											{vs.subscriptionName}
										</p>
										<p className="text-sm text-gray-500">
											{vs.costPerUse !== null
												? `$${(vs.costPerUse / 100).toFixed(2)}/use`
												: "No usage data"}
											{vs.monthlyUsage > 0 &&
												` · ${vs.monthlyUsage} uses this month`}
										</p>
									</div>
								</div>
								<span
									className={`px-2 py-1 rounded text-xs font-medium ${getScoreBadge(vs.score)}`}
								>
									{vs.score >= 70 ? "Great" : vs.score >= 40 ? "OK" : "Review"}
								</span>
							</div>
						))}
						{valueScores.length > 6 && (
							<Link
								to="/analytics"
								className="block text-center text-sm text-indigo-600 hover:underline pt-2"
							>
								View all {valueScores.length} subscriptions →
							</Link>
						)}
					</div>
				)}
			</div>
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
		<div className="bg-white rounded-xl shadow-sm p-6">
			<h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
				{title}
			</h3>
			<p
				className={`mt-2 text-3xl font-bold ${valueColor || "text-indigo-600"}`}
			>
				{loading ? (
					<span className="inline-block w-20 h-8 bg-gray-200 animate-pulse rounded" />
				) : (
					value
				)}
			</p>
		</div>
	);
}
