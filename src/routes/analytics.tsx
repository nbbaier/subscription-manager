import { createFileRoute } from "@tanstack/react-router";
import { SpendingBreakdown } from "../components/charts/spending-breakdown";
import { SpendingTrend } from "../components/charts/spending-trend";
import { UsageTrend } from "../components/charts/usage-trend";

export const Route = createFileRoute("/analytics")({
	component: Analytics,
});

const mockUsageData = [
	{ date: "Jan", usage: 12 },
	{ date: "Feb", usage: 19 },
	{ date: "Mar", usage: 15 },
	{ date: "Apr", usage: 22 },
	{ date: "May", usage: 30 },
	{ date: "Jun", usage: 25 },
];

const mockSpendingData = [
	{ name: "Streaming", value: 4500, color: "#6366f1" },
	{ name: "Productivity", value: 3000, color: "#ec4899" },
	{ name: "Gaming", value: 1500, color: "#f59e0b" },
	{ name: "Music", value: 1200, color: "#10b981" },
];

const mockSpendingTrendData = [
	{ month: "Jan", amount: 9500 },
	{ month: "Feb", amount: 10200 },
	{ month: "Mar", amount: 9800 },
	{ month: "Apr", amount: 11000 },
	{ month: "May", amount: 12500 },
	{ month: "Jun", amount: 10200 },
];

function Analytics() {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold text-gray-900">Analytics</h2>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div className="bg-white rounded-xl shadow-sm p-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4">
						Monthly Spending Trend
					</h3>
					<SpendingTrend data={mockSpendingTrendData} />
				</div>

				<div className="bg-white rounded-xl shadow-sm p-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4">
						Spending by Category
					</h3>
					<SpendingBreakdown data={mockSpendingData} />
				</div>

				<div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
					<h3 className="text-lg font-semibold text-gray-900 mb-4">
						Usage Trend (All Subscriptions)
					</h3>
					<UsageTrend data={mockUsageData} />
				</div>
			</div>

			<div className="bg-white rounded-xl shadow-sm p-6">
				<p className="text-gray-600">
					Detailed analytics and value scores will be displayed here as more
					data is collected from your active subscriptions.
				</p>
			</div>
		</div>
	);
}
