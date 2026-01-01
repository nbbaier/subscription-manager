import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: Dashboard,
});

function Dashboard() {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<StatCard title="Monthly Total" value="$--" />
				<StatCard title="Yearly Total" value="$--" />
				<StatCard title="Active Subscriptions" value="--" />
				<StatCard title="Avg Value Score" value="--" />
			</div>

			<div className="bg-white rounded-xl shadow-sm p-6">
				<h3 className="text-xl font-semibold text-gray-900 mb-4">
					Welcome to Subscription Manager
				</h3>
				<p className="text-gray-600">
					Track your subscriptions, measure actual usage, and make data-driven
					decisions about what to keep or cancel.
				</p>
			</div>
		</div>
	);
}

function StatCard({ title, value }: { title: string; value: string }) {
	return (
		<div className="bg-white rounded-xl shadow-sm p-6">
			<h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
				{title}
			</h3>
			<p className="mt-2 text-3xl font-bold text-indigo-600">{value}</p>
		</div>
	);
}
