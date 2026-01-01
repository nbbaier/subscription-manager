import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics")({
	component: Analytics,
});

function Analytics() {
	return (
		<div className="space-y-6">
			<h2 className="text-3xl font-bold text-gray-900">Analytics</h2>
			<div className="bg-white rounded-xl shadow-sm p-6">
				<p className="text-gray-600">
					View usage trends, spending breakdowns, and value scores here.
				</p>
			</div>
		</div>
	);
}
